from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Float, ForeignKey, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    charge_point_id: Mapped[str] = mapped_column(String(64))
    connector_id: Mapped[int] = mapped_column(Integer)
    evse_id: Mapped[int | None] = mapped_column(Integer, default=1)
    id_tag: Mapped[str] = mapped_column(String(64))
    id_token_type: Mapped[str | None] = mapped_column(String(32), default="ISO14443")  # ISO14443, eMAID, MacAddress, Central
    transaction_guid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    meter_start: Mapped[int] = mapped_column(Integer, default=0)
    meter_stop: Mapped[int | None] = mapped_column(Integer)
    start_time: Mapped[datetime] = mapped_column(DateTime)
    stop_time: Mapped[datetime | None] = mapped_column(DateTime)
    stop_reason: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="Active")
    evse_id: Mapped[int | None] = mapped_column(Integer, default=1, nullable=True)
    id_token_type: Mapped[str | None] = mapped_column(String(32), default="ISO14443", nullable=True)
    transaction_guid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ocmf_start_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    ocmf_stop_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    ocmf_verified: Mapped[bool | None] = mapped_column(Boolean, default=False, nullable=True)
    ocmf_verification_error: Mapped[str | None] = mapped_column(String(256), nullable=True)
    ocmf_meter_serial: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signed_energy_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)

    # OCMF / Eichrecht Certification
    ocmf_start_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocmf_stop_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocmf_verified: Mapped[bool | None] = mapped_column(Boolean, default=False, nullable=True)
    ocmf_verification_error: Mapped[str | None] = mapped_column(String(256), nullable=True)
    ocmf_meter_serial: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signed_energy_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)

    charger: Mapped["Charger"] = relationship(back_populates="transactions")
    meter_values: Mapped[list["MeterValue"]] = relationship(back_populates="transaction", cascade="all, delete-orphan", lazy="selectin")


class MeterValue(Base):
    __tablename__ = "meter_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), index=True)
    charger_id: Mapped[int] = mapped_column(Integer, index=True)
    connector_id: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    measurand: Mapped[str] = mapped_column(String(64))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(16))
    context: Mapped[str | None] = mapped_column(String(32))
    phase: Mapped[str | None] = mapped_column(String(16))
    format: Mapped[str | None] = mapped_column(String(32), default="Raw")  # Raw, SignedData

    transaction: Mapped["Transaction"] = relationship(back_populates="meter_values")
