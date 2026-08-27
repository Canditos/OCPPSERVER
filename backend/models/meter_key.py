from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class MeterPublicKey(Base):
    __tablename__ = "meter_public_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id", ondelete="CASCADE"), index=True)
    charge_point_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_id: Mapped[int] = mapped_column(Integer, default=1)
    meter_model: Mapped[str] = mapped_column(String(64), default="LEM DCBM 400")
    serial_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    public_key_hex: Mapped[str] = mapped_column(Text)
    public_key_pem: Mapped[str | None] = mapped_column(Text, nullable=True)
    curve_name: Mapped[str] = mapped_column(String(32), default="secp256r1")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
