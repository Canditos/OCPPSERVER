from datetime import datetime
from pydantic import BaseModel


class ConnectorOut(BaseModel):
    connector_id: int
    status: str
    error_code: str | None
    updated_at: datetime | None

    class Config:
        from_attributes = True


class ChargerOut(BaseModel):
    id: int
    charge_point_id: str
    vendor: str | None
    model: str | None
    serial_number: str | None
    firmware_version: str | None
    iccid: str | None
    imsi: str | None
    status: str
    is_online: bool
    last_seen: datetime | None
    registered_at: datetime | None
    client_ip: str | None
    connectors: list[ConnectorOut] = []

    class Config:
        from_attributes = True


class TransactionOut(BaseModel):
    id: int
    transaction_id: int
    charge_point_id: str
    connector_id: int
    id_tag: str
    meter_start: int
    meter_stop: int | None
    start_time: datetime
    stop_time: datetime | None
    stop_reason: str | None
    status: str
    energy_kwh: float | None = None

    class Config:
        from_attributes = True


class MeterValueOut(BaseModel):
    id: int
    timestamp: datetime
    measurand: str
    value: float
    unit: str | None
    context: str | None
    phase: str | None

    class Config:
        from_attributes = True


class ConfigurationItemOut(BaseModel):
    id: int
    key: str
    value: str | None
    readonly: bool
    updated_at: datetime | None

    class Config:
        from_attributes = True


class OcppMessageOut(BaseModel):
    id: int
    direction: str
    action: str
    payload: str
    timestamp: datetime

    class Config:
        from_attributes = True


# ── Command request bodies ─────────────────────────────────────────────────

class RemoteStartRequest(BaseModel):
    charge_point_id: str
    id_tag: str
    connector_id: int | None = None


class RemoteStopRequest(BaseModel):
    charge_point_id: str
    transaction_id: int


class ResetRequest(BaseModel):
    charge_point_id: str
    reset_type: str = "Soft"


class ChangeConfigRequest(BaseModel):
    charge_point_id: str
    key: str
    value: str


class GetConfigRequest(BaseModel):
    charge_point_id: str
    keys: list[str] | None = None


class UnlockConnectorRequest(BaseModel):
    charge_point_id: str
    connector_id: int


class ChangeAvailabilityRequest(BaseModel):
    charge_point_id: str
    connector_id: int
    availability_type: str


class TriggerMessageRequest(BaseModel):
    charge_point_id: str
    requested_message: str
    connector_id: int | None = None


class ClearCacheRequest(BaseModel):
    charge_point_id: str


class ReserveNowRequest(BaseModel):
    charge_point_id: str
    connector_id: int
    expiry_date: str
    id_tag: str
    reservation_id: int


class CancelReservationRequest(BaseModel):
    charge_point_id: str
    reservation_id: int


class UpdateFirmwareRequest(BaseModel):
    charge_point_id: str
    location: str
    retrieve_date: str
    retries: int = 3


class GetDiagnosticsRequest(BaseModel):
    charge_point_id: str
    location: str
    retries: int = 3


class SendLocalListRequest(BaseModel):
    charge_point_id: str
    version: int
    update_type: str
    local_authorization_list: list = []
