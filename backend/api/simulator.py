"""
Simulator Management API Router.
Enables launching and monitoring virtual OCPP 1.6 and OCPP 2.0.1 stations directly from the Web UI.
"""

import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from api.auth import require_admin, get_current_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulator", tags=["simulator"])

# Active background simulation tasks
ACTIVE_SIMULATION_TASK: Optional[asyncio.Task] = None
SIMULATION_STATE = {
    "is_running": False,
    "station_id": None,
    "ocpp_version": None,
    "started_at": None,
}


class LaunchSimulationRequest(BaseModel):
    station_id: str = Field("chargerPT_v201", min_length=3, max_length=64)
    ocpp_version: str = Field("2.0.1", pattern="^(1.6|2.0.1)$")
    duration_seconds: int = Field(15, ge=5, le=120)
    server_port: int = Field(8000, ge=80, le=65535)


async def _run_sim_bg(station_id: str, ocpp_version: str, duration: int, port: int):
    global SIMULATION_STATE
    SIMULATION_STATE["is_running"] = True
    SIMULATION_STATE["station_id"] = station_id
    SIMULATION_STATE["ocpp_version"] = ocpp_version
    import datetime
    SIMULATION_STATE["started_at"] = datetime.datetime.utcnow().isoformat()

    try:
        if ocpp_version == "2.0.1":
            import websockets
            from simulator_v201 import VirtualStationV201
            url = f"ws://127.0.0.1:{port}/ocpp/{station_id}"
            logger.info(f"Launching virtual OCPP 2.0.1 station on {url}")
            async with websockets.connect(url, subprotocols=["ocpp2.0.1"]) as ws:
                station = VirtualStationV201(station_id, ws)
                task = asyncio.create_task(station.start())
                await station.send_boot_notification()
                await asyncio.sleep(1)
                await station.send_device_model_report()
                await asyncio.sleep(1)
                await station.simulate_pnc_charge_session(duration_seconds=duration)
                await asyncio.sleep(2)
                task.cancel()
        else:
            import websockets
            from simulator_v16 import VirtualVersiChargeV16
            from ocpp.v16.enums import ChargePointErrorCode, ChargePointStatus
            from ocpp.v16 import call
            url = f"ws://127.0.0.1:{port}/ocpp/{station_id}"
            logger.info(f"Launching virtual OCPP 1.6-J station on {url}")
            async with websockets.connect(url, subprotocols=["ocpp1.6"]) as ws:
                station = VirtualVersiChargeV16(station_id, ws)
                task = asyncio.create_task(station.start())
                await station.send_boot_notification()
                await asyncio.sleep(1)
                await station.call(call.StatusNotificationPayload(
                    connector_id=1,
                    error_code=ChargePointErrorCode.no_error,
                    status=ChargePointStatus.available,
                ))
                await asyncio.sleep(1)
                await station.simulate_charge_session(id_tag="VERSICHARGE_TAG", duration_seconds=duration)
                await asyncio.sleep(2)
                task.cancel()
    except Exception as e:
        logger.warning(f"Simulator error during background run: {e}")
    finally:
        SIMULATION_STATE["is_running"] = False
        SIMULATION_STATE["station_id"] = None
        SIMULATION_STATE["ocpp_version"] = None


@router.get("/status")
async def get_simulator_status(user: User = Depends(get_current_user)):
    """Check if a virtual simulator station is currently running."""
    return SIMULATION_STATE


@router.post("/launch")
async def launch_simulation(
    req: LaunchSimulationRequest,
    user: User = Depends(get_current_user),
):
    """Launch a virtual OCPP station simulation in background."""
    global ACTIVE_SIMULATION_TASK
    if SIMULATION_STATE["is_running"]:
        raise HTTPException(status_code=409, detail="Já existe uma simulação em execução.")

    import os
    port = int(os.environ.get("PORT", "8000"))
    ACTIVE_SIMULATION_TASK = asyncio.create_task(
        _run_sim_bg(req.station_id, req.ocpp_version, req.duration_seconds, port)
    )

    return {
        "status": "started",
        "station_id": req.station_id,
        "ocpp_version": req.ocpp_version,
        "duration_seconds": req.duration_seconds,
        "message": f"Simulador {req.ocpp_version} iniciado com sucesso para '{req.station_id}'!",
    }


@router.post("/stop")
async def stop_simulation(admin: User = Depends(require_admin)):
    """Stop active simulation."""
    global ACTIVE_SIMULATION_TASK
    if ACTIVE_SIMULATION_TASK and not ACTIVE_SIMULATION_TASK.done():
        ACTIVE_SIMULATION_TASK.cancel()
    SIMULATION_STATE["is_running"] = False
    return {"status": "stopped"}
