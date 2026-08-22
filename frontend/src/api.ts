import axios from 'axios'
import { API_BASE } from './config'
import type { Charger, Transaction, MeterValue, ConfigurationItem, OcppMessage } from './types'

const http = axios.create({ baseURL: API_BASE ? `${API_BASE}/api` : '/api' })

export interface AuthorizedTag {
  id: number
  id_tag: string
  description: string | null
  is_active: boolean
}

export const api = {
  getChargers: () => http.get<Charger[]>('/chargers').then(r => r.data),
  getCharger: (id: string) => http.get<Charger>(`/chargers/${id}`).then(r => r.data),
  getMessages: (id: string, limit = 100) =>
    http.get<OcppMessage[]>(`/chargers/${id}/messages?limit=${limit}`).then(r => r.data),

  getTransactions: (cp_id?: string, status?: string) => {
    const params = new URLSearchParams()
    if (cp_id) params.set('cp_id', cp_id)
    if (status) params.set('status', status)
    return http.get<Transaction[]>(`/transactions?${params}`).then(r => r.data)
  },
  getActiveTransaction: (cp_id: string) =>
    http.get<Transaction | null>(`/transactions/active/${cp_id}`).then(r => r.data),
  getMeterValues: (txId: number) =>
    http.get<MeterValue[]>(`/transactions/${txId}/meter-values`).then(r => r.data),
  getLiveMeterValues: (cpId: string, connectorId = 1) =>
    http.get<MeterValue[]>(`/transactions/charger/${cpId}/meter-values/live?connector_id=${connectorId}`).then(r => r.data),

  getConfiguration: (cpId: string) =>
    http.get<ConfigurationItem[]>(`/configuration/${cpId}`).then(r => r.data),

  // Tags
  getTags: () => http.get<AuthorizedTag[]>('/tags').then(r => r.data),
  createTag: (id_tag: string, description?: string) =>
    http.post<AuthorizedTag>('/tags', { id_tag, description }).then(r => r.data),
  deleteTag: (tagId: number) =>
    http.delete(`/tags/${tagId}`).then(r => r.data),

  // Smart Charging
  getSmartChargingPresets: () =>
    http.get<SmartChargingPreset[]>('/smart-charging/presets').then(r => r.data),
  getSmartChargingProfiles: (cpId?: string) => {
    const params = new URLSearchParams()
    if (cpId) params.set('cp_id', cpId)
    return http.get<SmartChargingProfile[]>(`/smart-charging/profiles?${params}`).then(r => r.data)
  },
  createSmartChargingProfile: (data: Partial<SmartChargingProfile>) =>
    http.post('/smart-charging/profiles', data).then(r => r.data),
  deleteSmartChargingProfile: (profileId: number) =>
    http.delete(`/smart-charging/profiles/${profileId}`).then(r => r.data),
  applySmartChargingProfile: (profileId: number, cpId?: string) =>
    http.post<{ status: string; profile_id: number; ocpp_payload: any }>('/smart-charging/apply', {
      profile_id: profileId,
      charge_point_id: cpId,
    }).then(r => r.data),
  clearSmartChargingProfile: (data: {
    charge_point_id: string
    profile_id?: number
    connector_id?: number
    purpose?: string
    stack_level?: number
  }) => http.post<{ status: string }>('/smart-charging/clear', data).then(r => r.data),
  getCompositeSchedule: (data: {
    charge_point_id: string
    connector_id: number
    duration: number
    rate_unit?: string
  }) => http.post<{ status: string; connector_id: number; schedule_start?: string; charging_schedule?: any }>('/smart-charging/composite-schedule', data).then(r => r.data),

  // Commands
  remoteStart: (charge_point_id: string, id_tag: string, connector_id?: number) =>
    http.post('/commands/remote-start', { charge_point_id, id_tag, connector_id }).then(r => r.data),
  remoteStop: (charge_point_id: string, transaction_id?: number | null) =>
    http.post('/commands/remote-stop', { charge_point_id, transaction_id: transaction_id || null }).then(r => r.data),
  reset: (charge_point_id: string, reset_type: string) =>
    http.post('/commands/reset', { charge_point_id, reset_type }).then(r => r.data),
  changeConfiguration: (charge_point_id: string, key: string, value: string) =>
    http.post('/commands/change-configuration', { charge_point_id, key, value }).then(r => r.data),
  getConfigurationRemote: (charge_point_id: string, keys?: string[]) =>
    http.post('/commands/get-configuration', { charge_point_id, keys }).then(r => r.data),
  clearCache: (charge_point_id: string) =>
    http.post('/commands/clear-cache', { charge_point_id }).then(r => r.data),
  unlockConnector: (charge_point_id: string, connector_id: number) =>
    http.post('/commands/unlock-connector', { charge_point_id, connector_id }).then(r => r.data),
  changeAvailability: (charge_point_id: string, connector_id: number, availability_type: string) =>
    http.post('/commands/change-availability', { charge_point_id, connector_id, availability_type }).then(r => r.data),
  triggerMessage: (charge_point_id: string, requested_message: string, connector_id?: number) =>
    http.post('/commands/trigger-message', { charge_point_id, requested_message, connector_id }).then(r => r.data),
  reserveNow: (charge_point_id: string, connector_id: number, expiry_date: string, id_tag: string, reservation_id: number) =>
    http.post('/commands/reserve-now', { charge_point_id, connector_id, expiry_date, id_tag, reservation_id }).then(r => r.data),
  cancelReservation: (charge_point_id: string, reservation_id: number) =>
    http.post('/commands/cancel-reservation', { charge_point_id, reservation_id }).then(r => r.data),
  getConnected: () =>
    http.get<{ connected: string[] }>('/commands/connected').then(r => r.data),
}

export interface SchedulePeriod {
  start_period: number
  limit: number
  number_phases?: number
  label?: string
}

export interface SmartChargingPreset {
  id: string
  name: string
  description: string
  purpose: string
  kind: string
  recurrency_kind?: string
  charging_rate_unit: string
  duration: number
  periods: SchedulePeriod[]
}

export interface SmartChargingProfile {
  id: number
  profile_id: number
  charge_point_id: string
  connector_id: number
  name: string
  stack_level: number
  purpose: string
  kind: string
  recurrency_kind?: string | null
  valid_from?: string | null
  valid_to?: string | null
  duration?: number | null
  charging_rate_unit: string
  min_charging_rate?: number | null
  periods: SchedulePeriod[]
  is_deployed: boolean
  created_at?: string | null
}


