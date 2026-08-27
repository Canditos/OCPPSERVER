import os
import time
from collections import defaultdict
import hmac
import hashlib
import json
import base64
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from database import get_db
from models.user import User
from models.transaction import Transaction, MeterValue
from models.charger import Charger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# ── Dynamic Security Configuration ───────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "ocpp_canditos_secret_key_2026_super_secure_jwt_token")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", "72"))

# ── In-Memory Rate Limiter (Brute-Force & DDoS Mitigation) ───────────────────
_rate_limits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # 1 minute window
RATE_LIMIT_MAX_ATTEMPTS = 15  # Max 15 attempts per minute per IP

def check_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    # Honor X-Forwarded-For if behind trusted proxy
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        
    now = time.time()
    valid_attempts = [t for t in _rate_limits[client_ip] if now - t < RATE_LIMIT_WINDOW]
    _rate_limits[client_ip] = valid_attempts
    
    if len(valid_attempts) >= RATE_LIMIT_MAX_ATTEMPTS:
        logger.warning(f"Rate limit exceeded for IP {client_ip} on auth endpoint")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas tentativas de acesso. Por favor, aguarda 1 minuto antes de tentar novamente.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
        )
    _rate_limits[client_ip].append(now)


# ── Password & Token Helpers ──────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a unique salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100_000)
    return f"{salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored salt and PBKDF2 hash."""
    try:
        salt, key_hex = hashed_password.split('$', 1)
        test_key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt.encode('utf-8'), 100_000)
        return hmac.compare_digest(test_key.hex(), key_hex)
    except Exception:
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def _b64url_decode(s: str) -> bytes:
    pad = '=' * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode((s + pad).encode('utf-8'))


def create_access_token(user_id: int, username: str, role: str) -> str:
    """Generate a self-signed JWT token using HS256."""
    header = {"alg": "HS256", "typ": "JWT"}
    exp = int((datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)).timestamp())
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": exp,
        "iat": int(datetime.utcnow().timestamp())
    }
    
    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signature_base = f"{header_b64}.{payload_b64}".encode('utf-8')
    sig = hmac.new(JWT_SECRET.encode('utf-8'), signature_base, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)
    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> dict:
    """Decode and verify JWT signature and expiration."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid token format")
        header_b64, payload_b64, sig_b64 = parts
        
        signature_base = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_sig = hmac.new(JWT_SECRET.encode('utf-8'), signature_base, hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Invalid signature")
            
        payload = json.loads(_b64url_decode(payload_b64).decode('utf-8'))
        exp = payload.get("exp", 0)
        if datetime.utcnow().timestamp() > exp:
            raise ValueError("Token expired")
        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Sessão inválida ou expirada: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Dependencies ─────────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    user_id = int(payload.get("sub", 0))
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilizador não encontrado ou inativo")
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a Administradores")
    return current_user


# ── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class ActiveUserCharge(BaseModel):
    transaction_id: int
    charge_point_id: str
    connector_id: int
    start_time: Optional[str] = None
    current_power_kw: float = 0.0
    consumed_kwh: float = 0.0


class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: str
    rfid_tag: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None
    total_kwh: Optional[float] = 0.0
    total_sessions: Optional[int] = 0
    active_charge: Optional[ActiveUserCharge] = None
    last_charge_time: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class RegisterDriverRequest(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=4)
    requested_rfid_tag: Optional[str] = None


class ApproveUserRequest(BaseModel):
    rfid_tag: str = Field(..., min_length=1)


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3)
    full_name: Optional[str] = None
    password: str = Field(..., min_length=4)
    email: str = Field(..., min_length=5)
    role: str = "user"  # 'admin' or 'user'
    rfid_tag: Optional[str] = None


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    rfid_tag: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/register")
async def register_driver(req: RegisterDriverRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Public self-registration for new drivers (pending admin approval)."""
    check_rate_limit(request)
    import random
    from services.email_service import notify_driver_registration_received

    if not req.email or "@" not in req.email:
        raise HTTPException(status_code=400, detail="Email obrigatório e válido para contacto.")

    # Check if email is already registered
    existing_email = await db.execute(select(User).where(func.lower(User.email) == req.email.strip().lower()))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este endereço de email já se encontra associado a uma conta.")

    # Calculate full_name if given first_name/last_name
    calc_name = req.full_name
    if not calc_name and (req.first_name or req.last_name):
        calc_name = f"{req.first_name or ''} {req.last_name or ''}".strip()
    if not calc_name:
        calc_name = req.email.split("@")[0]

    # Calculate username: either provided or derived from email/name
    if req.username and req.username.strip():
        clean_username = req.username.strip().lower().replace(" ", ".")
    elif req.first_name and req.last_name:
        clean_username = f"{req.first_name.strip().lower()}.{req.last_name.strip().lower()}".replace(" ", ".")
    else:
        clean_username = req.email.split("@")[0].lower().replace(" ", ".")

    # If username exists, make it unique
    existing = await db.execute(select(User).where(User.username == clean_username))
    if existing.scalar_one_or_none():
        if req.username:
            raise HTTPException(status_code=400, detail="Este nome de utilizador já se encontra registado.")
        clean_username = f"{clean_username}{random.randint(10, 99)}"

    hashed = hash_password(req.password)
    user = User(
        username=clean_username,
        full_name=calc_name,
        email=req.email.strip(),
        hashed_password=hashed,
        role="user",
        rfid_tag=req.requested_rfid_tag.strip().upper() if req.requested_rfid_tag else None,
        is_active=False,  # Needs admin approval!
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Send confirmation email to driver
    try:
        notify_driver_registration_received(user.email, user.full_name or user.username, user.rfid_tag)
    except Exception as e:
        logger.error(f"Error sending registration email: {e}")

    return {
        "status": "pending_approval",
        "message": "Pedido de registo submetido com sucesso! A tua conta aguarda aprovação pelo Administrador e atribuição de chave RFID.",
        "username": user.username,
        "full_name": user.full_name,
    }


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user with username OR email and password, returning JWT token."""
    check_rate_limit(request)
    login_input = req.username.strip().lower()
    
    # Check by username OR email (case-insensitive)
    result = await db.execute(
        select(User).where(
            (func.lower(User.username) == login_input) |
            (func.lower(User.email) == login_input)
        )
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email/Nome de utilizador ou palavra-passe incorretos")
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A tua conta de condutor ainda aguarda aprovação pelo Administrador e atribuição de chave RFID."
        )
        
    token = create_access_token(user.id, user.username, user.role)
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "rfid_tag": user.rfid_tag,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    }


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get profile of current logged-in user with personal consumption stats."""
    total_kwh = 0.0
    total_sessions = 0
    last_charge_time = None
    active_charge_data = None
    
    if current_user.rfid_tag:
        r_tx = await db.execute(
            select(Transaction)
            .where(Transaction.id_tag == current_user.rfid_tag)
            .order_by(Transaction.start_time.desc())
        )
        txs = r_tx.scalars().all()
        total_sessions = len(txs)
        if txs and txs[0].start_time:
            last_charge_time = txs[0].start_time.isoformat()
            
        for tx in txs:
            if tx.meter_stop is not None and tx.meter_start is not None:
                wh = tx.meter_stop - tx.meter_start
                if wh > 0:
                    total_kwh += (wh / 1000.0)
            elif tx.status == "Active" and active_charge_data is None:
                mv_res = await db.execute(
                    select(MeterValue)
                    .where(MeterValue.transaction_id == tx.transaction_id)
                    .order_by(MeterValue.timestamp.desc())
                    .limit(6)
                )
                mvs = mv_res.scalars().all()
                latest_p = 0.0
                latest_e = tx.meter_start or 0
                for mv in mvs:
                    if mv.measurand and 'power' in mv.measurand.lower() and latest_p == 0.0:
                        latest_p = float(mv.value)
                    elif mv.measurand and 'energy' in mv.measurand.lower():
                        latest_e = float(mv.value)
                c_wh = max(0, latest_e - (tx.meter_start or 0))
                active_charge_data = {
                    "transaction_id": tx.transaction_id,
                    "charge_point_id": tx.charge_point_id,
                    "connector_id": tx.connector_id,
                    "start_time": tx.start_time.isoformat() if tx.start_time else None,
                    "current_power_kw": round(latest_p / 1000.0, 2),
                    "consumed_kwh": round(c_wh / 1000.0, 2),
                }
                    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "rfid_tag": current_user.rfid_tag,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "total_kwh": round(total_kwh, 2),
        "total_sessions": total_sessions,
        "active_charge": active_charge_data,
        "last_charge_time": last_charge_time,
    }


@router.get("/users", response_model=list[UserOut])
async def list_users(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) List all users with aggregated charging stats and real-time active charging info."""
    result = await db.execute(select(User).order_by(User.id.asc()))
    users = result.scalars().all()
    
    # Pre-fetch all transactions to calculate stats in memory
    tx_result = await db.execute(select(Transaction).order_by(Transaction.start_time.desc()))
    all_txs = tx_result.scalars().all()
    
    stats_by_tag: dict[str, dict] = {}
    last_time_by_tag: dict[str, str] = {}
    active_tx_by_tag: dict[str, Transaction] = {}

    for tx in all_txs:
        tag = tx.id_tag or ""
        if tag not in stats_by_tag:
            stats_by_tag[tag] = {"kwh": 0.0, "count": 0}
            if tx.start_time:
                last_time_by_tag[tag] = tx.start_time.isoformat()

        stats_by_tag[tag]["count"] += 1
        if tx.meter_stop is not None and tx.meter_start is not None:
            wh = tx.meter_stop - tx.meter_start
            if wh > 0:
                stats_by_tag[tag]["kwh"] += (wh / 1000.0)
        elif tx.status == "Active" and tag not in active_tx_by_tag:
            active_tx_by_tag[tag] = tx
                
    out = []
    for u in users:
        tag = u.rfid_tag or ""
        stats = stats_by_tag.get(tag, {"kwh": 0.0, "count": 0})
        
        active_charge_data = None
        active_tx = active_tx_by_tag.get(tag)
        if active_tx:
            mv_res = await db.execute(
                select(MeterValue)
                .where(MeterValue.transaction_id == active_tx.transaction_id)
                .order_by(MeterValue.timestamp.desc())
                .limit(6)
            )
            mvs = mv_res.scalars().all()
            latest_power_w = 0.0
            latest_energy_wh = active_tx.meter_start or 0
            for mv in mvs:
                if mv.measurand and 'power' in mv.measurand.lower() and latest_power_w == 0.0:
                    latest_power_w = float(mv.value)
                elif mv.measurand and 'energy' in mv.measurand.lower():
                    latest_energy_wh = float(mv.value)
                    
            consumed_wh = max(0, latest_energy_wh - (active_tx.meter_start or 0))
            active_charge_data = {
                "transaction_id": active_tx.transaction_id,
                "charge_point_id": active_tx.charge_point_id,
                "connector_id": active_tx.connector_id,
                "start_time": active_tx.start_time.isoformat() if active_tx.start_time else None,
                "current_power_kw": round(latest_power_w / 1000.0, 2),
                "consumed_kwh": round(consumed_wh / 1000.0, 2),
            }

        out.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "rfid_tag": u.rfid_tag,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "total_kwh": round(stats["kwh"], 2),
            "total_sessions": stats["count"],
            "active_charge": active_charge_data,
            "last_charge_time": last_time_by_tag.get(tag),
        })
    return out


@router.post("/users", response_model=UserOut)
async def create_user(
    req: CreateUserRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) Create a new user with role and optional RFID tag."""
    clean_username = req.username.strip().lower().replace(" ", ".")
    existing = await db.execute(select(User).where(User.username == clean_username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Nome de utilizador já existe")
        
    if not req.email or "@" not in req.email:
        raise HTTPException(status_code=400, detail="O email é obrigatório e deve ser válido para notificações de carregamento")

    hashed = hash_password(req.password)
    user = User(
        username=clean_username,
        full_name=req.full_name.strip() if req.full_name else clean_username,
        email=req.email.strip(),
        hashed_password=hashed,
        role=req.role if req.role in ("admin", "user") else "user",
        rfid_tag=req.rfid_tag.strip() if req.rfid_tag else None,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "rfid_tag": user.rfid_tag,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "total_kwh": 0.0,
        "total_sessions": 0,
    }


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    req: UpdateUserRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) Update an existing user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
    if req.full_name is not None:
        user.full_name = req.full_name.strip() if req.full_name else user.username
    if req.email is not None:
        if not req.email.strip() or "@" not in req.email:
            raise HTTPException(status_code=400, detail="O email é obrigatório e deve ser válido")
        user.email = req.email.strip()
    if req.role is not None and req.role in ("admin", "user"):
        user.role = req.role
    if req.rfid_tag is not None:
        user.rfid_tag = req.rfid_tag.strip() if req.rfid_tag else None
    if req.password:
        user.hashed_password = hash_password(req.password)
    if req.is_active is not None:
        user.is_active = req.is_active
        
    await db.commit()
    await db.refresh(user)
    
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "rfid_tag": user.rfid_tag,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "total_kwh": 0.0,
        "total_sessions": 0,
    }


@router.post("/users/{user_id}/approve", response_model=UserOut)
async def approve_user(
    user_id: int,
    req: ApproveUserRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) Approve a pending driver and assign them an active RFID tag."""
    from services.email_service import notify_driver_approved
    from models.authorized_tag import AuthorizedTag

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")

    rfid = req.rfid_tag.strip().upper()
    user.rfid_tag = rfid
    user.is_active = True
    user.role = "user"

    # Automatically ensure the tag is registered in the charger's white-list
    try:
        r_tag = await db.execute(select(AuthorizedTag).where(AuthorizedTag.id_tag == rfid))
        tag_row = r_tag.scalar_one_or_none()
        if not tag_row:
            new_tag = AuthorizedTag(
                id_tag=rfid,
                description=f"Condutor: {user.full_name or user.username}",
                is_active=True
            )
            db.add(new_tag)
        else:
            tag_row.is_active = True
    except Exception as e:
        logger.warning(f"Could not auto-create AuthorizedTag: {e}")

    await db.commit()
    await db.refresh(user)

    if user.email:
        try:
            notify_driver_approved(user.email, user.full_name or user.username, user.rfid_tag)
        except Exception as e:
            logger.error(f"Error sending approval email: {e}")

    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "rfid_tag": user.rfid_tag,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "total_kwh": 0.0,
        "total_sessions": 0,
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) Delete a user."""
    if admin_user.id == user_id:
        raise HTTPException(status_code=400, detail="Não é possível eliminar a sua própria conta de administrador")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
    await db.delete(user)
    await db.commit()
    return {"status": "deleted", "id": user_id}


@router.get("/my-transactions")
async def get_my_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all charging transactions belonging to the current user's RFID tag."""
    if not current_user.rfid_tag:
        return []
        
    result = await db.execute(
        select(Transaction)
        .where(Transaction.id_tag == current_user.rfid_tag)
        .order_by(Transaction.start_time.desc())
    )
    txs = result.scalars().all()
    
    out = []
    for tx in txs:
        kwh = 0.0
        if tx.meter_stop is not None and tx.meter_start is not None:
            wh = tx.meter_stop - tx.meter_start
            if wh > 0:
                kwh = wh / 1000.0
                
        out.append({
            "id": tx.id,
            "transaction_id": tx.transaction_id,
            "charge_point_id": tx.charge_point_id,
            "connector_id": tx.connector_id,
            "id_tag": tx.id_tag,
            "status": tx.status,
            "start_time": tx.start_time.isoformat() if tx.start_time else None,
            "stop_time": tx.stop_time.isoformat() if tx.stop_time else None,
            "meter_start": tx.meter_start,
            "meter_stop": tx.meter_stop,
            "kwh": round(kwh, 2),
            "stop_reason": tx.stop_reason,
        })
    return out


@router.get("/my-active-charge")
async def get_my_active_charge(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if the user currently has an active charging session on any charger."""
    from models.charger import Charger
    from models.connector import Connector

    q = select(Transaction).where(Transaction.status == "Active")
    if current_user.rfid_tag:
        q = q.where(
            (Transaction.id_tag == current_user.rfid_tag) |
            (Transaction.id_tag == f"TAG_{current_user.username.upper()}") |
            (Transaction.id_tag.ilike(f"%{current_user.username}%"))
        )
    elif current_user.role == "admin":
        # For admin user without specific tag, allow tracking latest active charge
        pass
    else:
        return None
        
    result = await db.execute(q.order_by(Transaction.start_time.desc()).limit(1))
    tx = result.scalar_one_or_none()
    if not tx:
        return None
        
    # Get latest meter values for this transaction (checking both internal tx.id and OCPP tx.transaction_id)
    mv_result = await db.execute(
        select(MeterValue)
        .where(
            (MeterValue.transaction_id == tx.id) | 
            (MeterValue.transaction_id == tx.transaction_id)
        )
        .order_by(MeterValue.timestamp.desc())
        .limit(20)
    )
    mvs = mv_result.scalars().all()
    
    latest_power_w = 0.0
    latest_energy_wh = tx.meter_start or 0
    latest_soc = None

    for mv in mvs:
        if mv.measurand:
            meas_lower = mv.measurand.lower()
            if 'power' in meas_lower and latest_power_w == 0.0:
                try:
                    latest_power_w = float(mv.value)
                except Exception:
                    pass
            elif 'energy' in meas_lower and latest_energy_wh == (tx.meter_start or 0):
                try:
                    latest_energy_wh = float(mv.value)
                except Exception:
                    pass
            elif 'soc' in meas_lower and latest_soc is None:
                try:
                    latest_soc = float(mv.value)
                except Exception:
                    pass

    # Fallback to Connector live telemetry if meter_values had no recent power
    r_conn = await db.execute(
        select(Connector).join(Charger, Connector.charger_id == Charger.id)
        .where(Charger.charge_point_id == tx.charge_point_id, Connector.connector_id == tx.connector_id)
    )
    conn = r_conn.scalar_one_or_none()
    if conn:
        if latest_power_w == 0.0 and conn.active_power_kw:
            latest_power_w = conn.active_power_kw * 1000.0
        if latest_soc is None and conn.active_soc is not None:
            latest_soc = float(conn.active_soc)
            
    consumed_wh = max(0, latest_energy_wh - (tx.meter_start or 0))
    
    return {
        "transaction_id": tx.transaction_id,
        "charge_point_id": tx.charge_point_id,
        "connector_id": tx.connector_id,
        "id_tag": tx.id_tag,
        "start_time": tx.start_time.isoformat() if tx.start_time else None,
        "meter_start": tx.meter_start,
        "current_power_kw": round(latest_power_w / 1000.0, 2),
        "consumed_kwh": round(consumed_wh / 1000.0, 2),
        "current_soc": round(latest_soc, 1) if latest_soc is not None else None,
        "status": "Charging"
    }


class NotifyMoveCarRequest(BaseModel):
    user_id: Optional[int] = None
    charge_point_id: Optional[str] = None
    connector_id: Optional[int] = 1


@router.post("/notify-move-car")
async def notify_move_car(
    req: NotifyMoveCarRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """(Admin only) Send a friendly notification email asking a driver to move their car."""
    from services.email_service import notify_manual_move_car_reminder
    
    target_user = None
    charge_point_id = req.charge_point_id or "Posto de Carregamento"
    connector_id = req.connector_id or 1
    current_kwh = 0.0

    if req.user_id:
        r_u = await db.execute(select(User).where(User.id == req.user_id))
        target_user = r_u.scalar_one_or_none()
    elif req.charge_point_id:
        # Find active transaction on this charge point
        r_tx = await db.execute(
            select(Transaction)
            .where(
                Transaction.charge_point_id == req.charge_point_id,
                Transaction.connector_id == connector_id,
                Transaction.status == "Active"
            )
            .order_by(Transaction.start_time.desc())
            .limit(1)
        )
        tx = r_tx.scalar_one_or_none()
        if tx and tx.id_tag:
            r_u = await db.execute(select(User).where(User.rfid_tag == tx.id_tag))
            target_user = r_u.scalar_one_or_none()
            if tx.meter_start is not None:
                r_mv = await db.execute(
                    select(MeterValue).where(MeterValue.transaction_id == tx.transaction_id)
                    .order_by(MeterValue.timestamp.desc()).limit(5)
                )
                for mv in r_mv.scalars().all():
                    if mv.measurand and 'energy' in mv.measurand.lower():
                        current_kwh = max(0, float(mv.value) - tx.meter_start) / 1000.0
                        break

    if not target_user or not target_user.email:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado ou sem email configurado")

    sent = notify_manual_move_car_reminder(
        to_email=target_user.email,
        username=target_user.username,
        charge_point_id=charge_point_id,
        connector_id=connector_id,
        requester_name=admin_user.username,
        current_kwh=current_kwh,
    )

    return {
        "status": "sent" if sent else "queued",
        "recipient": target_user.email,
        "username": target_user.username
    }

