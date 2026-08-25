from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Boolean, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Charger(Base):
    __tablename__ = "chargers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charge_point_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    vendor: Mapped[str | None] = mapped_column(String(128))
    model: Mapped[str | None] = mapped_column(String(64))
    serial_number: Mapped[str | None] = mapped_column(String(64))
    firmware_version: Mapped[str | None] = mapped_column(String(64))
    iccid: Mapped[str | None] = mapped_column(String(64))
    imsi: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="Offline")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime)
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    client_ip: Mapped[str | None] = mapped_column(String(64))
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    autocharge_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Lisbon")

    connectors: Mapped[list["Connector"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    configurations: Mapped[list["ChargerConfiguration"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    messages: Mapped[list["OcppMessage"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")



class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    connector_id: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="Available")
    error_code: Mapped[str | None] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charger: Mapped["Charger"] = relationship(back_populates="connectors")


class OcppMessage(Base):
    __tablename__ = "ocpp_messages_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    direction: Mapped[str] = mapped_column(String(8))  # "IN" or "OUT"
    action: Mapped[str] = mapped_column(String(64))
    payload: Mapped[str] = mapped_column(String(4096))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charger: Mapped["Charger"] = relationship(back_populates="messages")


class AvailabilityLog(Base):
    __tablename__ = "availability_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    charge_point_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_id: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32))  # Available, Occupied, Charging, Faulted, Offline, Inoperative
    error_code: Mapped[str | None] = mapped_column(String(64))
    info: Mapped[str | None] = mapped_column(String(256))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


