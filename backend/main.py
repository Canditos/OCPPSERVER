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
from api.device_model import router as device_model_router
from api.simulator import router as simulator_router
from api.ocmf import router as ocmf_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)

app = FastAPI(title="OCPP 1.6 & 2.0.1 Dual-Stack Central System", version="2.0.0")

# ── CORS & Security Headers Middleware ─────────────────────────────────────────
cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
cors_origins = [orig.strip() for orig in cors_origins_env.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(auth_router)
app.include_router(chargers_router)
app.include_router(transactions_router)
app.include_router(commands_router)
app.include_router(configuration_router)
app.include_router(ws_router)
app.include_router(tags_router)
app.include_router(auth_tokens_router)
app.include_router(smart_charging_router)
app.include_router(device_model_router)
app.include_router(simulator_router)
app.include_router(ocmf_router)


@app.get("/health")
async def health():
    from ocpp_server.central_system import get_all_connected
    return {"status": "ok", "connected_chargers": len(get_all_connected())}


@app.websocket("/ocpp/{charge_point_id}")
@app.websocket("/ocpp/{charge_point_id}/")
@app.websocket("/ocpp16/{charge_point_id}")
@app.websocket("/ocpp16/{charge_point_id}/")
@app.websocket("/ocpp201/{charge_point_id}")
@app.websocket("/ocpp201/{charge_point_id}/")
@app.websocket("/ocppj/{charge_point_id}")
@app.websocket("/ocppj/{charge_point_id}/")
@app.websocket("/ws/{charge_point_id}")
@app.websocket("/ws/{charge_point_id}/")
@app.websocket("/ws/v201/{charge_point_id}")
@app.websocket("/ws/v201/{charge_point_id}/")
@app.websocket("/steve/websocket/CentralSystemService/{charge_point_id}")
@app.websocket("/steve/websocket/CentralSystemService/{charge_point_id}/")
async def ocpp_endpoint(websocket: WebSocket, charge_point_id: str):
    """
    Dual-Stack OCPP 1.6-J & OCPP 2.0.1 WebSocket endpoint.
    Supports Security Profile 0 (Open), Profile 1 (Basic Auth), Profile 2 (TLS + Basic Auth), Profile 3 (mTLS).
    Negotiates 'ocpp2.0.1' or 'ocpp1.6' based on Sec-WebSocket-Protocol header.
    """
    import base64
    import hmac
    from database import AsyncSessionLocal
    from models.charger import Charger
    from sqlalchemy import select

    auth_header = websocket.headers.get("authorization")
    client_ip = websocket.client.host if websocket.client else "unknown"

    # Query charger security settings
    requires_auth = False
    expected_password = None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Charger).where(Charger.charge_point_id == charge_point_id))
        charger_record = result.scalar_one_or_none()
        if charger_record:
            if (charger_record.security_profile and charger_record.security_profile >= 1) or charger_record.auth_enabled:
                requires_auth = True
                expected_password = charger_record.auth_password

    # Validate HTTP Basic Auth credentials if Security Profile >= 1
    if requires_auth:
        authenticated = False
        if auth_header and auth_header.lower().startswith("basic "):
            try:
                encoded_creds = auth_header.split(" ", 1)[1].strip()
                decoded_creds = base64.b64decode(encoded_creds).decode("utf-8")
                if ":" in decoded_creds:
                    user, pwd = decoded_creds.split(":", 1)
                    if user == charge_point_id and expected_password and hmac.compare_digest(pwd, expected_password):
                        authenticated = True
            except Exception as err:
                logging.warning(f"Error parsing Basic auth credentials from {charge_point_id}: {err}")

        if not authenticated:
            logging.warning(
                f"OCPP Security Violation: Unauthorized connection rejected from {charge_point_id} (IP: {client_ip}) - "
                f"Profile {charger_record.security_profile if charger_record else 1} requires valid HTTP Basic Auth credentials."
            )
            # 1008 = Policy Violation per RFC 6455 / OCPP 1.6 & 2.0.1 Security Whitepaper
            await websocket.close(code=1008, reason="Policy Violation: Invalid OCPP Credentials")
            return

    # Dual-Stack Subprotocol Negotiation
    subprotocols = websocket.headers.get("sec-websocket-protocol", "")
    ocpp_version = "1.6"
    if "ocpp2.0.1" in subprotocols or "ocpp2.0" in subprotocols or "v201" in websocket.url.path:
        ocpp_version = "2.0.1"
        await websocket.accept(subprotocol="ocpp2.0.1")
    elif "ocpp1.6" in subprotocols or "ocpp1.6j" in subprotocols or "ocpp1.5" in subprotocols:
        await websocket.accept(subprotocol="ocpp1.6")
    else:
        await websocket.accept()

    await on_connect_fastapi(websocket, charge_point_id, ocpp_version=ocpp_version)


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
            admin_initial_pwd = os.environ.get("ADMIN_INITIAL_PASSWORD", "admin123")
            user_initial_pwd = os.environ.get("USER_INITIAL_PASSWORD", "user123")
            admin = User(
                username="admin",
                email="admin@canditos.com",
                hashed_password=hash_password(admin_initial_pwd),
                role="admin",
                rfid_tag="ADMIN_MASTER",
                is_active=True,
            )
            sample_user = User(
                username="condutor",
                email="condutor@canditos.com",
                hashed_password=hash_password(user_initial_pwd),
                role="user",
                rfid_tag="VERSICHARGE_TAG",
                is_active=True,
            )
            session.add(admin)
            session.add(sample_user)
            await session.commit()
            logging.info("Default admin ('admin') and user ('condutor') created successfully.")

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
