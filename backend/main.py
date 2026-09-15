import asyncio
import logging
import os
import sys

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketDisconnect

from database import init_db
from ocpp_server.central_system import on_connect_fastapi
from api.chargers import router as chargers_router
from api.transactions import router as transactions_router
from api.commands import router as commands_router
from api.configuration import router as configuration_router
from api.ws_events import router as ws_router
from api.tags import router as tags_router
from api.auth_tokens import router as auth_tokens_router
from api.smart_charging import router as smart_charging_router
from api.auth import router as auth_router, hash_password
from api.ocmf import router as ocmf_router
from api.firmware_tests import router as firmware_tests_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)

app = FastAPI(title="OCPP 1.6 Central System", version="1.0.0")

_cors_origins = os.environ.get("CORS_ORIGINS", "").split(",")
_cors_origins = [o.strip() for o in _cors_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chargers_router)
app.include_router(transactions_router)
app.include_router(commands_router)
app.include_router(configuration_router)
app.include_router(ws_router)
app.include_router(tags_router)
app.include_router(auth_tokens_router)
app.include_router(smart_charging_router)
app.include_router(ocmf_router)
app.include_router(firmware_tests_router)


@app.get("/health")
async def health():
    from ocpp_server.central_system import get_all_connected
    return {"status": "ok", "connected_chargers": len(get_all_connected())}


@app.websocket("/ocpp/{charge_point_id}")
async def ocpp_endpoint(websocket: WebSocket, charge_point_id: str):
    """
    OCPP 1.6 WebSocket endpoint.
    Charger connects to: ws(s)://HOST/ocpp/{charge_point_id}
    """
    subprotocols = websocket.headers.get("sec-websocket-protocol", "")
    if "ocpp1.6" in subprotocols:
        await websocket.accept(subprotocol="ocpp1.6")
    else:
        await websocket.accept()

    await on_connect_fastapi(websocket, charge_point_id)


@app.on_event("startup")
async def startup():
    await init_db()
    from ocpp_server.charge_point import _init_tx_counter
    await _init_tx_counter()

    # Seed default admin and user if users table is empty
    from database import AsyncSessionLocal
    from models.user import User
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        if not result.scalar_one_or_none():
            import secrets as _secrets
            admin_pw = os.environ.get("ADMIN_DEFAULT_PASSWORD") or _secrets.token_urlsafe(16)
            admin = User(
                username="admin",
                email=os.environ.get("ADMIN_EMAIL", "admin@canditos.com"),
                hashed_password=hash_password(admin_pw),
                role="admin",
                rfid_tag="ADMIN_MASTER",
                is_active=True,
            )
            session.add(admin)
            await session.commit()
            if not os.environ.get("ADMIN_DEFAULT_PASSWORD"):
                logging.warning(f"Admin user created with generated password: {admin_pw} — change it immediately or set ADMIN_DEFAULT_PASSWORD env var")

    # Optionally still run standalone OCPP server on port 9000 for local dev
    if os.environ.get("OCPP_STANDALONE_PORT"):
        port = int(os.environ["OCPP_STANDALONE_PORT"])
        from ocpp_server.central_system import start_ocpp_server
        asyncio.create_task(_run_standalone(port))


async def _run_standalone(port: int):
    from ocpp_server.central_system import start_ocpp_server
    server = await start_ocpp_server(host="0.0.0.0", port=port)
    async with server:
        await server.wait_closed()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
