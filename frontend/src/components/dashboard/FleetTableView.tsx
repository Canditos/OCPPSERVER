import React from 'react'
import { Link } from 'react-router-dom'
import {
  Zap, WifiOff, Plug, AlertCircle, ShieldCheck, Sparkles,
  ArrowRight, Shield, Tag, RotateCcw, Unlock
} from 'lucide-react'
import type { Charger } from '../../types'
import { useChargerStore } from '../../store/chargerStore'
import { useChargerUiStore } from '../../store/chargerUiStore'
import { safeFormatDistance } from '../../utils/date'
import { api } from '../../api'
import { useI18n } from '../../i18n'

interface FleetTableViewProps {
  chargers: Charger[]
  onSelfHealSuccess?: () => void
}

export function FleetTableView({ chargers, onSelfHealSuccess }: FleetTableViewProps) {
  const { t } = useI18n()
  const liveState = useChargerStore((s) => s.liveState)
  const { displayNames, groups } = useChargerUiStore()
  const [healingId, setHealingId] = React.useState<string | null>(null)

  const handleQuickHeal = async (e: React.MouseEvent, cpId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setHealingId(cpId)
    try {
      await api.selfHealCharger(cpId)
      onSelfHealSuccess?.()
    } catch (err) {
      console.error(err)
    } finally {
      setHealingId(null)
    }
  }

  return (
    <div className="card overflow-hidden p-0 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-md">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100/80 dark:bg-gray-950/80 text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">
            <tr>
              <th className="py-3 px-4">{t('dashboard.tableColStation')}</th>
              <th className="py-3 px-4">{t('dashboard.tableColStatus')}</th>
              <th className="py-3 px-4">{t('dashboard.tableColSockets')}</th>
              <th className="py-3 px-4">{t('dashboard.tableColLivePower')}</th>
              <th className="py-3 px-4">{t('dashboard.tableColSession')}</th>
              <th className="py-3 px-4">{t('dashboard.tableColLastSeen')}</th>
              <th className="py-3 px-4 text-right">{t('dashboard.tableColActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-sans">
            {chargers.map((c) => {
              const live = liveState[c.charge_point_id]
              const isOnline = live?.isOnline ?? c.is_online
              const displayName = displayNames[c.charge_point_id] || ''
              const group = groups[c.charge_point_id] || ''

              // Status determination
              const connectors = c.connectors || []
              const isCharging = (live?.connectors && Object.values(live.connectors).some((cc) => cc.status === 'Charging')) ||
                connectors.some((cc) => cc.status === 'Charging') ||
                c.status === 'Charging'
              const isFaulted = (live?.connectors && Object.values(live.connectors).some((cc) => cc.status === 'Faulted')) ||
                connectors.some((cc) => cc.status === 'Faulted') ||
                c.status === 'Faulted'

              const statusLabel = !isOnline
                ? t('dashboard.statusOffline')
                : isCharging
                ? t('dashboard.statusCharging')
                : isFaulted
                ? t('dashboard.statusFaulted')
                : t('dashboard.statusAvailable')
              const statusPillColor = !isOnline
                ? 'bg-slate-200 text-slate-600 dark:bg-gray-800 dark:text-gray-400'
                : isCharging
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                : isFaulted
                ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'

              const isDC = Boolean(
                c.model?.toUpperCase().includes('SICHARGE D') ||
                c.model?.toUpperCase().includes(' DC') ||
                c.model?.toUpperCase().endsWith('-D') ||
                c.vendor?.toUpperCase().includes('DC')
              )

              // Power calculation
              let liveKw: number | null = null
              if (live?.meters) {
                const p = Object.entries(live.meters)
                  .filter(([k]) => k.toLowerCase().includes('power'))
                  .reduce((acc, [, m]) => acc + Number(m.value ?? 0), 0)
                if (p > 0) liveKw = p / 1000
              }
              if (liveKw === null) {
                const restKw = connectors.reduce((acc, conn) => acc + (conn.active_power_kw || 0), 0)
                if (restKw > 0) liveKw = restKw
              }

              const lastSeenStr = safeFormatDistance(live?.lastSeen ?? c.last_seen)
              const hasEichrecht = Boolean(c.is_eichrecht_compliant) || (c.model && /\b(erk|eichrecht|dcbm)\b/i.test(c.model))

              return (
                <tr
                  key={c.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors group"
                >
                  {/* EVSE Name & Meta */}
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-2.5">
                      <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        !isOnline
                          ? 'bg-slate-100 text-slate-400 dark:bg-gray-800'
                          : isCharging
                          ? 'bg-blue-500/15 text-blue-500'
                          : 'bg-emerald-500/15 text-emerald-500'
                      }`}>
                        {isDC ? <Zap className="w-4 h-4" /> : <Plug className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/chargers/${c.charge_point_id}`}
                          className="font-bold text-slate-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block"
                        >
                          {displayName || c.charge_point_id}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400">
                            {c.charge_point_id}
                          </span>
                          {c.vendor && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400">
                              {c.vendor} {c.model ? `· ${c.model}` : ''}
                            </span>
                          )}
                          {isDC && (
                            <span className="text-[9px] font-black px-1 rounded bg-violet-600 text-white">
                              DC
                            </span>
                          )}
                          {hasEichrecht && (
                            <span className="text-[9px] font-bold px-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              ERK
                            </span>
                          )}
                          {group && (
                            <span className="text-[9px] px-1.5 rounded bg-blue-500/10 text-blue-500">
                              {group}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Operational Status */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusPillColor}`}>
                      <span className={`w-2 h-2 rounded-full ${
                        !isOnline ? 'bg-slate-400' : isCharging ? 'bg-blue-400 animate-ping' : isFaulted ? 'bg-red-400' : 'bg-emerald-400'
                      }`} />
                      <span>{statusLabel}</span>
                    </span>
                  </td>

                  {/* Sockets / Connectors */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {connectors.length > 0 ? (
                        connectors.map((conn) => {
                          const isConnCharging = conn.status === 'Charging'
                          const isConnFaulted = conn.status === 'Faulted'
                          const isConnDC = Boolean(
                            conn.power_type
                              ? conn.power_type.toUpperCase() === 'DC'
                              : conn.connector_type
                              ? (conn.connector_type.toUpperCase().includes('CCS') || conn.connector_type.toUpperCase().includes('DC'))
                              : (isDC && conn.connector_id !== 3)
                          )
                          return (
                            <span
                              key={conn.connector_id}
                              className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold flex items-center gap-1 border ${
                                isConnCharging
                                  ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                                  : isConnFaulted
                                  ? 'bg-red-500/15 text-red-500 border-red-500/30'
                                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-white/10'
                              }`}
                              title={`Tomada #${conn.connector_id} - ${conn.status}`}
                            >
                              <span>#{conn.connector_id}</span>
                              <span className="text-[9px] opacity-75">{isConnDC ? 'CCS2' : 'Type2'}</span>
                            </span>
                          )
                        })
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">—</span>
                      )}
                    </div>
                  </td>

                  {/* Live Power Output */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {liveKw !== null && liveKw > 0 ? (
                      <div className="flex items-baseline gap-1 font-mono">
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          {liveKw.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">kW</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-mono text-xs">0.0 kW</span>
                    )}
                  </td>

                  {/* Active Transaction / Driver */}
                  <td className="py-3 px-4">
                    {(() => {
                      const activeConn = connectors.find((c) => c.active_transaction_id)
                      if (!activeConn) return <span className="text-slate-400 font-mono text-xs">—</span>
                      return (
                        <div className="text-xs space-y-0.5">
                          <span className="font-bold text-slate-800 dark:text-gray-200 block truncate">
                            {activeConn.active_username || activeConn.active_id_tag || `TX #${activeConn.active_transaction_id}`}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold block">
                            {activeConn.active_energy_kwh ?? 0} kWh
                          </span>
                        </div>
                      )
                    })()}
                  </td>

                  {/* Last Seen */}
                  <td className="py-3 px-4 text-slate-500 dark:text-gray-400 text-xs whitespace-nowrap font-mono">
                    {lastSeenStr || '—'}
                  </td>

                  {/* Quick Actions */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleQuickHeal(e, c.charge_point_id)}
                        disabled={healingId === c.charge_point_id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        title={t('dashboard.tableSelfHealTooltip')}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${healingId === c.charge_point_id ? 'animate-spin text-blue-500' : ''}`} />
                      </button>

                      <Link
                        to={`/chargers/${c.charge_point_id}`}
                        className="btn-secondary text-[11px] py-1 px-2.5 rounded-lg font-bold flex items-center gap-1 group-hover:border-blue-500/40"
                      >
                        <span>{t('dashboard.tableManage')}</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
