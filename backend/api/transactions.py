from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.transaction import Transaction, MeterValue
from schemas import TransactionOut, MeterValueOut

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    cp_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction).order_by(Transaction.start_time.desc()).limit(limit)
    if cp_id:
        q = q.where(Transaction.charge_point_id == cp_id)
    if status:
        q = q.where(Transaction.status == status)
    result = await db.execute(q)
    txs = result.scalars().all()
    out = []
    for tx in txs:
        d = TransactionOut.model_validate(tx)
        if tx.meter_stop is not None:
            d.energy_kwh = round((tx.meter_stop - tx.meter_start) / 1000, 3)
        out.append(d)
    return out


@router.get("/{tx_id}/meter-values", response_model=list[MeterValueOut])
async def get_meter_values(tx_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MeterValue)
        .where(MeterValue.transaction_id == tx_id)
        .order_by(MeterValue.timestamp.asc())
    )
    return list(result.scalars().all())


@router.get("/charger/{cp_id}/meter-values/live", response_model=list[MeterValueOut])
async def live_meter_values(cp_id: str, connector_id: int = 1, limit: int = 60, db: AsyncSession = Depends(get_db)):
    from models.charger import Charger
    result = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = result.scalar_one_or_none()
    if not charger:
        return []
    r2 = await db.execute(
        select(MeterValue)
        .where(MeterValue.charger_id == charger.id, MeterValue.connector_id == connector_id)
        .order_by(MeterValue.timestamp.desc())
        .limit(limit)
    )
    return list(reversed(r2.scalars().all()))
