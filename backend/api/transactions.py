from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models.transaction import Transaction, MeterValue
from models.user import User
from schemas import TransactionOut, MeterValueOut
from energy import delta_kwh, to_watt_hours

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _meter_value_tx_ids(tx: Transaction) -> list[int]:
    if tx.id == tx.transaction_id:
        return [tx.id]
    return [tx.id, tx.transaction_id]


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    cp_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = 100,
    include_empty: bool = Query(False),
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

    meter_ids = {
        meter_id
        for tx in txs
        for meter_id in _meter_value_tx_ids(tx)
    }
    latest_energy_by_id: dict[int, MeterValue] = {}
    meter_ids_with_values: set[int] = set()
    if meter_ids:
        latest_timestamp = (
            select(
                MeterValue.transaction_id.label("transaction_id"),
                func.max(MeterValue.timestamp).label("timestamp"),
            )
            .where(
                MeterValue.transaction_id.in_(meter_ids),
                MeterValue.measurand == "Energy.Active.Import.Register",
            )
            .group_by(MeterValue.transaction_id)
            .subquery()
        )
        latest_result = await db.execute(
            select(MeterValue).join(
                latest_timestamp,
                (MeterValue.transaction_id == latest_timestamp.c.transaction_id)
                & (MeterValue.timestamp == latest_timestamp.c.timestamp),
            )
        )
        for meter_value in latest_result.scalars().all():
            latest_energy_by_id[meter_value.transaction_id] = meter_value

        evidence_result = await db.execute(
            select(MeterValue.transaction_id)
            .where(MeterValue.transaction_id.in_(meter_ids))
            .distinct()
        )
        meter_ids_with_values = set(evidence_result.scalars().all())

    out = []
    for tx in txs:
        d = TransactionOut.model_validate(tx)
        
        # Prefer the final counter, but use the latest meter value when a
        # charger omitted it or reported the same counter at stop time.
        if tx.meter_stop is not None and tx.meter_start is not None:
            d.energy_kwh = delta_kwh(tx.meter_start, tx.meter_stop)

        tx_meter_ids = _meter_value_tx_ids(tx)
        latest_meter = max(
            (
                latest_energy_by_id[meter_id]
                for meter_id in tx_meter_ids
                if meter_id in latest_energy_by_id
            ),
            key=lambda meter_value: meter_value.timestamp,
            default=None,
        )
        if latest_meter:
            meter_kwh = delta_kwh(tx.meter_start, float(latest_meter.value), latest_meter.unit)
            if d.energy_kwh is None or meter_kwh > d.energy_kwh:
                d.energy_kwh = meter_kwh

        # Hide noise transactions: Completed sessions with no proof of real charging
        # (no signed OCMF data, no MeterValues telemetry) AND either never got a
        # meter_stop (dangling) or reported zero net energy (meter_stop == meter_start,
        # e.g. a duplicate StartTransaction retry the charger stopped immediately).
        has_no_evidence = (
            latest_meter is None
            and not tx.ocmf_start_raw
            and not tx.ocmf_stop_raw
            and not any(meter_id in meter_ids_with_values for meter_id in tx_meter_ids)
        )
        is_zero_energy = tx.meter_stop is None or (d.energy_kwh is not None and d.energy_kwh <= 0)
        if (
            not include_empty
            and tx.status == "Completed"
            and has_no_evidence
            and is_zero_energy
        ):
            continue

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
    tx_result = await db.execute(
        select(Transaction).where(
            (Transaction.id == tx_id) | (Transaction.transaction_id == tx_id)
        )
    )
    tx = tx_result.scalar_one_or_none()
    tx_ids = _meter_value_tx_ids(tx) if tx else [tx_id]
    result = await db.execute(
        select(MeterValue)
        .where(MeterValue.transaction_id.in_(tx_ids))
        .order_by(MeterValue.timestamp.asc())
    )
    return list(result.scalars().all())


@router.get("/{tx_id}/live-power")
async def get_live_power(tx_id: int, db: AsyncSession = Depends(get_db)):
    """Get latest power and energy reading for an active transaction."""
    tx_result = await db.execute(
        select(Transaction).where(
            (Transaction.id == tx_id) | (Transaction.transaction_id == tx_id)
        )
    )
    tx = tx_result.scalar_one_or_none()
    tx_ids = _meter_value_tx_ids(tx) if tx else [tx_id]

    # Get latest Power.Active.Import measurement
    power_result = await db.execute(
        select(MeterValue)
        .where(
            MeterValue.transaction_id.in_(tx_ids),
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
            MeterValue.transaction_id.in_(tx_ids),
            MeterValue.measurand == 'Energy.Active.Import.Register'
        )
        .order_by(MeterValue.timestamp.desc())
        .limit(1)
    )
    energy_meter = energy_result.scalar_one_or_none()
    
    return {
        "power_w": float(power_meter.value) if power_meter else 0.0,
        "power_kw": float(power_meter.value) / 1000 if power_meter else 0.0,
        "energy_wh": to_watt_hours(float(energy_meter.value), energy_meter.unit) if energy_meter else 0,
        "energy_kwh": delta_kwh(0, float(energy_meter.value), energy_meter.unit) if energy_meter else 0,
        "energy_delivered_kwh": delta_kwh(tx.meter_start, float(energy_meter.value), energy_meter.unit) if energy_meter and tx else 0,
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
async def get_active_transaction(cp_id: str, connector_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Get the currently active transaction for a charger, optionally filtered by connector_id."""
    q = select(Transaction).where(Transaction.charge_point_id == cp_id, Transaction.status == "Active")
    if connector_id is not None:
        q = q.where(Transaction.connector_id == connector_id)
    q = q.order_by(Transaction.start_time.desc()).limit(1)
    
    result = await db.execute(q)
    tx = result.scalar_one_or_none()
    if not tx:
        return None
    d = TransactionOut.model_validate(tx)
    if tx.meter_stop is not None:
        d.energy_kwh = delta_kwh(tx.meter_start, tx.meter_stop)

    if tx.id_tag:
        u_res = await db.execute(select(User).where(User.rfid_tag == tx.id_tag))
        user = u_res.scalar_one_or_none()
        if user:
            d.user_username = user.username
            d.user_email = user.email
            d.user_role = user.role

    if d.energy_kwh is None:
        meter_result = await db.execute(
            select(MeterValue)
            .where(
                MeterValue.transaction_id.in_(_meter_value_tx_ids(tx)),
                MeterValue.measurand == 'Energy.Active.Import.Register'
            )
            .order_by(MeterValue.timestamp.desc())
            .limit(1)
        )
        latest_meter = meter_result.scalar_one_or_none()
        if latest_meter:
            d.energy_kwh = delta_kwh(tx.meter_start, float(latest_meter.value), latest_meter.unit)
        else:
            d.energy_kwh = 0.0

    return d


@router.get("/active-all/{cp_id}", response_model=dict[int, TransactionOut])
async def get_all_active_transactions(cp_id: str, db: AsyncSession = Depends(get_db)):
    """Get all active transactions mapped by connector_id for a charger."""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.charge_point_id == cp_id, Transaction.status == "Active")
        .order_by(Transaction.start_time.desc())
    )
    txs = result.scalars().all()
    out = {}
    
    r_u = await db.execute(select(User))
    users_by_tag = {u.rfid_tag: u for u in r_u.scalars().all() if u.rfid_tag}

    for tx in txs:
        if tx.connector_id in out:
            continue
        d = TransactionOut.model_validate(tx)
        if tx.meter_stop is not None:
            d.energy_kwh = delta_kwh(tx.meter_start, tx.meter_stop)
        
        user = users_by_tag.get(tx.id_tag)
        if user:
            d.user_username = user.username
            d.user_email = user.email
            d.user_role = user.role

        if d.energy_kwh is None:
            meter_result = await db.execute(
                select(MeterValue)
                .where(
                    MeterValue.transaction_id.in_(_meter_value_tx_ids(tx)),
                    MeterValue.measurand == 'Energy.Active.Import.Register'
                )
                .order_by(MeterValue.timestamp.desc())
                .limit(1)
            )
            latest_meter = meter_result.scalar_one_or_none()
            if latest_meter:
                d.energy_kwh = delta_kwh(tx.meter_start, float(latest_meter.value), latest_meter.unit)
            else:
                d.energy_kwh = 0.0
        
        out[tx.connector_id] = d
    return out

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
    # Count as successful if status is "Completed" or "Finishing" (completed sessions)
    tx_result = await db.execute(
        select(
            Transaction.connector_id,
            func.count(Transaction.id).label('total'),
            func.sum(case(
                ((Transaction.status == 'Completed') | (Transaction.status == 'Finishing'), 1), 
                else_=0
            )).label('completed')
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
