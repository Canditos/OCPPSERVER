from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class AuthorizedTag(Base):
    __tablename__ = "authorized_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_tag: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(256))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
