import { Link } from 'react-router-dom'
import { Zap, Wifi, WifiOff, Clock, Plug } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useChargerStore } from '../store/chargerStore'
import { ConnectorBadge } from './ConnectorBadge'
import type { Charger } from '../types'

function LiveKw({ watts }: { watts: number }) {
  const kw = (watts / 1000).toFixed(1)
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gradient-blue">{kw}</span>
      <span className="text-xs text-gray-500 font-medium">kW</span>
    </div>
  )
}

export function ChargerCard({ charger }: { charger: Charger }) {
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])

  const isOnline  = live?.isOnline  ?? charger.is_online
  const isCharging = Object.values(live?.connectors ?? {}).some((c) => c.status === 'Charging')
  const isFaulted  = Object.values(live?.connectors ?? {}).some((c) => c.status === 'Faulted')

  const connectors = live?.connectors
    ? Object.entries(live.connectors).map(([id, c]) => ({ connector_id: Number(id), ...c }))
    : charger.connectors ?? []

  const livePower = live?.meters
    ? Object.values(live.meters)
        .flatMap((m) => Object.entries(m))
        .filter(([k]) => k.toLowerCase().includes('power') || k.toLowerCase().includes('active'))
        .map(([, v]) => Number(v.value))
        .reduce((a, b) => a + b, 0)
    : null

  const cardGlow = isCharging ? 'card-glow-blue' : isFaulted ? 'card-glow-red' : isOnline ? 'card-glow-emerald' : ''

  const lastSeen = live?.lastSeen
    ? formatDistanceToNow(new Date(live.lastSeen), { addSuffix: true })
    : charger.last_seen
    ? formatDistanceToNow(new Date(charger.last_seen), { addSuffix: true })
    : null

  return (
    <Link to={`/chargers/${charger.charge_point_id}`}>
      <div className={`charger-card ${cardGlow}`}>

        {/* top stripe when charging */}
        {isCharging && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-shimmer bg-[length:200%_auto]" />
        )}

        {/* header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center w-10 h-10 rounded-xl ${
              isCharging ? 'bg-blue-500/20 animate-glow-blue'
              : isFaulted ? 'bg-red-500/20 animate-glow-red'
              : isOnline  ? 'bg-emerald-500/15'
              : 'bg-gray-800/60'
            }`}>
              {isCharging ? (
                <Zap className="w-5 h-5 text-blue-400 animate-charge-bolt" fill="currentColor" />
              ) : isFaulted ? (
                <Zap className="w-5 h-5 text-red-400" />
              ) : (
                <Plug className={`w-5 h-5 ${isOnline ? 'text-emerald-400' : 'text-gray-600'}`} />
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-100 leading-tight">{charger.charge_point_id}</p>
              <p className="text-xs text-gray-600 mt-0.5">{charger.model ?? '—'} · {charger.vendor ?? '—'}</p>
            </div>
          </div>

          {/* online badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isOnline
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-gray-800/60 text-gray-600 border border-gray-700/30'
          }`}>
            {isOnline ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Online
              </>
            ) : (
              <><WifiOff className="w-3 h-3" />Offline</>
            )}
          </div>
        </div>

        {/* live power (only when charging) */}
        {isCharging && (
          <div className="mb-4 p-3 rounded-xl bg-blue-500/8 border border-blue-500/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 animate-pulse-slow" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Potência</p>
                  {livePower !== null ? <LiveKw watts={livePower} /> : (
                    <div className="flex items-center gap-1 text-blue-400">
                      <Zap className="w-3 h-3" />
                      <span className="text-sm font-medium">A carregar…</span>
                    </div>
                  )}
                </div>
              </div>
              {/* animated charging bars */}
              <div className="flex items-end gap-0.5 h-8">
                {[3, 5, 7, 5, 4, 6, 8].map((h, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-blue-500/60 animate-pulse-slow"
                    style={{ height: `${h * 3}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* connectors */}
        {connectors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <ConnectorBadge
                key={c.connector_id}
                connectorId={c.connector_id}
                status={c.status}
              />
            ))}
          </div>
        )}

        {/* footer */}
        {lastSeen && (
          <div className="flex items-center gap-1 mt-4 pt-3 border-t border-white/5 text-xs text-gray-600">
            <Clock className="w-3 h-3" />
            {lastSeen}
          </div>
        )}
      </div>
    </Link>
  )
}
