import { create } from 'zustand'
import type { OcppEvent } from '../types'

interface LiveMeter {
  value: number
  unit: string | null
  timestamp: string
}

interface ConnectorLive {
  status: string
  errorCode?: string
}

export interface ChargerLiveState {
  status: string
  isOnline: boolean
  connectors: Record<number, ConnectorLive>
  lastSeen: string | null
  meters: Record<string, LiveMeter>
  connectorMeters?: Record<number, Record<string, LiveMeter>>
}

interface ChargerStore {
  liveState: Record<string, ChargerLiveState>
  events: OcppEvent[]
  updateFromEvent: (event: OcppEvent) => void
}

function deriveChargerStatus(connectors: Record<number, ConnectorLive>): string {
  const statuses = Object.values(connectors).map((c) => c.status)
  if (statuses.some((s) => s === 'Charging')) return 'Charging'
  if (statuses.some((s) => s === 'Faulted')) return 'Faulted'
  if (statuses.some((s) => s === 'Preparing')) return 'Preparing'
  if (statuses.some((s) => s === 'Finishing')) return 'Finishing'
  if (statuses.some((s) => s === 'SuspendedEV' || s === 'SuspendedEVSE')) return 'SuspendedEV'
  if (statuses.length > 0 && statuses.every((s) => s === 'Available')) return 'Available'
  return 'Available'
}

export const useChargerStore = create<ChargerStore>((set) => ({
  liveState: {},
  events: [],

  updateFromEvent: (event) => {
    set((state) => {
      const events = [event, ...state.events].slice(0, 200)
      const live = { ...state.liveState }

      const cpId = (event.data as Record<string, string>).charge_point_id
      if (!cpId) return { events }

      const cur: ChargerLiveState = live[cpId] ?? {
        status: 'Available',
        isOnline: true,
        connectors: {},
        lastSeen: new Date().toISOString(),
        meters: {},
        connectorMeters: {},
      }

      if (event.type === 'charger_connected') {
        live[cpId] = { ...cur, isOnline: true, status: 'Available', lastSeen: new Date().toISOString() }
      } else if (event.type === 'charger_disconnected') {
        live[cpId] = { ...cur, isOnline: false, status: 'Offline', lastSeen: new Date().toISOString() }
      } else if (event.type === 'status_notification') {
        const d = event.data as Record<string, string | number>
        const connId = Number(d.connector_id ?? 1)
        const status = String(d.status ?? 'Available')

        if (connId === 0) {
          // charger-level status (firmware update, etc.)
          live[cpId] = { ...cur, status: d.status as string, isOnline: true }
        } else {
          const updatedConnectors = {
            ...cur.connectors,
            [connId]: { status: d.status as string, errorCode: d.error_code as string | undefined },
          }
          live[cpId] = {
            ...cur,
            isOnline: true,
            connectors: updatedConnectors,
            status: deriveChargerStatus(updatedConnectors),
          }
        }
      } else if (event.type === 'heartbeat') {
        live[cpId] = {
          ...cur,
          isOnline: true,
          status: (cur.status === 'Unknown' || cur.status === 'Offline') ? 'Available' : cur.status,
          lastSeen: new Date().toISOString(),
        }
      } else if (event.type === 'transaction_stopped') {
        live[cpId] = {
          ...cur,
          isOnline: true,
          status: 'Available',
          lastSeen: new Date().toISOString(),
        }
      } else if (event.type === 'transaction_started') {
        live[cpId] = {
          ...cur,
          isOnline: true,
          status: 'Charging',
          lastSeen: new Date().toISOString(),
        }
      } else if (event.type === 'meter_values') {
        const d = event.data as { connector_id?: number; values: Array<{ measurand: string; value: number; unit: string; timestamp: string }> }
        const connId = Number(d.connector_id ?? 1)
        const meters = { ...cur.meters }
        const connectorMeters = { ...(cur.connectorMeters || {}) }
        const currentConnMeters = { ...(connectorMeters[connId] || {}) }

        for (const v of d.values ?? []) {
          meters[v.measurand] = { value: v.value, unit: v.unit, timestamp: v.timestamp }
          currentConnMeters[v.measurand] = { value: v.value, unit: v.unit, timestamp: v.timestamp }
        }
        connectorMeters[connId] = currentConnMeters
        live[cpId] = { ...cur, meters, connectorMeters }
      } else if (event.type === 'transaction_started') {
        const d = event.data as Record<string, string | number>
        const connId = d.connector_id as number
        if (connId) {
          const updatedConnectors = {
            ...cur.connectors,
            [connId]: { status: 'Charging', errorCode: undefined },
          }
          live[cpId] = { ...cur, connectors: updatedConnectors, status: 'Charging' }
        } else {
          live[cpId] = { ...cur, status: 'Charging' }
        }
      } else if (event.type === 'transaction_stopped') {
        // Don't reset status here — wait for StatusNotification from the charger
        // which gives the authoritative Available/Finishing state
      }

      return { liveState: live, events }
    })
  },
}))
