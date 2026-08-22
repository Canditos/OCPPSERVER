from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db, AsyncSessionLocal
from models.authorized_tag import AuthorizedTag
from pydantic import BaseModel


router = APIRouter(prefix="/tags", tags=["tags"])


class TagCreate(BaseModel):
    id_tag: str
    description: str | None = None


class TagOut(BaseModel):
    id: int
    id_tag: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[TagOut])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuthorizedTag).where(AuthorizedTag.is_active == True).order_by(AuthorizedTag.id))
    return list(result.scalars().all())


@router.post("", response_model=TagOut)
async def create_tag(req: TagCreate, db: AsyncSession = Depends(get_db)):
    # Check if tag already exists
    result = await db.execute(select(AuthorizedTag).where(AuthorizedTag.id_tag == req.id_tag))
    existing = result.scalar_one_or_none()
    if existing:
        # Reactivate if inactive
        existing.is_active = True
        existing.description = req.description or existing.description
        await db.commit()
        await db.refresh(existing)
        return existing
    tag = AuthorizedTag(id_tag=req.id_tag, description=req.description)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuthorizedTag).where(AuthorizedTag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.is_active = False
    await db.commit()
    return {"status": "ok"}


async def get_default_tag() -> str | None:
    """Get the first active authorized tag, or None."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AuthorizedTag).where(AuthorizedTag.is_active == True).order_by(AuthorizedTag.id).limit(1)
        )
        tag = result.scalar_one_or_none()
        return tag.id_tag if tag else None
