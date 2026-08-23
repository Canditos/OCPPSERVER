from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.transaction import Transaction, MeterValue
from models.user import User
from schemas import TransactionOut, MeterValueOut

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    cp_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    # Fetch all users to map RFID -> user info
    user_res = await db.execute(select(User))
    users = user_res.scalars().all()
    user_by_tag = {u.rfid_tag: u for u in users if u.rfid_tag}

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
        if tx.meter_stop is not None and tx.meter_start is not None:
            d.energy_kwh = round(max(0, tx.meter_stop - tx.meter_start) / 1000, 3)
        elif tx.status == "Active":
            # calculate from latest meter value if active
            mv_res = await db.execute(
                select(MeterValue)
                .where(MeterValue.transaction_id == tx.transaction_id)
                .order_by(MeterValue.timestamp.desc())
                .limit(5)
            )
            mvs = mv_res.scalars().all()
            for mv in mvs:
                if mv.measurand and 'energy' in mv.measurand.lower():
                    consumed = float(mv.value) - (tx.meter_start or 0)
                    if consumed > 0:
                        d.energy_kwh = round(consumed / 1000, 3)
                    break

        user = user_by_tag.get(tx.id_tag)
        if user:
            d.user_username = user.username
            d.user_email = user.email
            d.user_role = user.role

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


@router.get("/active/{cp_id}", response_model=TransactionOut | None)
async def get_active_transaction(cp_id: str, db: AsyncSession = Depends(get_db)):
    """Get the currently active transaction for a charger."""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.charge_point_id == cp_id, Transaction.status == "Active")
        .order_by(Transaction.start_time.desc())
        .limit(1)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        return None
    d = TransactionOut.model_validate(tx)
    if tx.meter_stop is not None:
        d.energy_kwh = round((tx.meter_stop - tx.meter_start) / 1000, 3)

    if tx.id_tag:
        u_res = await db.execute(select(User).where(User.rfid_tag == tx.id_tag))
        user = u_res.scalar_one_or_none()
        if user:
            d.user_username = user.username
            d.user_email = user.email
            d.user_role = user.role

    return d
