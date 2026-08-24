from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
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
        
        # Calculate energy delivered (both completed and active transactions)
        if tx.meter_stop is not None and tx.meter_start is not None:
            d.energy_kwh = round(max(0, tx.meter_stop - tx.meter_start) / 1000, 3)
        elif tx.status == "Active":
            # For active transactions, calculate from latest Energy.Active.Import.Register meter value
            meter_result = await db.execute(
                select(MeterValue)
                .where(
                    MeterValue.transaction_id == tx.id,
                    MeterValue.measurand == 'Energy.Active.Import.Register'
                )
                .order_by(MeterValue.timestamp.desc())
                .limit(1)
            )
            latest_meter = meter_result.scalar_one_or_none()
            if latest_meter:
                meter_value = float(latest_meter.value)
                d.energy_kwh = round(max(0, meter_value - (tx.meter_start or 0)) / 1000, 3)

        # Map user info from RFID tag
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


@router.get("/{tx_id}/live-power")
async def get_live_power(tx_id: int, db: AsyncSession = Depends(get_db)):
    """Get latest power and energy reading for an active transaction."""
    # Get latest Power.Active.Import measurement
    power_result = await db.execute(
        select(MeterValue)
        .where(
            MeterValue.transaction_id == tx_id,
            MeterValue.measurand == 'Power.Active.Import'
        )
        .order_by(MeterValue.timestamp.desc())
        .limit(1)
    )
    power_meter = power_result.scalar_one_or_none()
    
    # Get latest Energy.Active.Import.Register measurement
    energy_result = await db.execute(
        select(MeterValue)
        .where(
            MeterValue.transaction_id == tx_id,
            MeterValue.measurand == 'Energy.Active.Import.Register'
        )
        .order_by(MeterValue.timestamp.desc())
        .limit(1)
    )
    energy_meter = energy_result.scalar_one_or_none()
    
    # Get transaction to get meter_start for calculation
    tx_result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    tx = tx_result.scalar_one_or_none()
    
    return {
        "power_w": float(power_meter.value) if power_meter else 0.0,
        "power_kw": float(power_meter.value) / 1000 if power_meter else 0.0,
        "energy_wh": float(energy_meter.value) if energy_meter else 0,
        "energy_kwh": round(float(energy_meter.value) / 1000, 3) if energy_meter else 0,
        "energy_delivered_kwh": round((float(energy_meter.value) - (tx.meter_start if tx else 0)) / 1000, 3) if energy_meter and tx else 0,
        "timestamp": power_meter.timestamp.isoformat() if power_meter else None,
    }


@router.get("/charger/{cp_id}/meter-values/live", response_model=list[MeterValueOut])
async def live_meter_values(cp_id: str, connector_id: int = Query(1), limit: int = Query(60), db: AsyncSession = Depends(get_db)):
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

@router.get("/{cp_id}/success-rate", response_model=dict)
async def get_charging_success_rate(cp_id: str, db: AsyncSession = Depends(get_db)):
    """Get charging success rate per connector for a charger."""
    from models.charger import Charger
    from sqlalchemy import func, cast, Integer, case
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"[SUCCESS_RATE] Fetching for charger: {cp_id}")
    
    result = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = result.scalar_one_or_none()
    if not charger:
        logger.info(f"[SUCCESS_RATE] Charger not found: {cp_id}")
        return {}
    
    # Get all transactions grouped by connector
    tx_result = await db.execute(
        select(
            Transaction.connector_id,
            func.count(Transaction.id).label('total'),
            func.sum(case((Transaction.status == 'Completed', 1), else_=0)).label('completed')
        )
        .where(Transaction.charge_point_id == cp_id)
        .group_by(Transaction.connector_id)
    )
    
    rates = {}
    for row in tx_result:
        connector_id = row[0]
        total = row[1] or 0
        completed = row[2] or 0
        success_rate = (completed / total * 100) if total > 0 else 0
        rates[str(connector_id)] = {
            'total_transactions': total,
            'completed_transactions': completed,
            'success_rate': round(success_rate, 1)
        }
    
    logger.info(f"[SUCCESS_RATE] Result for {cp_id}: {rates}")
    return rates
