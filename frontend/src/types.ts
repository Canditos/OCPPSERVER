export interface Connector {
  connector_id: number
  status: string
  error_code: string | null
  updated_at: string | null
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
  last_seen: string | null
  registered_at: string | null
  client_ip: string | null
  connectors: Connector[]
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
  type: string
  data: Record<string, unknown>
}
