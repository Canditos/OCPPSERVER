from fastapi import APIRouter, HTTPException
from ocpp_server.central_system import get_charge_point
from schemas import (
    RemoteStartRequest, RemoteStopRequest, ResetRequest,
    ChangeConfigRequest, GetConfigRequest, UnlockConnectorRequest,
    ChangeAvailabilityRequest, TriggerMessageRequest, ClearCacheRequest,
    ReserveNowRequest, CancelReservationRequest, UpdateFirmwareRequest,
    GetDiagnosticsRequest, SendLocalListRequest,
)

router = APIRouter(prefix="/commands", tags=["commands"])


def _get_cp(cp_id: str):
    cp = get_charge_point(cp_id)
    if not cp:
        raise HTTPException(
            status_code=404,
            detail=f"O posto '{cp_id}' não está ligado ao servidor (Offline). Ligue o posto ou inicie o simulador para enviar comandos remotos."
        )
    return cp


@router.post("/remote-start")
async def remote_start(req: RemoteStartRequest):
    cp = _get_cp(req.charge_point_id)
    conn_id = req.connector_id if req.connector_id is not None else 1
    resp = await cp.remote_start_transaction(req.id_tag, conn_id)
    status_str = getattr(resp, "status", None) or "Accepted"
    if hasattr(status_str, "value"):
        status_str = status_str.value
    return {"status": str(status_str)}


@router.post("/remote-stop")
async def remote_stop(req: RemoteStopRequest):
    import logging
    from database import AsyncSessionLocal
    from sqlalchemy import select
    from models.transaction import Transaction
    from models.charger import Charger, Connector
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)
    now = datetime.now(timezone.utc)
    tx_id = req.transaction_id
    active_tx = None

    async with AsyncSessionLocal() as db:
        if tx_id is not None and tx_id != 0:
            res = await db.execute(
                select(Transaction).where(
                    Transaction.charge_point_id == req.charge_point_id,
                    Transaction.transaction_id == tx_id
                )
            )
            active_tx = res.scalar_one_or_none()
        
        if not active_tx:
            # Auto-detect latest active transaction for this charger
            res = await db.execute(
                select(Transaction)
                .where(
                    Transaction.charge_point_id == req.charge_point_id,
                    Transaction.status == "Active"
                )
                .order_by(Transaction.start_time.desc())
                .limit(1)
            )
            active_tx = res.scalar_one_or_none()

        if active_tx:
            tx_id = active_tx.transaction_id

    cp = get_charge_point(req.charge_point_id)

    # 1. If charger is connected, dispatch RemoteStop over WebSocket
    if cp:
        try:
            resp = await cp.remote_stop_transaction(tx_id)
            status_str = getattr(resp, "status", None) or "Accepted"
            if hasattr(status_str, "value"):
                status_str = status_str.value
            return {"status": str(status_str), "transaction_id": tx_id}
        except Exception as err:
            logger.warning(f"RemoteStop dispatch error for {req.charge_point_id}: {err}")

    # 2. If charger is offline or failed to respond, gracefully close the transaction in database
    if active_tx:
        async with AsyncSessionLocal() as db:
            r = await db.execute(select(Transaction).where(Transaction.id == active_tx.id))
            db_tx = r.scalar_one_or_none()
            if db_tx and db_tx.status == "Active":
                db_tx.status = "Completed"
                db_tx.stop_time = now
                db_tx.stop_reason = "Remote"
                
                # Reset connector status to Available
                r_c = await db.execute(select(Charger).where(Charger.charge_point_id == req.charge_point_id))
                c_row = r_c.scalar_one_or_none()
                if c_row:
                    r_conns = await db.execute(select(Connector).where(Connector.charger_id == c_row.id))
                    for conn in r_conns.scalars().all():
                        if conn.status in ("Charging", "Preparing", "SuspendedEV", "SuspendedEVSE"):
                            conn.status = "Available"
                            conn.updated_at = now
                await db.commit()
        return {
            "status": "Accepted",
            "transaction_id": tx_id,
            "message": "Sessão de carregamento terminada com sucesso."
        }

    raise HTTPException(status_code=404, detail=f"Nenhuma sessão de carregamento ativa encontrada para o posto '{req.charge_point_id}'.")


@router.post("/reset")
async def reset(req: ResetRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.reset(req.reset_type)
    return {"status": resp.status if resp else "error"}


@router.post("/change-configuration")
async def change_configuration(req: ChangeConfigRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.change_configuration(req.key, req.value)
    return {"status": resp.status if resp else "error"}


@router.post("/get-configuration")
async def get_configuration(req: GetConfigRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.get_configuration(req.keys)
    if not resp:
        return {"configuration_key": [], "unknown_key": []}
    return {
        "configuration_key": resp.configuration_key or [],
        "unknown_key": resp.unknown_key or [],
    }


@router.post("/clear-cache")
async def clear_cache(req: ClearCacheRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.clear_cache()
    return {"status": resp.status if resp else "error"}


@router.post("/unlock-connector")
async def unlock_connector(req: UnlockConnectorRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.unlock_connector(req.connector_id)
    return {"status": resp.status if resp else "error"}


@router.post("/change-availability")
async def change_availability(req: ChangeAvailabilityRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.change_availability(req.connector_id, req.availability_type)
    return {"status": resp.status if resp else "error"}


@router.post("/trigger-message")
async def trigger_message(req: TriggerMessageRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.trigger_message(req.requested_message, req.connector_id)
    return {"status": resp.status if resp else "error"}


@router.post("/reserve-now")
async def reserve_now(req: ReserveNowRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.reserve_now(
        req.connector_id, req.expiry_date, req.id_tag, req.reservation_id
    )
    return {"status": resp.status if resp else "error"}


@router.post("/cancel-reservation")
async def cancel_reservation(req: CancelReservationRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.cancel_reservation(req.reservation_id)
    return {"status": resp.status if resp else "error"}


@router.post("/update-firmware")
async def update_firmware(req: UpdateFirmwareRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.update_firmware(req.location, req.retrieve_date, req.retries)
    return {"filename": resp.file_name if resp else None}


@router.post("/get-diagnostics")
async def get_diagnostics(req: GetDiagnosticsRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.get_diagnostics(req.location, req.retries)
    return {"filename": resp.file_name if resp else None}


@router.post("/send-local-list")
async def send_local_list(req: SendLocalListRequest):
    cp = _get_cp(req.charge_point_id)
    resp = await cp.send_local_list(req.version, req.update_type, req.local_authorization_list)
    return {"status": resp.status if resp else "error"}


@router.post("/get-local-list-version")
async def get_local_list_version(charge_point_id: str):
    cp = _get_cp(charge_point_id)
    resp = await cp.get_local_list_version()
    return {"list_version": resp.list_version if resp else -1}


@router.get("/connected")
async def list_connected():
    from ocpp_server.central_system import get_all_connected
    return {"connected": get_all_connected()}
