export interface Connector {
  connector_id: number
  status: string
  error_code: string | null
  updated_at: string | null
  active_transaction_id?: number | null
  active_id_tag?: string | null
  active_username?: string | null
  active_user_role?: string | null
  active_power_kw?: number | null
  active_energy_kwh?: number | null
  active_start_time?: string | null
}

export interface Charger {
  id: number
  charge_point_id: string
  vendor: string | null
  model: string | null
  serial_number: string | null
  firmware_version: string | null
  iccid: string | null
  imsi: string | null
  status: string
  is_online: boolean
  autocharge_enabled: boolean
  last_seen: string | null
  registered_at: string | null
  client_ip: string | null
  timezone?: string | null
  security_profile?: number
  auth_password?: string | null
  auth_enabled?: boolean
  ocpp_version?: string
  iso15118_pnc_enabled?: boolean
  connectors: Connector[]
}

export interface DeviceVariable {
  id: number
  name: string
  instance?: string | null
  value?: string | null
  mutability?: string | null
  data_type?: string | null
  unit?: string | null
  min_limit?: number | null
  max_limit?: number | null
  updated_at?: string | null
}

export interface DeviceComponent {
  id: number
  name: string
  instance?: string | null
  evse_id?: number | null
  connector_id?: number | null
  variables: DeviceVariable[]
}

export interface GenerateKeyResponse {
  charge_point_id: string
  authorization_key: string
  basic_auth_header: string
}

export interface SyncKeyResponse {
  charge_point_id: string
  status: string
  key_applied: string
}

export interface Certificate {
  id: number
  charger_id: number | null
  charge_point_id: string | null
  certificate_type: string
  serial_number: string
  issuer_name_hash: string | null
  issuer_key_hash: string | null
  subject_cn: string | null
  issuer_cn: string | null
  valid_from: string | null
  valid_to: string | null
  certificate_pem: string
  status: 'Active' | 'InstalledOnDevice' | 'Revoked' | 'Expired'
  installed_at: string | null
  created_at: string | null
}

export interface IssueClientCertResponse {
  charge_point_id: string
  certificate_pem: string
  private_key_pem: string
  ca_root_pem: string
  serial_number: string
  valid_from: string
  valid_to: string
}

export interface AuthToken {
  id: number
  id_tag: string
  name: string
  type: 'rfid' | 'pin' | 'vid'
  status: 'Accepted' | 'Blocked' | 'Expired'
  expiry_date: string | null
  note: string | null
  created_at: string
}

export interface Transaction {
  id: number
  transaction_id: number
  charge_point_id: string
  connector_id: number
  id_tag: string
  meter_start: number
  meter_stop: number | null
  start_time: string
  stop_time: string | null
  stop_reason: string | null
  status: string
  energy_kwh: number | null
  user_username?: string | null
  user_email?: string | null
  user_role?: string | null
}

export interface MeterValue {
  id: number
  timestamp: string
  measurand: string
  value: number
  unit: string | null
  context: string | null
  phase: string | null
}

export interface ConfigurationItem {
  id: number
  key: string
  value: string | null
  readonly: boolean
  updated_at: string | null
}

export interface OcppMessage {
  id: number
  direction: string
  action: string
  payload: string
  timestamp: string
}

export interface OcppEvent {
  ts: string
  type: string
  data: Record<string, any>
}
