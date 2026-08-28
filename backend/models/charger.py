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
    security_profile: Mapped[int] = mapped_column(Integer, default=0)
    auth_password: Mapped[str | None] = mapped_column(String(128), nullable=True)
    auth_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # OCPP Dual-Stack & ISO 15118 fields
    ocpp_version: Mapped[str] = mapped_column(String(16), default="1.6")  # "1.6" or "2.0.1"
    iso15118_pnc_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_eichrecht_compliant: Mapped[bool] = mapped_column(Boolean, default=False)

    connectors: Mapped[list["Connector"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    configurations: Mapped[list["ChargerConfiguration"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    messages: Mapped[list["OcppMessage"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    certificates: Mapped[list["ChargerCertificate"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    device_components: Mapped[list["DeviceComponent"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")
    meter_public_keys: Mapped[list["MeterPublicKey"]] = relationship(back_populates="charger", cascade="all, delete-orphan", lazy="selectin")


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    connector_id: Mapped[int] = mapped_column(Integer)
    evse_id: Mapped[int | None] = mapped_column(Integer, default=1)
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
    payload: Mapped[str] = mapped_column(String(8192))
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


class ChargerCertificate(Base):
    __tablename__ = "certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("chargers.id"), nullable=True, index=True)
    charge_point_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    certificate_type: Mapped[str] = mapped_column(String(64), default="CentralSystemRootCertificate")
    serial_number: Mapped[str] = mapped_column(String(128))
    issuer_name_hash: Mapped[str | None] = mapped_column(String(128))
    issuer_key_hash: Mapped[str | None] = mapped_column(String(128))
    subject_cn: Mapped[str | None] = mapped_column(String(128))
    issuer_cn: Mapped[str | None] = mapped_column(String(128))
    valid_from: Mapped[datetime | None] = mapped_column(DateTime)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime)
    certificate_pem: Mapped[str] = mapped_column(String(8192))
    status: Mapped[str] = mapped_column(String(32), default="Active")
    installed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charger: Mapped["Charger"] = relationship(back_populates="certificates")


class DeviceComponent(Base):
    __tablename__ = "device_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charger_id: Mapped[int] = mapped_column(Integer, ForeignKey("chargers.id"), index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    instance: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evse_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    connector_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charger: Mapped["Charger"] = relationship(back_populates="device_components")
    variables: Mapped[list["DeviceVariable"]] = relationship(back_populates="component", cascade="all, delete-orphan", lazy="selectin")


class DeviceVariable(Base):
    __tablename__ = "device_variables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    component_id: Mapped[int] = mapped_column(Integer, ForeignKey("device_components.id"), index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    instance: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mutability: Mapped[str | None] = mapped_column(String(32), default="ReadWrite")
    data_type: Mapped[str | None] = mapped_column(String(32), default="string")
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    min_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    component: Mapped["DeviceComponent"] = relationship(back_populates="variables")
