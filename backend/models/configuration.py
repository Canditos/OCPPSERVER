from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class ChargerConfiguration(Base):
    __tablename__ = "charger_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    key: Mapped[str] = mapped_column(String(128))
    value: Mapped[str | None] = mapped_column(String(512))
    readonly: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charger: Mapped["Charger"] = relationship(back_populates="configurations")

