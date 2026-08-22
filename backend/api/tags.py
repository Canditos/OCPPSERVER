from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db, AsyncSessionLocal
from models.authorized_tag import AuthorizedTag
from models.auth_token import AuthToken
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
    tags = list(result.scalars().all())

    # Also include active AuthToken records if not already in list
    auth_result = await db.execute(select(AuthToken).where(AuthToken.status == "Accepted"))
    auth_tokens = list(auth_result.scalars().all())

    tag_names = {t.id_tag for t in tags}
    for at in auth_tokens:
        if at.id_tag not in tag_names:
            tags.append(AuthorizedTag(
                id=10000 + at.id,
                id_tag=at.id_tag,
                description=f"{at.name} ({at.type.upper()})",
                is_active=True
            ))
            tag_names.add(at.id_tag)

    return tags


@router.post("", response_model=TagOut)
async def create_tag(req: TagCreate, db: AsyncSession = Depends(get_db)):
    clean_tag = req.id_tag.strip()
    if not clean_tag:
        raise HTTPException(status_code=400, detail="Tag ID cannot be empty")

    result = await db.execute(select(AuthorizedTag).where(AuthorizedTag.id_tag == clean_tag))
    existing = result.scalar_one_or_none()
    if existing:
        existing.is_active = True
        existing.description = req.description or existing.description
        await db.commit()
        await db.refresh(existing)
        return existing

    tag = AuthorizedTag(id_tag=clean_tag, description=req.description, is_active=True)
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
        if tag:
            return tag.id_tag
        r2 = await db.execute(
            select(AuthToken).where(AuthToken.status == "Accepted").order_by(AuthToken.id).limit(1)
        )
        t2 = r2.scalar_one_or_none()
        return t2.id_tag if t2 else "VERSICHARGE_TAG"
