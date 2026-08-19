from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.charger import Charger, Connector, OcppMessage
from schemas import ChargerOut, OcppMessageOut

router = APIRouter(prefix="/chargers", tags=["chargers"])


@router.get("", response_model=list[ChargerOut])
async def list_chargers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Charger).order_by(Charger.charge_point_id))
    chargers = result.scalars().all()
    out = []
    for ch in chargers:
        r2 = await db.execute(select(Connector).where(Connector.charger_id == ch.id))
        ch.connectors = list(r2.scalars().all())
        out.append(ch)
    return out


@router.get("/{cp_id}", response_model=ChargerOut)
async def get_charger(cp_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = result.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    r2 = await db.execute(select(Connector).where(Connector.charger_id == charger.id))
    charger.connectors = list(r2.scalars().all())
    return charger


@router.get("/{cp_id}/messages", response_model=list[OcppMessageOut])
async def get_messages(cp_id: str, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = result.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    r2 = await db.execute(
        select(OcppMessage)
        .where(OcppMessage.charger_id == charger.id)
        .order_by(OcppMessage.timestamp.desc())
        .limit(limit)
    )
    return list(r2.scalars().all())
