import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { safeFormatDate, safeFormatDistance } from '../utils/date'
import { ArrowLeft, Cpu, Wifi, WifiOff, Activity, MessageSquare, Zap } from 'lucide-react'

import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import { EventLog } from '../components/EventLog'
import { ConnectorBadge } from '../components/ConnectorBadge'
import { AvailabilityMonitor } from '../components/AvailabilityMonitor'
import { useChargerStore } from '../store/chargerStore'
import type { Charger, OcppMessage } from '../types'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-600 font-medium">{label}</span>
      <span className="text-xs text-gray-300 font-mono text-right max-w-[60%] break-all">{value}</span>
    </div>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  return direction === 'IN' ? (
    <span className="badge bg-blue-500/15 text-blue-400 border border-blue-500/20">↓ IN</span>
  ) : (
    <span className="badge bg-violet-500/15 text-violet-400 border border-violet-500/20">↑ OUT</span>
  )
}

export function ChargerDetail() {
  const { id } = useParams<{ id: string }>()
  const live    = useChargerStore((s) => s.liveState[id ?? ''])

  const { data: charger } = useQuery<Charger>({
    queryKey: ['charger', id],
    queryFn:  () => api.getCharger(id!),
    enabled:  !!id,
    refetchInterval: 10000,
  })

  const { data: messages = [] } = useQuery<OcppMessage[]>({
    queryKey: ['messages', id],
    queryFn:  () => api.getMessages(id!),
    enabled:  !!id,
    refetchInterval: 5000,
  })

  const isOnline   = live?.isOnline ?? charger?.is_online ?? false
  const connectors = live?.connectors
    ? Object.entries(live.connectors).map(([cid, c]) => ({ connector_id: Number(cid), ...c }))
    : charger?.connectors ?? []

  const isCharging = connectors.some((c) => c.status === 'Charging')

  const liveMeters = live?.meters
    ? Object.values(live.meters).flatMap((m) => Object.entries(m).map(([k, v]) => ({ key: k, ...v })))
    : []

  if (!charger) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 text-gray-700 animate-pulse-slow" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* back + header */}
      <div className="flex items-start gap-4">
        <Link to="/" className="btn-ghost p-2 mt-0.5 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`relative p-2.5 rounded-xl ${
              isCharging ? 'bg-blue-500/20 animate-glow-blue'
              : isOnline ? 'bg-emerald-500/15'
              : 'bg-gray-800'
            }`}>
              <Zap className={`w-5 h-5 ${isCharging ? 'text-blue-400 animate-charge-bolt' : isOnline ? 'text-emerald-400' : 'text-gray-600'}`}
                fill={isCharging ? 'currentColor' : 'none'} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">{charger.charge_point_id}</h1>
              <p className="text-sm text-gray-600">{charger.vendor} · {charger.model}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isOnline ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-gray-500 text-xs font-medium border border-gray-700/40">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* left column */}
        <div className="space-y-5">
          {/* device info */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dispositivo</h3>
            </div>
            <InfoRow label="Charge Point ID" value={charger.charge_point_id} />
            <InfoRow label="Fabricante"  value={charger.vendor} />
            <InfoRow label="Modelo"      value={charger.model} />
            <InfoRow label="Firmware"    value={charger.firmware_version} />
            <InfoRow label="Nº Série"    value={charger.serial_number} />
            <InfoRow label="ICCID"       value={charger.iccid} />
            <InfoRow label="IMSI"        value={charger.imsi} />
            <InfoRow label="IP"          value={charger.client_ip} />
            <InfoRow label="Registado"   value={safeFormatDate(charger.registered_at)} />
            <InfoRow label="Último sinal" value={safeFormatDistance(charger.last_seen)} />

          </div>

          {/* connectors */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conectores</h3>
            </div>
            {connectors.length === 0 ? (
              <p className="text-xs text-gray-700">Sem dados de conector</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectors.map((c) => (
                  <ConnectorBadge key={c.connector_id} connectorId={c.connector_id} status={c.status} errorCode={(c as { error_code?: string }).error_code} />
                ))}
              </div>
            )}
          </div>

          {/* live meters snapshot */}
          {liveMeters.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Leituras live</h3>
                <span className="live-pill ml-auto">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  LIVE
                </span>
              </div>
              <div className="space-y-2">
                {liveMeters.slice(0, 6).map((m) => (
                  <div key={m.key} className="flex justify-between items-center py-1.5 border-b border-white/4 last:border-0">
                    <span className="text-xs text-gray-600 truncate max-w-[55%]">{m.key}</span>
                    <span className="text-xs font-mono text-amber-400 font-medium">{m.value} {m.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right columns */}
        <div className="xl:col-span-2 space-y-5">
          {/* availability monitor */}
          <AvailabilityMonitor chargePointId={charger.charge_point_id} />

          {/* meter chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">MeterValues</h3>
            </div>
            <MeterChart cpId={charger.charge_point_id} connectorId={1} />
          </div>

          {/* events */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Eventos</h3>
            </div>
            <EventLog cpId={charger.charge_point_id} maxHeight="280px" />
          </div>

          {/* message log */}
          {messages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-gray-600" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Log OCPP</h3>
                <span className="text-xs text-gray-700 ml-auto">{messages.length} msgs</span>
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="border-b border-white/6" style={{ background: 'rgba(10,14,26,0.95)' }}>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Dir</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Action</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Timestamp</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.slice(0, 50).map((m) => (
                        <tr key={m.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                          <td className="px-4 py-2"><DirectionBadge direction={m.direction} /></td>
                          <td className="px-4 py-2 font-mono text-gray-300">{m.action}</td>
                          <td className="px-4 py-2 text-gray-600 font-mono whitespace-nowrap">
                            {format(new Date(m.timestamp), 'HH:mm:ss')}
                          </td>
                          <td className="px-4 py-2 text-gray-700 font-mono truncate max-w-xs">
                            {typeof m.payload === 'string' ? m.payload.substring(0, 80) : JSON.stringify(m.payload).substring(0, 80)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
