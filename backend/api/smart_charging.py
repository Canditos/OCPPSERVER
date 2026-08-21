"""
Smart Charging API — wraps OCPP 1.6 SetChargingProfile / ClearChargingProfile
with a simple, intuitive REST interface.
"""
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models.charging_profile import ChargingProfile
from ocpp_server.central_system import get_charge_point

router = APIRouter(prefix="/smart-charging", tags=["smart-charging"])

_PROFILE_ID_BASE = 2000  # avoid collisions with charger-side profiles


# ── Schemas ────────────────────────────────────────────────────────────────

class SchedulePeriod(BaseModel):
    start_period: int = Field(..., description="Seconds from schedule start")
    limit: float = Field(..., description="Amps limit for this period")


class SetProfileRequest(BaseModel):
    charge_point_id: str
    connector_id: int = Field(0, description="0 = all connectors")
    limit_amps: float | None = Field(None, ge=0, le=1000, description="Max charge current in Amps (AC)")
    limit_watts: float | None = Field(None, ge=0, description="Max charge power in Watts (DC or AC)")
    rate_unit: str = Field("A", description="A (Amps) or W (Watts)")
    purpose: str = Field("TxDefaultProfile",
                         description="TxDefaultProfile | ChargePointMaxProfile | TxProfile")
    stack_level: int = Field(0, ge=0, le=10)
    label: str = Field("Custom", description="Human-readable name")
    # Optional schedule for time-based charging
    schedule_periods: list[SchedulePeriod] | None = None
    duration: int | None = Field(None, description="Schedule duration in seconds (null=unlimited)")


class ClearProfileRequest(BaseModel):
    charge_point_id: str
    connector_id: int | None = None
    purpose: str | None = None
    stack_level: int | None = None


# ── Helpers ────────────────────────────────────────────────────────────────

def _build_ocpp_profile(req: SetProfileRequest, profile_id: int) -> dict:
    """Build the csChargingProfiles dict for OCPP SetChargingProfile."""
    rate_unit = req.rate_unit if req.rate_unit in ("A", "W") else "A"

    # Determine the numeric limit for this unit
    if rate_unit == "W":
        base_limit = req.limit_watts if req.limit_watts is not None else (req.limit_amps or 0) * 230
    else:
        base_limit = req.limit_amps if req.limit_amps is not None else 0

    if req.schedule_periods:
        periods = [{"startPeriod": p.start_period, "limit": p.limit}
                   for p in req.schedule_periods]
    else:
        periods = [{"startPeriod": 0, "limit": base_limit}]

    schedule: dict = {
        "chargingRateUnit": rate_unit,
        "chargingSchedulePeriod": periods,
    }
    if req.duration is not None:
        schedule["duration"] = req.duration

    return {
        "chargingProfileId": profile_id,
        "stackLevel": req.stack_level,
        "chargingProfilePurpose": req.purpose,
        "chargingProfileKind": "Absolute" if req.schedule_periods else "Relative",
        "chargingSchedule": schedule,
    }


def _profile_dict(p: ChargingProfile) -> dict:
    return {
        "id": p.id,
        "charge_point_id": p.charge_point_id,
        "connector_id": p.connector_id,
        "profile_id": p.profile_id,
        "stack_level": p.stack_level,
        "purpose": p.purpose,
        "limit_amps": p.limit_amps,
        "duration": p.duration,
        "label": p.label,
        "active": p.active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "schedule": p.schedule_dict(),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("")
async def list_profiles(charge_point_id: str | None = None):
    """List all active charging profiles, optionally filtered by charger."""
    async with AsyncSessionLocal() as db:
        q = select(ChargingProfile).where(ChargingProfile.active == True)
        if charge_point_id:
            q = q.where(ChargingProfile.charge_point_id == charge_point_id)
        result = await db.execute(q.order_by(ChargingProfile.created_at.desc()))
        profiles = result.scalars().all()
    return [_profile_dict(p) for p in profiles]


@router.post("/set")
async def set_profile(req: SetProfileRequest):
    """
    Apply a charging profile to a charger.
    Generates a unique profile_id, sends SetChargingProfile via OCPP,
    and saves to DB on success.
    """
    cp = get_charge_point(req.charge_point_id)
    if not cp:
        raise HTTPException(status_code=404,
                            detail=f"Charger '{req.charge_point_id}' not connected")

    # Generate profile_id from timestamp to keep unique across restarts
    profile_id = _PROFILE_ID_BASE + (int(datetime.utcnow().timestamp()) % 10000)

    ocpp_profile = _build_ocpp_profile(req, profile_id)

    try:
        resp = await cp.set_charging_profile(
            connector_id=req.connector_id,
            charging_profile=ocpp_profile,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OCPP error: {e}")

    if not resp or resp.status not in ("Accepted",):
        raise HTTPException(
            status_code=422,
            detail=f"Charger rejected profile: {resp.status if resp else 'no response'}"
        )

    # Deactivate previous profiles for same charger+connector+purpose+stack
    async with AsyncSessionLocal() as db:
        old = await db.execute(
            select(ChargingProfile).where(
                ChargingProfile.charge_point_id == req.charge_point_id,
                ChargingProfile.connector_id == req.connector_id,
                ChargingProfile.purpose == req.purpose,
                ChargingProfile.stack_level == req.stack_level,
                ChargingProfile.active == True,
            )
        )
        for p in old.scalars().all():
            p.active = False

        # Store a human-readable limit: for W unit convert to "amps equivalent" just for display
        display_amps = (
            int(req.limit_amps) if req.limit_amps is not None
            else int((req.limit_watts or 0) / 230)
        )
        profile = ChargingProfile(
            charge_point_id=req.charge_point_id,
            connector_id=req.connector_id,
            profile_id=profile_id,
            stack_level=req.stack_level,
            purpose=req.purpose,
            limit_amps=display_amps,
            duration=req.duration,
            label=req.label,
            schedule_json=json.dumps([p.dict() for p in req.schedule_periods])
            if req.schedule_periods else None,
            active=True,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return {"status": "Accepted", "profile": _profile_dict(profile)}


@router.delete("/clear")
async def clear_profile(req: ClearProfileRequest):
    """
    Clear charging profiles on a charger via OCPP ClearChargingProfile.
    Also marks matching DB records as inactive.
    """
    cp = get_charge_point(req.charge_point_id)
    if not cp:
        raise HTTPException(status_code=404,
                            detail=f"Charger '{req.charge_point_id}' not connected")

    try:
        resp = await cp.clear_charging_profile(
            connector_id=req.connector_id,
            charging_profile_purpose=req.purpose,
            stack_level=req.stack_level,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OCPP error: {e}")

    # Mark DB records inactive regardless of response (best-effort)
    async with AsyncSessionLocal() as db:
        q = select(ChargingProfile).where(
            ChargingProfile.charge_point_id == req.charge_point_id,
            ChargingProfile.active == True,
        )
        if req.connector_id is not None:
            q = q.where(ChargingProfile.connector_id == req.connector_id)
        if req.purpose:
            q = q.where(ChargingProfile.purpose == req.purpose)
        if req.stack_level is not None:
            q = q.where(ChargingProfile.stack_level == req.stack_level)

        old = await db.execute(q)
        count = 0
        for p in old.scalars().all():
            p.active = False
            count += 1
        await db.commit()

    status = resp.status if resp else "Unknown"
    return {"status": status, "cleared": count}
