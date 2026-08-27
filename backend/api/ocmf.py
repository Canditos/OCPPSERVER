"""
OCMF and LEM Meter Keys REST API endpoints.
Provides manual verification, meter public key management, and official .ocmf export.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.charger import Charger
from models.meter_key import MeterPublicKey
from models.transaction import Transaction
from services.ocmf_service import parse_ocmf, verify_ocmf_signature, load_public_key_from_string

router = APIRouter(prefix="/ocmf", tags=["OCMF & Eichrecht"])


class VerifyManualRequest(BaseModel):
    ocmf_data: str
    public_key: str
    curve_name: str = "secp256r1"


class MeterKeyCreate(BaseModel):
    connector_id: int = 1
    meter_model: str = "LEM DCBM 400"
    serial_number: Optional[str] = None
    public_key_hex: str
    curve_name: str = "secp256r1"


class MeterKeyOut(BaseModel):
    id: int
    charge_point_id: str
    connector_id: int
    meter_model: str
    serial_number: Optional[str]
    public_key_hex: str
    curve_name: str
    is_active: bool

    class Config:
        from_attributes = True


@router.post("/verify-manual")
async def verify_manual_ocmf(req: VerifyManualRequest):
    """
    Manually verify an OCMF payload string using a LEM DCBM public key.
    """
    result = verify_ocmf_signature(req.ocmf_data, req.public_key, req.curve_name)
    return result


@router.get("/chargers/{cp_id}/keys", response_model=List[MeterKeyOut])
async def get_meter_keys(cp_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get configured LEM meter public keys for a specific charge point.
    """
    r = await db.execute(
        select(MeterPublicKey)
        .where(MeterPublicKey.charge_point_id == cp_id)
        .order_by(MeterPublicKey.connector_id.asc())
    )
    return list(r.scalars().all())


@router.post("/chargers/{cp_id}/keys", response_model=MeterKeyOut)
async def create_or_update_meter_key(cp_id: str, req: MeterKeyCreate, db: AsyncSession = Depends(get_db)):
    """
    Register or update a LEM meter public key for a charger connector.
    """
    # Verify key format first
    try:
        load_public_key_from_string(req.public_key_hex, curve_hint=req.curve_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Chave pública inválida: {e}")

    r_c = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = r_c.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Carregador não encontrado")

    # Check if exists for this connector
    r_existing = await db.execute(
        select(MeterPublicKey).where(
            MeterPublicKey.charge_point_id == cp_id,
            MeterPublicKey.connector_id == req.connector_id
        )
    )
    existing = r_existing.scalar_one_or_none()

    if existing:
        existing.meter_model = req.meter_model
        existing.serial_number = req.serial_number
        existing.public_key_hex = req.public_key_hex.strip()
        existing.curve_name = req.curve_name
        existing.is_active = True
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        new_key = MeterPublicKey(
            charger_id=charger.id,
            charge_point_id=cp_id,
            connector_id=req.connector_id,
            meter_model=req.meter_model,
            serial_number=req.serial_number,
            public_key_hex=req.public_key_hex.strip(),
            curve_name=req.curve_name,
            is_active=True,
        )
        charger.is_eichrecht_compliant = True
        db.add(new_key)
        await db.commit()
        await db.refresh(new_key)
        return new_key


@router.delete("/chargers/{cp_id}/keys/{key_id}")
async def delete_meter_key(cp_id: str, key_id: int, db: AsyncSession = Depends(get_db)):
    """
    Remove a configured LEM meter key.
    """
    r = await db.execute(select(MeterPublicKey).where(MeterPublicKey.id == key_id, MeterPublicKey.charge_point_id == cp_id))
    key_row = r.scalar_one_or_none()
    if not key_row:
        raise HTTPException(status_code=404, detail="Chave de medidor não encontrada")
    await db.delete(key_row)
    await db.commit()
    return {"message": "Chave de medidor removida com sucesso"}


@router.get("/transactions/{tx_id}")
async def get_transaction_ocmf(tx_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get OCMF audit data and cryptographic verification report for a transaction.
    """
    r_tx = await db.execute(
        select(Transaction).where(
            (Transaction.id == tx_id) | (Transaction.transaction_id == tx_id)
        )
    )
    tx = r_tx.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    # If ocmf_stop_raw is missing, search ocpp_messages log for any OCMF payload of this transaction
    if not tx.ocmf_stop_raw and not tx.ocmf_start_raw:
        from models.charger import OcppMessage
        tx_str = str(tx.transaction_id)
        r_msgs = await db.execute(
            select(OcppMessage).where(
                OcppMessage.charger_id == tx.charger_id,
                (OcppMessage.payload.ilike(f'%"transaction_id": {tx_str}%')) |
                (OcppMessage.payload.ilike(f'%"transaction_id":{tx_str}%')) |
                (OcppMessage.payload.ilike('%OCMF|%'))
            ).order_by(OcppMessage.timestamp.desc()).limit(50)
        )
        found_msgs = r_msgs.scalars().all()
        for m in found_msgs:
            p_str = str(m.payload)
            if "OCMF|" in p_str:
                match = re.search(r'(OCMF\|[^{]+\{[^|]+\}\|\{[^}]+\})', p_str)
                if match:
                    tx.ocmf_stop_raw = match.group(1)
                    break

    # Fetch meter key if exists
    r_key = await db.execute(
        select(MeterPublicKey).where(
            MeterPublicKey.charge_point_id == tx.charge_point_id,
            MeterPublicKey.connector_id == tx.connector_id
        )
    )
    meter_key = r_key.scalar_one_or_none()

    start_report = None
    stop_report = None

    if tx.ocmf_start_raw and meter_key:
        start_report = verify_ocmf_signature(tx.ocmf_start_raw, meter_key.public_key_hex, meter_key.curve_name)
    elif tx.ocmf_start_raw:
        start_report = {"verified": False, "parsed": parse_ocmf(tx.ocmf_start_raw).to_dict(), "error": "Chave pública do medidor não configurada"}

    if tx.ocmf_stop_raw and meter_key:
        stop_report = verify_ocmf_signature(tx.ocmf_stop_raw, meter_key.public_key_hex, meter_key.curve_name)
    elif tx.ocmf_stop_raw:
        stop_report = {"verified": False, "parsed": parse_ocmf(tx.ocmf_stop_raw).to_dict(), "error": "Chave pública do medidor não configurada"}

    return {
        "transaction_id": tx.transaction_id,
        "charge_point_id": tx.charge_point_id,
        "connector_id": tx.connector_id,
        "meter_serial": tx.ocmf_meter_serial or (meter_key.serial_number if meter_key else None),
        "meter_model": meter_key.meter_model if meter_key else "LEM DCBM",
        "has_meter_key": meter_key is not None,
        "public_key_hex": meter_key.public_key_hex if meter_key else None,
        "curve_name": meter_key.curve_name if meter_key else "secp256r1",
        "ocmf_verified": tx.ocmf_verified,
        "ocmf_verification_error": tx.ocmf_verification_error,
        "signed_energy_kwh": tx.signed_energy_kwh,
        "start_report": start_report,
        "stop_report": stop_report,
        "ocmf_start_raw": tx.ocmf_start_raw,
        "ocmf_stop_raw": tx.ocmf_stop_raw,
    }


@router.get("/transactions/{tx_id}/download")
async def download_transaction_ocmf_file(tx_id: int, db: AsyncSession = Depends(get_db)):
    """
    Download official .ocmf file for S.A.F.E. Transparency Software.
    """
    r_tx = await db.execute(
        select(Transaction).where(
            (Transaction.id == tx_id) | (Transaction.transaction_id == tx_id)
        )
    )
    tx = r_tx.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    content_lines = []
    if tx.ocmf_start_raw:
        content_lines.append(tx.ocmf_start_raw.strip())
    if tx.ocmf_stop_raw:
        content_lines.append(tx.ocmf_stop_raw.strip())

    if not content_lines:
        raise HTTPException(status_code=400, detail="Esta transação não possui dados OCMF assinados pelo medidor")

    file_content = "\n".join(content_lines) + "\n"
    filename = f"transaction_{tx.transaction_id}_eichrecht.ocmf"

    return Response(
        content=file_content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
