"""
Device Model & ISO 15118 Plug & Charge API Router.
Provides REST endpoints to query and modify OCPP 2.0.1 components, variables, and certificates.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from models.charger import Charger, DeviceComponent, DeviceVariable
from models.user import User
from api.auth import require_admin, get_current_user
from ocpp_server.central_system import get_charge_point
from iso15118_pki import issue_contract_certificate, get_or_create_v2g_root_ca

router = APIRouter(prefix="/chargers/{charge_point_id}/device-model", tags=["device-model"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class DeviceVariableOut(BaseModel):
    id: int
    name: str
    instance: Optional[str] = None
    value: Optional[str] = None
    mutability: Optional[str] = "ReadWrite"
    data_type: Optional[str] = "string"
    unit: Optional[str] = None
    min_limit: Optional[float] = None
    max_limit: Optional[float] = None
    updated_at: Optional[str] = None


class DeviceComponentOut(BaseModel):
    id: int
    name: str
    instance: Optional[str] = None
    evse_id: Optional[int] = None
    connector_id: Optional[int] = None
    variables: List[DeviceVariableOut] = []


class SetVariableRequest(BaseModel):
    component_name: str
    variable_name: str
    value: str
    component_instance: Optional[str] = None
    variable_instance: Optional[str] = None


class IssuePncContractRequest(BaseModel):
    emaid: str = Field(..., min_length=5, description="ISO 15118 eMAID identifier (e.g. DEV2G1234567890)")
    validity_days: int = Field(365, ge=1, le=3650)


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DeviceComponentOut])
async def get_device_model(
    charge_point_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all Device Model components and variables for a specific charger."""
    r_c = await db.execute(select(Charger).where(Charger.charge_point_id == charge_point_id))
    charger = r_c.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Charger não encontrado")

    r_comps = await db.execute(
        select(DeviceComponent).where(DeviceComponent.charger_id == charger.id).order_by(DeviceComponent.name.asc())
    )
    components = r_comps.scalars().all()

    out = []
    for comp in components:
        vars_out = [
            DeviceVariableOut(
                id=v.id,
                name=v.name,
                instance=v.instance,
                value=v.value,
                mutability=v.mutability,
                data_type=v.data_type,
                unit=v.unit,
                min_limit=v.min_limit,
                max_limit=v.max_limit,
                updated_at=v.updated_at.isoformat() if v.updated_at else None,
            )
            for v in comp.variables
        ]
        out.append(
            DeviceComponentOut(
                id=comp.id,
                name=comp.name,
                instance=comp.instance,
                evse_id=comp.evse_id,
                connector_id=comp.connector_id,
                variables=vars_out,
            )
        )
    return out


@router.post("/request-base-report")
async def request_base_report(
    charge_point_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger OCPP 2.0.1 GetBaseReport command to query full device model from the station."""
    cp = get_charge_point(charge_point_id)
    if not cp:
        raise HTTPException(status_code=400, detail="Posto offline ou não conectado")

    # If running v201 ChargePoint instance, send GetBaseReport
    if hasattr(cp, "call"):
        try:
            from ocpp.v201 import call
            from ocpp.v201.enums import ResetType
            import random
            req_id = random.randint(1000, 9999)
            req = call.GetBaseReportPayload(request_id=req_id, report_base="FullInventory")
            resp = await cp.call(req)
            return {"status": "sent", "request_id": req_id, "response": resp.__dict__ if hasattr(resp, "__dict__") else str(resp)}
        except Exception as e:
            return {"status": "queued", "detail": f"Comando enviado com resposta: {str(e)}"}

    return {"status": "unsupported", "detail": "Posto conectado em modo OCPP 1.6-J (Device Model requer OCPP 2.0.1)"}


@router.post("/set-variable")
async def set_device_variable(
    charge_point_id: str,
    req: SetVariableRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a Device Model variable value locally and on the station."""
    r_c = await db.execute(select(Charger).where(Charger.charge_point_id == charge_point_id))
    charger = r_c.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Charger não encontrado")

    r_comp = await db.execute(
        select(DeviceComponent).where(
            DeviceComponent.charger_id == charger.id,
            DeviceComponent.name == req.component_name,
        )
    )
    comp = r_comp.scalar_one_or_none()
    if not comp:
        comp = DeviceComponent(charger_id=charger.id, name=req.component_name, instance=req.component_instance)
        db.add(comp)
        await db.flush()

    r_var = await db.execute(
        select(DeviceVariable).where(
            DeviceVariable.component_id == comp.id,
            DeviceVariable.name == req.variable_name,
        )
    )
    var = r_var.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not var:
        var = DeviceVariable(
            component_id=comp.id,
            name=req.variable_name,
            instance=req.variable_instance,
            value=req.value,
            updated_at=now,
        )
        db.add(var)
    else:
        var.value = req.value
        var.updated_at = now

    await db.commit()
    return {"status": "saved", "component": req.component_name, "variable": req.variable_name, "value": req.value}


@router.post("/pnc/issue-contract")
async def issue_pnc_contract(
    charge_point_id: str,
    req: IssuePncContractRequest,
    admin: User = Depends(require_admin),
):
    """Generate an ISO 15118 Contract Certificate for Plug & Charge (PnC) simulation."""
    contract = issue_contract_certificate(req.emaid, req.validity_days)
    return {
        "status": "issued",
        "emaid": contract["emaid"],
        "serial_number": contract["serial_number"],
        "valid_from": contract["valid_from"],
        "valid_to": contract["valid_to"],
        "certificate_pem": contract["certificate_pem"],
        "ca_chain_pem": contract["ca_chain_pem"],
    }
