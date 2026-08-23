import axios from 'axios'
import { API_BASE } from './config'
import type { Charger, Transaction, MeterValue, ConfigurationItem, OcppMessage, AuthToken } from './types'

const http = axios.create({ baseURL: API_BASE ? `${API_BASE}/api` : '/api' })

// Attach Bearer token to all requests
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('ocpp_auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Intercept 401 Unauthorized to auto-redirect to /login
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('ocpp_auth_token')
      localStorage.removeItem('ocpp_auth_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export interface ActiveUserCharge {
  transaction_id: number
  charge_point_id: string
  connector_id: number
  start_time: string | null
  current_power_kw: number
  consumed_kwh: number
}

export interface UserProfile {
  id: number
  username: string
  email: string | null
  role: 'admin' | 'user'
  rfid_tag: string | null
  is_active: boolean
  created_at: string | null
  total_kwh?: number
  total_sessions?: number
  active_charge?: ActiveUserCharge | null
  last_charge_time?: string | null
}

export interface LoginResponse {
  token: string
  user: UserProfile
}

export interface MyActiveCharge {
  transaction_id: number
  charge_point_id: string
  connector_id: number
  start_time: string | null
  meter_start: number | null
  current_power_kw: number
  consumed_kwh: number
  status: string
}

export interface AuthorizedTag {
  id: number
  id_tag: string
  description: string | null
  is_active: boolean
}

export const api = {
  // Auth & User Portal
  login: (credentials: { username: string; password: string }) =>
    http.post<LoginResponse>('/auth/login', credentials).then(r => r.data),
  getMe: () =>
    http.get<UserProfile>('/auth/me').then(r => r.data),
  getUsers: () =>
    http.get<UserProfile[]>('/auth/users').then(r => r.data),
  createUser: (data: { username: string; password: string; email?: string; role: string; rfid_tag?: string }) =>
    http.post<UserProfile>('/auth/users', data).then(r => r.data),
  updateUser: (id: number, data: Partial<{ email: string; role: string; rfid_tag: string; password?: string; is_active?: boolean }>) =>
    http.patch<UserProfile>(`/auth/users/${id}`, data).then(r => r.data),
  deleteUser: (id: number) =>
    http.delete(`/auth/users/${id}`).then(r => r.data),
  getMyTransactions: () =>
    http.get<Transaction[]>('/auth/my-transactions').then(r => r.data),
  getMyActiveCharge: () =>
    http.get<MyActiveCharge | null>('/auth/my-active-charge').then(r => r.data),
  registerDriver: (data: { username: string; password: string; email: string; requested_rfid_tag?: string }) =>
    http.post<{ status: string; message: string; username: string }>('/auth/register', data).then(r => r.data),
  approveUser: (id: number, data: { rfid_tag: string }) =>
    http.post<UserProfile>(`/auth/users/${id}/approve`, data).then(r => r.data),
  notifyMoveCar: (params: { user_id?: number; charge_point_id?: string; connector_id?: number }) =>
    http.post<{ status: string; recipient: string; username: string }>('/auth/notify-move-car', params).then(r => r.data),

  getChargers: () => http.get<Charger[]>('/chargers').then(r => r.data),
  getCharger: (id: string) => http.get<Charger>(`/chargers/${id}`).then(r => r.data),
  getChargerAvailability: (cpId: string) =>
    http.get<AvailabilityData>(`/chargers/${cpId}/availability`).then(r => r.data),
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

export interface SchedulePeriod {
  start_period: number
  limit: number
  number_phases?: number
  label?: string
}

export interface SmartChargingPreset {
  id: string
  category?: 'AC' | 'DC'
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

export interface HourlyTimelineItem {
  hour: string
  status: string
  is_operational: boolean
}

export interface AvailabilityEvent {
  id: number
  timestamp: string | null
  connector_id: number
  status: string
  error_code: string | null
  info: string | null
}

export interface AvailabilityData {
  charge_point_id: string
  is_online: boolean
  status: string
  last_seen: string | null
  heartbeat_age_seconds: number
  heartbeat_status: 'healthy' | 'warning' | 'timeout'
  uptime_24h_pct: number
  uptime_7d_pct: number
  uptime_30d_pct: number
  total_faults_24h: number
  connectors: Array<{
    connector_id: number
    status: string
    error_code: string | null
    updated_at: string | null
  }>
  hourly_timeline: HourlyTimelineItem[]
  recent_events: AvailabilityEvent[]
}



