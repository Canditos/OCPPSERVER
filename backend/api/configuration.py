from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.charger import Charger
from models.configuration import ChargerConfiguration
from schemas import ConfigurationItemOut

router = APIRouter(prefix="/configuration", tags=["configuration"])


@router.get("/{cp_id}", response_model=list[ConfigurationItemOut])
async def get_stored_config(cp_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Charger).where(Charger.charge_point_id == cp_id))
    charger = result.scalar_one_or_none()
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    r2 = await db.execute(
        select(ChargerConfiguration)
        .where(ChargerConfiguration.charger_id == charger.id)
        .order_by(ChargerConfiguration.key)
    )
    return list(r2.scalars().all())
