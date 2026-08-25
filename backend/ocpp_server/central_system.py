import asyncio
import logging
import websockets
from websockets.server import WebSocketServerProtocol

import event_bus
from database import AsyncSessionLocal
from models.charger import Charger
from sqlalchemy import update, select

from ocpp_server.charge_point import ChargePoint
from ocpp_server.charge_point_v201 import ChargePointV201

logger = logging.getLogger(__name__)

CONNECTED: dict[str, ChargePoint | ChargePointV201] = {}


# ── FastAPI WebSocket adapter ────────────────────────────────────────────────

class _FastAPIWSAdapter:
    """Bridges FastAPI/Starlette WebSocket to the interface the ocpp library expects."""

    def __init__(self, ws):
        self._ws = ws

    async def send(self, message: str) -> None:
        await self._ws.send_text(message)

    async def recv(self) -> str:
        return await self._ws.receive_text()

    @property
    def remote_address(self):
        client = getattr(self._ws, "client", None)
        if client:
            return (client.host, client.port)
        return ("unknown", 0)


async def _cleanup(charge_point_id: str) -> None:
    CONNECTED.pop(charge_point_id, None)
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Charger)
            .where(Charger.charge_point_id == charge_point_id)
            .values(is_online=False, status="Offline")
        )
        await db.commit()
    await event_bus.publish("charger_disconnected", {"charge_point_id": charge_point_id})
    logger.info(f"Charger cleaned up: {charge_point_id}")


async def on_connect_fastapi(websocket, charge_point_id: str, ocpp_version: str = "1.6") -> None:
    """Handle OCPP connection coming in through a FastAPI WebSocket route (1.6 or 2.0.1)."""
    from starlette.websockets import WebSocketDisconnect

    client_ip = "unknown"
    if (client := getattr(websocket, "client", None)):
        client_ip = client.host

    if charge_point_id in CONNECTED:
        logger.warning(f"Charger {charge_point_id} reconnected, replacing old connection")

    adapter = _FastAPIWSAdapter(websocket)
    if ocpp_version == "2.0.1":
        cp = ChargePointV201(charge_point_id, adapter)
        logger.info(f"Dual-Stack: Charger connected as OCPP 2.0.1 (Plug & Charge): {charge_point_id} from {client_ip}")
    else:
        cp = ChargePoint(charge_point_id, adapter, client_ip)
        logger.info(f"Dual-Stack: Charger connected as OCPP 1.6-J: {charge_point_id} from {client_ip}")

    CONNECTED[charge_point_id] = cp

    # Immediately mark as online in database
    try:
        from datetime import datetime
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Charger).where(Charger.charge_point_id == charge_point_id))
            charger_row = result.scalar_one_or_none()
            if charger_row:
                charger_row.is_online = True
                charger_row.ocpp_version = ocpp_version
                charger_row.last_seen = datetime.utcnow()
                if charger_row.status == "Offline":
                    charger_row.status = "Available"
                await db.commit()
    except Exception as e:
        logger.warning(f"Error marking charger {charge_point_id} online in DB: {e}")

    await event_bus.publish("charger_connected", {
        "charge_point_id": charge_point_id,
        "is_online": True,
        "status": "Available",
        "ocpp_version": ocpp_version,
    })

    try:
        await cp.start()
    except WebSocketDisconnect:
        logger.info(f"Charger disconnected: {charge_point_id}")
    except Exception as exc:
        logger.exception(f"Error handling charger {charge_point_id}: {exc}")
    finally:
        await _cleanup(charge_point_id)


# ── Legacy standalone server (local dev alternative) ────────────────────────

async def on_connect(websocket: WebSocketServerProtocol, path: str):
    charge_point_id = path.strip("/").split("/")[-1]
    client_ip = websocket.remote_address[0] if websocket.remote_address else "unknown"

    cp = ChargePoint(charge_point_id, websocket, client_ip)
    CONNECTED[charge_point_id] = cp
    logger.info(f"Charger connected (standalone): {charge_point_id} from {client_ip}")

    try:
        await cp.start()
    except websockets.exceptions.ConnectionClosedOK:
        logger.info(f"Charger disconnected: {charge_point_id}")
    except websockets.exceptions.ConnectionClosedError as e:
        logger.warning(f"Charger {charge_point_id} closed with error: {e}")
    except Exception as e:
        logger.exception(f"Error handling charger {charge_point_id}: {e}")
    finally:
        await _cleanup(charge_point_id)


async def start_ocpp_server(host: str = "0.0.0.0", port: int = 9000):
    logger.info(f"Starting standalone OCPP 1.6 server on ws://{host}:{port}")
    server = await websockets.serve(on_connect, host, port, subprotocols=["ocpp1.6"])
    return server


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_charge_point(cp_id: str) -> ChargePoint | None:
    return CONNECTED.get(cp_id)


def get_all_connected() -> list[str]:
    return list(CONNECTED.keys())
