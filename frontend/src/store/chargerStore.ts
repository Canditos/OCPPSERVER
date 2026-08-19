import { create } from 'zustand'
import type { OcppEvent } from '../types'

interface LiveMeter {
  value: number
  unit: string | null
  timestamp: string
}

interface ChargerLiveState {
  status: string
  connectors: Record<number, string>
  lastSeen: string | null
  meters: Record<string, LiveMeter>
}

interface ChargerStore {
  liveState: Record<string, ChargerLiveState>
  events: OcppEvent[]
  updateFromEvent: (event: OcppEvent) => void
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
        status: 'Unknown',
        connectors: {},
        lastSeen: null,
        meters: {},
      }

      if (event.type === 'charger_connected') {
        live[cpId] = { ...cur, status: 'Available', lastSeen: new Date().toISOString() }
      } else if (event.type === 'charger_disconnected') {
        live[cpId] = { ...cur, status: 'Offline', lastSeen: new Date().toISOString() }
      } else if (event.type === 'status_notification') {
        const d = event.data as Record<string, string | number>
        const connId = d.connector_id as number
        if (connId === 0) {
          live[cpId] = { ...cur, status: d.status as string }
        } else {
          live[cpId] = {
            ...cur,
            connectors: { ...cur.connectors, [connId]: d.status as string },
          }
        }
      } else if (event.type === 'heartbeat') {
        live[cpId] = { ...cur, lastSeen: new Date().toISOString() }
      } else if (event.type === 'meter_values') {
        const d = event.data as { values: Array<{ measurand: string; value: number; unit: string; timestamp: string }> }
        const meters = { ...cur.meters }
        for (const v of d.values ?? []) {
          meters[v.measurand] = { value: v.value, unit: v.unit, timestamp: v.timestamp }
        }
        live[cpId] = { ...cur, meters }
      } else if (event.type === 'transaction_started') {
        live[cpId] = { ...cur, status: 'Charging' }
      } else if (event.type === 'transaction_stopped') {
        live[cpId] = { ...cur, status: 'Available' }
      }

      return { liveState: live, events }
    })
  },
}))
