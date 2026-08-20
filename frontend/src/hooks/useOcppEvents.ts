import { useEffect, useRef } from 'react'
import { useChargerStore } from '../store/chargerStore'
import { WS_BASE } from '../config'
import type { OcppEvent } from '../types'

export function useOcppEvents() {
  const updateFromEvent = useChargerStore((s) => s.updateFromEvent)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const base = WS_BASE || `${proto}//${window.location.host}`
        const ws = new WebSocket(`${base}/ws/events`)
        wsRef.current = ws

        ws.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data) as OcppEvent
            if (event.type !== 'ping') updateFromEvent(event)
          } catch {
            // ignore parse errors
          }
        }

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch (err) {
        console.error('WebSocket connection error:', err)
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [updateFromEvent])
}
