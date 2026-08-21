import axios from 'axios'
import { API_BASE } from './config'
import type { Charger, Transaction, MeterValue, ConfigurationItem, OcppMessage, AuthToken } from './types'

const http = axios.create({ baseURL: API_BASE ? `${API_BASE}/api` : '/api' })

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
  getMeterValues: (txId: number) =>
    http.get<MeterValue[]>(`/transactions/${txId}/meter-values`).then(r => r.data),
  getLiveMeterValues: (cpId: string, connectorId = 1) =>
    http.get<MeterValue[]>(`/transactions/charger/${cpId}/meter-values/live?connector_id=${connectorId}`).then(r => r.data),

  getConfiguration: (cpId: string) =>
    http.get<ConfigurationItem[]>(`/configuration/${cpId}`).then(r => r.data),

  // Commands
  remoteStart: (charge_point_id: string, id_tag: string, connector_id?: number) =>
    http.post('/commands/remote-start', { charge_point_id, id_tag, connector_id }).then(r => r.data),
  remoteStop: (charge_point_id: string, transaction_id: number) =>
    http.post('/commands/remote-stop', { charge_point_id, transaction_id }).then(r => r.data),
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

  // Auth tokens
  getAuthTokens: () =>
    http.get<AuthToken[]>('/auth-tokens').then(r => r.data),
  createAuthToken: (data: { id_tag: string; name: string; type: string; status?: string; expiry_date?: string | null; note?: string | null }) =>
    http.post<AuthToken>('/auth-tokens', data).then(r => r.data),
  updateAuthToken: (id: number, data: Partial<{ name: string; status: string; expiry_date: string | null; note: string | null }>) =>
    http.put<AuthToken>(`/auth-tokens/${id}`, data).then(r => r.data),
  deleteAuthToken: (id: number) =>
    http.delete(`/auth-tokens/${id}`),
  syncAuthTokens: (cpId: string) =>
    http.post(`/auth-tokens/sync/${cpId}`).then(r => r.data),
  setAutocharge: (cpId: string, enabled: boolean) =>
    http.patch(`/chargers/${cpId}/autocharge`, { enabled }).then(r => r.data),

  // Smart Charging
  getChargingProfiles: (cpId?: string) =>
    http.get('/smart-charging', { params: cpId ? { charge_point_id: cpId } : {} }).then(r => r.data),
  setChargingProfile: (data: {
    charge_point_id: string
    connector_id?: number
    limit_amps?: number
    limit_watts?: number
    rate_unit?: 'A' | 'W'
    purpose?: string
    stack_level?: number
    label: string
    schedule_periods?: { start_period: number; limit: number }[]
    duration?: number | null
  }) => http.post('/smart-charging/set', data).then(r => r.data),
  clearChargingProfile: (data: {
    charge_point_id: string
    connector_id?: number | null
    purpose?: string | null
    stack_level?: number | null
  }) => http.delete('/smart-charging/clear', { data }).then(r => r.data),
}
