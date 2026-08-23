import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from database import get_db, AsyncSessionLocal
from models.charging_profile import ChargingProfile, ChargingProfileModel
from ocpp_server.central_system import get_charge_point

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/smart-charging", tags=["smart-charging"])

_PROFILE_ID_BASE = 2000


# ── Schemas ─────────────────────────────────────────────────────────────────

class SchedulePeriodItem(BaseModel):
    start_period: int = Field(0, description="Seconds from start/midnight (e.g. 0=00:00, 25200=07:00)")
    limit: float = Field(16.0, description="Limit in Amps or Watts")
    number_phases: int | None = 3
    label: str | None = None


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
    duration: int | None = 86400
    start_schedule: datetime | None = None
    charging_rate_unit: str = "A"       # A or W
    min_charging_rate: float | None = None
    periods: list[SchedulePeriodItem] = []


class ApplyProfileRequest(BaseModel):
    profile_id: int
    charge_point_id: str | None = None


class SetProfileLegacyRequest(BaseModel):
    charge_point_id: str
    connector_id: int = 0
    limit_amps: float | None = None
    limit_watts: float | None = None
    rate_unit: str = "A"
    purpose: str = "TxDefaultProfile"
    stack_level: int = 0
    label: str = "Custom"
    schedule_periods: list[SchedulePeriodItem] | None = None
    duration: int | None = None


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
    # ── AC PRESETS (Amperes / A) ──────────────────────────────────────────────
    {
        "id": "ac_bi_hourly_night",
        "category": "AC",
        "name": "AC Bi-horária / Noturna (32A Noite / 10A Dia)",
        "description": "Carregamento AC a 32A (7.4kW mono / 22kW tri) no período de vazio (00h-07h) e 10A no resto do dia.",
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
        "id": "ac_tri_hourly_portugal",
        "category": "AC",
        "name": "AC Tri-horária Portugal (Vazio 32A / Cheias 16A / Ponta 6A)",
        "description": "Modulação AC inteligente: Vazio (00h-07h) 32A, Cheias 16A, Horas de Ponta (18h-21h) 6A.",
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
        "id": "ac_solar_eco_day",
        "category": "AC",
        "name": "AC Solar Autoconsumo (20A 10h00-17h00 / 6A Resto)",
        "description": "Prioriza produção solar diurna AC com 20A no pico solar e 6A no resto do dia.",
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
        "id": "ac_max_station_limit_16a",
        "category": "AC",
        "name": "AC Limite Geral Posto (ChargePointMax 16A)",
        "description": "Limita o posto AC a 16A (11kW trifásico ou 3.7kW mono) para proteção do disjuntor principal.",
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
        "id": "ac_max_station_limit_32a",
        "category": "AC",
        "name": "AC Limite Geral Posto (ChargePointMax 32A)",
        "description": "Limita o posto AC a 32A (22kW trifásico ou 7.4kW mono) para equilíbrio total com a rede.",
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
        "id": "ac_weekend_full_speed",
        "category": "AC",
        "name": "AC Semanal: Fim-de-Semana 32A / Dias Úteis 16A",
        "description": "Perfil recorrente semanal AC de 7 dias: 32A ao fim de semana e 16A nos dias úteis.",
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

    # ── DC FAST CHARGER PRESETS (Watts / W e kW) ──────────────────────────────
    {
        "id": "dc_fast_bi_hourly",
        "category": "DC",
        "name": "DC Bi-horário Rápido (150 kW Vazio / 50 kW Ponta)",
        "description": "Carregamento DC ultrarrápido a 150 kW nas horas de vazio (00h-07h) e modulação a 50 kW no resto do dia.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 150000.0, "label": "00:00 - 07:00 (Super Vazio: 150 kW)"},
            {"start_period": 25200, "limit": 50000.0, "label": "07:00 - 24:00 (Ponta/Cheias: 50 kW)"},
        ],
    },
    {
        "id": "dc_fast_tri_hourly",
        "category": "DC",
        "name": "DC Tri-horário Escalonado (Vazio 180 kW / Cheias 90 kW / Ponta 30 kW)",
        "description": "Modulação dinâmica DC para poupança de tarifário: Vazio 180 kW, Cheias 90 kW, Horas de Ponta 30 kW.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 180000.0, "label": "00:00 - 07:00 (Vazio: 180 kW)"},
            {"start_period": 25200, "limit": 90000.0, "label": "07:00 - 18:00 (Cheias: 90 kW)"},
            {"start_period": 64800, "limit": 30000.0, "label": "18:00 - 21:00 (Ponta: 30 kW)"},
            {"start_period": 75600, "limit": 90000.0, "label": "21:00 - 24:00 (Cheias: 90 kW)"},
        ],
    },
    {
        "id": "dc_max_station_limit_100kw",
        "category": "DC",
        "name": "DC Limite Potência Contratada (ChargePointMax 100 kW)",
        "description": "Limita a potência total do posto DC a 100 kW (100.000 W) para respeitar o contrato da rede / PT.",
        "purpose": "ChargePointMaxProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 100000.0, "label": "00:00 - 24:00 (Limite Total Posto: 100 kW)"},
        ],
    },
    {
        "id": "dc_max_station_limit_150kw",
        "category": "DC",
        "name": "DC Limite Potência Contratada (ChargePointMax 150 kW)",
        "description": "Limita a potência total do posto DC a 150 kW (150.000 W) para proteção de infraestrutura.",
        "purpose": "ChargePointMaxProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 150000.0, "label": "00:00 - 24:00 (Limite Total Posto: 150 kW)"},
        ],
    },
    {
        "id": "dc_max_station_limit_300kw",
        "category": "DC",
        "name": "DC Limite Potência Contratada (ChargePointMax 300 kW Ultra-Fast)",
        "description": "Permite débito ultrarrápido até 300 kW (300.000 W) para carregadores DC de alta potência (ex: Sicharge D).",
        "purpose": "ChargePointMaxProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 300000.0, "label": "00:00 - 24:00 (Limite Total Posto: 300 kW)"},
        ],
    },
    {
        "id": "dc_solar_peak",
        "category": "DC",
        "name": "DC Solar Autoconsumo (Pico Diurno 120 kW / Base 40 kW)",
        "description": "Sincroniza com parques fotovoltaicos: 120 kW no pico solar (10h-17h) e 40 kW nas restantes horas.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Daily",
        "charging_rate_unit": "W",
        "duration": 86400,
        "periods": [
            {"start_period": 0, "limit": 40000.0, "label": "00:00 - 10:00 (Base: 40 kW)"},
            {"start_period": 36000, "limit": 120000.0, "label": "10:00 - 17:00 (Pico Solar: 120 kW)"},
            {"start_period": 61200, "limit": 40000.0, "label": "17:00 - 24:00 (Base: 40 kW)"},
        ],
    },
    {
        "id": "dc_weekend_fast",
        "category": "DC",
        "name": "DC Semanal: Fim-de-Semana 150 kW / Dias Úteis 75 kW",
        "description": "Perfil recorrente semanal DC: potência máxima 150 kW no fim-de-semana e moderada 75 kW nos dias de semana.",
        "purpose": "TxDefaultProfile",
        "kind": "Recurring",
        "recurrency_kind": "Weekly",
        "charging_rate_unit": "W",
        "duration": 604800,
        "periods": [
            {"start_period": 0, "limit": 75000.0, "label": "Segunda a Sexta (75 kW)"},
            {"start_period": 432000, "limit": 150000.0, "label": "Sábado e Domingo (150 kW)"},
        ],
    },
]


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/presets")
async def get_presets():
    """Returns ready-to-use smart charging presets."""
    return PRESETS


@router.get("/profiles")
@router.get("")
async def list_profiles(cp_id: str | None = None, charge_point_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """List all saved Smart Charging profiles."""
    target_id = cp_id or charge_point_id
    q = select(ChargingProfileModel).order_by(ChargingProfileModel.created_at.desc())
    if target_id:
        q = q.where(ChargingProfileModel.charge_point_id == target_id)
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
    result = await db.execute(select(ChargingProfileModel).order_by(ChargingProfileModel.profile_id.desc()).limit(1))
    last = result.scalar_one_or_none()
    next_profile_id = (last.profile_id + 1) if last else _PROFILE_ID_BASE

    first_limit = req.periods[0].limit if req.periods else 16.0

    profile = ChargingProfileModel(
        profile_id=next_profile_id,
        charge_point_id=req.charge_point_id,
        connector_id=req.connector_id,
        name=req.name,
        stack_level=req.stack_level,
        purpose=req.purpose,
        kind=req.kind,
        recurrency_kind=req.recurrency_kind if req.kind == "Recurring" else None,
        limit_amps=int(first_limit) if req.charging_rate_unit == "A" else 0,
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
        else:
            profile.is_deployed = False
            await db.commit()
            raise HTTPException(status_code=400, detail=f"O posto recusou o perfil com status: {status}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying smart charging profile: {e}")
        profile.is_deployed = False
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Falha de comunicação/validação com o posto: {str(e)}")


@router.post("/set")
async def set_profile_legacy(req: SetProfileLegacyRequest, db: AsyncSession = Depends(get_db)):
    """Legacy compatibility endpoint for SetChargingProfile."""
    cp = get_charge_point(req.charge_point_id)
    if not cp:
        raise HTTPException(status_code=404, detail=f"Charger '{req.charge_point_id}' not connected")

    profile_id = _PROFILE_ID_BASE + (int(datetime.utcnow().timestamp()) % 10000)
    rate_unit = req.rate_unit if req.rate_unit in ("A", "W") else "A"
    base_limit = req.limit_watts if rate_unit == "W" and req.limit_watts is not None else (req.limit_amps or 16.0)

    periods = []
    if req.schedule_periods:
        for p in req.schedule_periods:
            periods.append({"startPeriod": p.start_period, "limit": p.limit})
    else:
        periods.append({"startPeriod": 0, "limit": float(base_limit)})

    ocpp_payload = {
        "chargingProfileId": profile_id,
        "stackLevel": req.stack_level,
        "chargingProfilePurpose": req.purpose,
        "chargingProfileKind": "Absolute" if req.schedule_periods else "Relative",
        "chargingSchedule": {
            "chargingRateUnit": rate_unit,
            "chargingSchedulePeriod": periods,
        },
    }

    try:
        resp = await cp.set_charging_profile(
            connector_id=req.connector_id,
            cs_charging_profiles=ocpp_payload,
        )
        status = getattr(resp, "status", "Accepted")
        return {"status": status, "profile_id": profile_id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OCPP error: {e}")


@router.post("/clear")
@router.delete("/clear")
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
