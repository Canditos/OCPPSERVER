import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from database import get_db
from models.smart_charging import ChargingProfileModel
from ocpp_server.central_system import get_charge_point

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/smart-charging", tags=["smart-charging"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class SchedulePeriodItem(BaseModel):
    start_period: int  # Seconds from start / midnight (e.g. 0 = 00:00, 25200 = 07:00)
    limit: float       # In Amperes (e.g. 16.0, 32.0) or Watts (e.g. 11000.0)
    number_phases: int | None = 3


class ProfileCreateRequest(BaseModel):
    charge_point_id: str
    connector_id: int = 0
    name: str
    stack_level: int = 0
    purpose: str = "TxDefaultProfile"  # ChargePointMaxProfile, TxDefaultProfile, TxProfile
    kind: str = "Recurring"             # Recurring, Absolute, Relative
    recurrency_kind: str | None = "Daily"  # Daily, Weekly
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    duration: int | None = 86400        # Default 24h in seconds
    start_schedule: datetime | None = None
    charging_rate_unit: str = "A"       # A or W
    min_charging_rate: float | None = None
    periods: list[SchedulePeriodItem] = []


class ApplyProfileRequest(BaseModel):
    profile_id: int  # Database profile model ID
    charge_point_id: str | None = None


class ClearProfileRequest(BaseModel):
    charge_point_id: str
    profile_id: int | None = None
    connector_id: int | None = None
    purpose: str | None = None
    stack_level: int | None = None


class CompositeScheduleRequest(BaseModel):
    charge_point_id: str
    connector_id: int = 1
    duration: int = 86400
    rate_unit: str = "A"


# ── Preset definitions ──────────────────────────────────────────────────────

PRESETS = [
    {
        "id": "bi_hourly_night",
        "name": "Tarifa Bi-horária / Noturna (32A Noite / 10A Dia)",
        "description": "Carregamento a 32A (7.4kW/22kW) no período de vazio (00h00 às 07h00) e 10A no resto do dia.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "A",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 32.0, "number_phases": 3, "label": "00:00 - 07:00 (Super Vazio: 32A)"},
            {"start_period": 25200, "limit": 10.0, "number_phases": 3, "label": "07:00 - 24:00 (Ponta/Cheias: 10A)"},
        ],
    },
    {
        "id": "tri_hourly_portugal",
        "name": "Tarifa Tri-horária Portugal (Vazio 32A / Cheias 16A / Ponta 6A)",
        "description": "Modulação inteligente por 3 patamares horários: Vazio (00h-07h) 32A, Cheias 16A, Horas de Ponta (18h-21h) 6A.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "A",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 32.0, "number_phases": 3, "label": "00:00 - 07:00 (Vazio: 32A)"},
            {"start_period": 25200, "limit": 16.0, "number_phases": 3, "label": "07:00 - 18:00 (Cheias: 16A)"},
            {"start_period": 64800, "limit": 6.0, "number_phases": 3, "label": "18:00 - 21:00 (Ponta: 6A)"},
            {"start_period": 75600, "limit": 16.0, "number_phases": 3, "label": "21:00 - 24:00 (Cheias: 16A)"},
        ],
    },
    {
        "id": "solar_eco_day",
        "name": "Solar Autoconsumo / Eco Diurno (10A 09h00-17h00)",
        "description": "Prioriza produção solar diurna com 16A entre as 10h00 e as 17h00 e reduz para 6A no resto do dia.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "A",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 6.0, "number_phases": 3, "label": "00:00 - 10:00 (Mínimo: 6A)"},
            {"start_period": 36000, "limit": 20.0, "number_phases": 3, "label": "10:00 - 17:00 (Pico Solar: 20A)"},
            {"start_period": 61200, "limit": 6.0, "number_phases": 3, "label": "17:00 - 24:00 (Mínimo: 6A)"},
        ],
    },
    {
        "id": "max_station_limit_16a",
        "name": "Limite Geral Posto (ChargePointMax 16A)",
        "description": "Limita o posto inteiro a 16A (11kW trifásico ou 3.7kW mono) para proteção da rede elétrica local.",
        "purpose": "ChargePointMaxProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "A",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 16.0, "number_phases": 3, "label": "00:00 - 24:00 (Limite Total: 16A)"},
        ],
    },
    {
        "id": "max_station_limit_32a",
        "name": "Limite Geral Posto (ChargePointMax 32A)",
        "description": "Limita o posto inteiro a 32A (22kW trifásico ou 7.4kW mono) garantindo equilíbrio com o disjuntor principal.",
        "purpose": "ChargePointMaxProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "A",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 32.0, "number_phases": 3, "label": "00:00 - 24:00 (Limite Total: 32A)"},
        ],
    },
    {
        "id": "weekend_full_speed",
        "name": "Semanal: Fim-de-Semana 32A / Dias Úteis 16A (Weekly)",
        "description": "Perfil recorrente semanal de 7 dias (604800 segundos) para carregamento rápido ao fim de semana.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Weekly",
        "charging_rate_unit": "A",
        "duration": 604800,
        "periods": [
            {"start_period": 0, "limit": 16.0, "number_phases": 3, "label": "Segunda a Sexta (16A)"},
            {"start_period": 432000, "limit": 32.0, "number_phases": 3, "label": "Sábado e Domingo (32A)"},
        ],
    },
]


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/presets")
async def get_presets():
    """Returns ready-to-use smart charging presets."""
    return PRESETS


@router.get("/profiles")
async def list_profiles(cp_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """List all saved Smart Charging profiles."""
    q = select(ChargingProfileModel).order_by(ChargingProfileModel.created_at.desc())
    if cp_id:
        q = q.where(ChargingProfileModel.charge_point_id == cp_id)
    result = await db.execute(q)
    profiles = result.scalars().all()
    out = []
    for p in profiles:
        out.append({
            "id": p.id,
            "profile_id": p.profile_id,
            "charge_point_id": p.charge_point_id,
            "connector_id": p.connector_id,
            "name": p.name,
            "stack_level": p.stack_level,
            "purpose": p.purpose,
            "kind": p.kind,
            "recurrency_kind": p.recurrency_kind,
            "valid_from": p.valid_from.isoformat() if p.valid_from else None,
            "valid_to": p.valid_to.isoformat() if p.valid_to else None,
            "duration": p.duration,
            "charging_rate_unit": p.charging_rate_unit,
            "min_charging_rate": p.min_charging_rate,
            "periods": json.loads(p.periods_json or "[]"),
            "is_deployed": p.is_deployed,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return out


@router.post("/profiles")
async def create_profile(req: ProfileCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create and save a new Smart Charging profile."""
    # Generate unique profile_id integer
    result = await db.execute(select(ChargingProfileModel).order_by(ChargingProfileModel.profile_id.desc()).limit(1))
    last = result.scalar_one_or_none()
    next_profile_id = (last.profile_id + 1) if last else 1

    profile = ChargingProfileModel(
        profile_id=next_profile_id,
        charge_point_id=req.charge_point_id,
        connector_id=req.connector_id,
        name=req.name,
        stack_level=req.stack_level,
        purpose=req.purpose,
        kind=req.kind,
        recurrency_kind=req.recurrency_kind if req.kind == "Recurring" else None,
        valid_from=req.valid_from,
        valid_to=req.valid_to,
        duration=req.duration,
        start_schedule=req.start_schedule,
        charging_rate_unit=req.charging_rate_unit,
        min_charging_rate=req.min_charging_rate,
        periods_json=json.dumps([p.dict() for p in req.periods]),
        is_deployed=False,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return {
        "id": profile.id,
        "profile_id": profile.profile_id,
        "name": profile.name,
        "status": "created",
    }


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a saved profile."""
    result = await db.execute(select(ChargingProfileModel).where(ChargingProfileModel.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"status": "deleted", "id": profile_id}


@router.post("/apply")
async def apply_profile(req: ApplyProfileRequest, db: AsyncSession = Depends(get_db)):
    """Send SetChargingProfile to the connected charger."""
    result = await db.execute(select(ChargingProfileModel).where(ChargingProfileModel.id == req.profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    cp_id = req.charge_point_id or profile.charge_point_id
    cp = get_charge_point(cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail=f"Charger '{cp_id}' not connected")

    ocpp_payload = profile.to_ocpp_dict()
    connector_id = profile.connector_id
    # If purpose is ChargePointMaxProfile, connector_id MUST be 0
    if profile.purpose == "ChargePointMaxProfile":
        connector_id = 0

    try:
        resp = await cp.set_charging_profile(
            connector_id=connector_id,
            cs_charging_profiles=ocpp_payload,
        )
        status = getattr(resp, "status", "Accepted")
        if status == "Accepted":
            profile.is_deployed = True
            await db.commit()
        return {"status": status, "profile_id": profile.profile_id, "ocpp_payload": ocpp_payload}
    except Exception as e:
        logger.error(f"Error applying smart charging profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to apply profile: {str(e)}")


@router.post("/clear")
async def clear_profile(req: ClearProfileRequest, db: AsyncSession = Depends(get_db)):
    """Send ClearChargingProfile to the connected charger."""
    cp = get_charge_point(req.charge_point_id)
    if not cp:
        raise HTTPException(status_code=404, detail=f"Charger '{req.charge_point_id}' not connected")

    try:
        resp = await cp.clear_charging_profile(
            profile_id=req.profile_id,
            connector_id=req.connector_id,
            purpose=req.purpose,
            stack_level=req.stack_level,
        )
        status = getattr(resp, "status", "Accepted")
        if status == "Accepted":
            # Update database deployed status
            if req.profile_id:
                await db.execute(
                    update(ChargingProfileModel)
                    .where(
                        ChargingProfileModel.charge_point_id == req.charge_point_id,
                        ChargingProfileModel.profile_id == req.profile_id
                    )
                    .values(is_deployed=False)
                )
            else:
                await db.execute(
                    update(ChargingProfileModel)
                    .where(ChargingProfileModel.charge_point_id == req.charge_point_id)
                    .values(is_deployed=False)
                )
            await db.commit()
        return {"status": status}
    except Exception as e:
        logger.error(f"Error clearing smart charging profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear profile: {str(e)}")


@router.post("/composite-schedule")
async def get_composite_schedule(req: CompositeScheduleRequest):
    """Query GetCompositeSchedule from the charger."""
    cp = get_charge_point(req.charge_point_id)
    if not cp:
        raise HTTPException(status_code=404, detail=f"Charger '{req.charge_point_id}' not connected")

    try:
        resp = await cp.get_composite_schedule(
            connector_id=req.connector_id,
            duration=req.duration,
            rate_unit=req.rate_unit,
        )
        return {
            "status": getattr(resp, "status", "Accepted"),
            "connector_id": getattr(resp, "connector_id", req.connector_id),
            "schedule_start": getattr(resp, "schedule_start", None),
            "charging_schedule": getattr(resp, "charging_schedule", None),
        }
    except Exception as e:
        logger.error(f"Error getting composite schedule: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get composite schedule: {str(e)}")
