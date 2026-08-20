from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    charge_point_id: Mapped[str] = mapped_column(String(64))
    connector_id: Mapped[int] = mapped_column(Integer)
    id_tag: Mapped[str] = mapped_column(String(64))
    meter_start: Mapped[int] = mapped_column(Integer, default=0)
    meter_stop: Mapped[int | None] = mapped_column(Integer)
    start_time: Mapped[datetime] = mapped_column(DateTime)
    stop_time: Mapped[datetime | None] = mapped_column(DateTime)
    stop_reason: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="Active")

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

    transaction: Mapped["Transaction"] = relationship(back_populates="meter_values")
