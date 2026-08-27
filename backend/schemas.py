from datetime import datetime
from pydantic import BaseModel


class ConnectorOut(BaseModel):
    connector_id: int
    status: str
    error_code: str | None
    updated_at: datetime | None
    active_transaction_id: int | None = None
    active_id_tag: str | None = None
    active_username: str | None = None
    active_user_role: str | None = None
    active_power_kw: float | None = None
    active_power_w: float | None = None
    active_energy_kwh: float | None = None
    active_soc: float | None = None
    active_start_time: datetime | None = None

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
    timezone: str | None = "Europe/Lisbon"
    security_profile: int = 0
    auth_password: str | None = None
    auth_enabled: bool = False
    is_eichrecht_compliant: bool = False
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
    user_username: str | None = None
    user_email: str | None = None
    user_role: str | None = None

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
    transaction_id: int | None = None


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


class ChargerSecurityUpdate(BaseModel):
    security_profile: int = 0  # 0: Unsecure, 1: Basic Auth, 2: TLS + Basic Auth
    auth_password: str | None = None
    auth_enabled: bool = False


class GenerateKeyResponse(BaseModel):
    charge_point_id: str
    authorization_key: str
    basic_auth_header: str


class SyncKeyResponse(BaseModel):
    charge_point_id: str
    status: str
    key_applied: str


# ── X.509 Certificate Schemas (Security Profile 3) ───────────────────────────

class CertificateOut(BaseModel):
    id: int
    charger_id: int | None
    charge_point_id: str | None
    certificate_type: str
    serial_number: str
    issuer_name_hash: str | None
    issuer_key_hash: str | None
    subject_cn: str | None
    issuer_cn: str | None
    valid_from: datetime | None
    valid_to: datetime | None
    certificate_pem: str
    status: str
    installed_at: datetime | None
    created_at: datetime | None

    class Config:
        from_attributes = True


class InstallCertificateRequest(BaseModel):
    certificate_type: str = "CentralSystemRootCertificate"  # CentralSystemRootCertificate, ManufacturerRootCertificate
    certificate_pem: str | None = None  # If None, automatically sends the CSMS Root CA


class IssueClientCertRequest(BaseModel):
    validity_days: int = 365
    organization: str = "Canditos EV Charging"


class IssueClientCertResponse(BaseModel):
    charge_point_id: str
    certificate_pem: str
    private_key_pem: str
    ca_root_pem: str
    serial_number: str
    valid_from: str
    valid_to: str


