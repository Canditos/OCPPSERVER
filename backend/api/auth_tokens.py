from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update

from database import AsyncSessionLocal
from models.auth_token import AuthToken
from models.charger import Charger
from models.transaction import Transaction, MeterValue
from ocpp_server.central_system import get_charge_point

router = APIRouter(prefix="/auth-tokens", tags=["auth-tokens"])


class AuthTokenCreate(BaseModel):
    id_tag: str
    name: str
    type: str
    status: str = "Accepted"
    expiry_date: str | None = None
    note: str | None = None


class AuthTokenUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    expiry_date: str | None = None
    note: str | None = None


class AutochargeUpdate(BaseModel):
    enabled: bool


def _token_dict(t: AuthToken) -> dict:
    return {
        "id": t.id,
        "id_tag": t.id_tag,
        "name": t.name,
        "type": t.type,
        "status": t.status,
        "expiry_date": t.expiry_date.isoformat() if t.expiry_date else None,
        "note": t.note,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
async def list_tokens():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AuthToken).order_by(AuthToken.created_at.desc()))
        tokens = result.scalars().all()
        
        # Fetch consumption for each token
        out = []
        for t in tokens:
            token_dict = _token_dict(t)
            
            # Calculate total energy delivered for this id_tag
            energy_result = await db.execute(
                select(func.sum(MeterValue.value))
                .join(Transaction, MeterValue.transaction_id == Transaction.id)
                .where(
                    Transaction.id_tag == t.id_tag,
                    MeterValue.measurand == 'Energy.Active.Import.Register'
                )
            )
            total_energy_wh = energy_result.scalar() or 0
            token_dict["energy_kwh"] = round(total_energy_wh / 1000, 3)
            
            # Count sessions for this id_tag
            sessions_result = await db.execute(
                select(func.count(Transaction.id))
                .where(Transaction.id_tag == t.id_tag)
            )
            token_dict["sessions"] = sessions_result.scalar() or 0
            
            out.append(token_dict)
    
    return out


@router.get("/{id_tag}")
async def get_token_consumption(id_tag: str):
    """Get token details with consumption stats."""
    async with AsyncSessionLocal() as db:
        # Get the token
        result = await db.execute(select(AuthToken).where(AuthToken.id_tag == id_tag))
        token = result.scalar_one_or_none()
        if not token:
            raise HTTPException(status_code=404, detail="Token not found")
        
        token_dict = _token_dict(token)
        
        # Calculate total energy delivered
        energy_result = await db.execute(
            select(func.sum(MeterValue.value))
            .join(Transaction, MeterValue.transaction_id == Transaction.id)
            .where(
                Transaction.id_tag == id_tag,
                MeterValue.measurand == 'Energy.Active.Import.Register'
            )
        )
        total_energy_wh = energy_result.scalar() or 0
        token_dict["energy_kwh"] = round(total_energy_wh / 1000, 3)
        
        # Count sessions
        sessions_result = await db.execute(
            select(func.count(Transaction.id))
            .where(Transaction.id_tag == id_tag)
        )
        token_dict["sessions"] = sessions_result.scalar() or 0
        
        # Get latest session info
        latest_tx = await db.execute(
            select(Transaction)
            .where(Transaction.id_tag == id_tag)
            .order_by(Transaction.start_time.desc())
            .limit(1)
        )
        latest = latest_tx.scalar_one_or_none()
        if latest:
            token_dict["latest_session"] = {
                "start_time": latest.start_time.isoformat() if latest.start_time else None,
                "status": latest.status,
                "charge_point_id": latest.charge_point_id,
            }
    
    return token_dict
    expiry = None
    if body.expiry_date:
        try:
            expiry = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid expiry_date format")

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(AuthToken).where(AuthToken.id_tag == body.id_tag))).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="id_tag already exists")
        token = AuthToken(
            id_tag=body.id_tag,
            name=body.name,
            type=body.type,
            status=body.status,
            expiry_date=expiry,
            note=body.note,
        )
        db.add(token)
        await db.commit()
        await db.refresh(token)
    return _token_dict(token)


@router.put("/{token_id}")
async def update_token(token_id: int, body: AuthTokenUpdate):
    async with AsyncSessionLocal() as db:
        token = (await db.execute(select(AuthToken).where(AuthToken.id == token_id))).scalar_one_or_none()
        if not token:
            raise HTTPException(status_code=404, detail="Token not found")
        if body.name is not None:
            token.name = body.name
        if body.status is not None:
            token.status = body.status
        if body.note is not None:
            token.note = body.note
        if body.expiry_date is not None:
            try:
                token.expiry_date = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid expiry_date format")
        await db.commit()
        await db.refresh(token)
    return _token_dict(token)


@router.delete("/{token_id}")
async def delete_token(token_id: int):
    async with AsyncSessionLocal() as db:
        token = (await db.execute(select(AuthToken).where(AuthToken.id == token_id))).scalar_one_or_none()
        if not token:
            raise HTTPException(status_code=404, detail="Token not found")
        await db.delete(token)
        await db.commit()
    return {"ok": True}


@router.post("/sync/{charge_point_id}")
async def sync_to_charger(charge_point_id: str):
    cp = get_charge_point(charge_point_id)
    if not cp:
        raise HTTPException(status_code=404, detail=f"Charger '{charge_point_id}' not connected")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AuthToken).where(AuthToken.status == "Accepted"))
        tokens = result.scalars().all()

    local_list = [
        {"id_tag": t.id_tag, "id_tag_info": {"status": "Accepted"}}
        for t in tokens
    ]
    resp = await cp.send_local_list(
        version=1,
        update_type="Full",
        local_authorization_list=local_list,
    )
    return {"status": resp.status if resp else "error", "count": len(local_list)}
