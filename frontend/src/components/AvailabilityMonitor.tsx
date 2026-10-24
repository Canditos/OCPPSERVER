import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, Wifi, WifiOff, HeartPulse, RefreshCw, Layers, ShieldAlert,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { api, AvailabilityData } from '../api'
import { safeFormatDate } from '../utils/date'
import { useI18n } from '../i18n'

interface AvailabilityMonitorProps {
  chargePointId: string
  compact?: boolean
}

export function AvailabilityMonitor({ chargePointId, compact = false }: AvailabilityMonitorProps) {
  const { t } = useI18n()
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(false)
  const [showEventsTable, setShowEventsTable] = useState(false)
  const { data: avail, isLoading, refetch } = useQuery<AvailabilityData>({
    queryKey: ['chargerAvailability', chargePointId],
    queryFn: () => api.getChargerAvailability(chargePointId),
    refetchInterval: 10000,
    enabled: !!chargePointId,
  })

  if (isLoading || !avail) {
    return (
      <div className="card p-4 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-gray-400">
        <Activity className="w-4 h-4 animate-spin text-emerald-400" />
        <span>{t('availability.loading')}</span>
      </div>
    )
  }

  const isHealthy = avail.heartbeat_status === 'healthy'
  const isWarning = avail.heartbeat_status === 'warning'

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isHealthy ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
            <HeartPulse className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-gray-200">{t('availability.avail24h')}</p>
            <p className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">{t('availability.heartbeatAgo', { seconds: avail.heartbeat_age_seconds })}</p>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-sm font-bold font-mono ${avail.uptime_24h_pct >= 98 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {avail.uptime_24h_pct}%
          </span>
          <span className="text-[10px] text-slate-500 dark:text-gray-400 block">{t('availability.uptime')}</span>
        </div>
      </div>
    )
  }

  const faultEvents = (avail.recent_events || []).filter(
    (e) => (e.error_code && e.error_code !== 'NoError') || ['Faulted', 'Unavailable', 'Inoperative'].includes(e.status)
  )
  // When showing all, show all events. When showing faults, show all fault and unavailable events.
  const displayedEvents = filterErrorsOnly ? faultEvents : (avail.recent_events || [])

  return (
    <div className="card border border-slate-200 dark:border-white/10 space-y-5 animate-fade-up">
      {/* Title & Heartbeat Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
              {t('availability.title')}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
                LIVE
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t('availability.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Heartbeat Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            isHealthy
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : isWarning
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
          }`}>
            <span className="relative flex h-2 w-2">
              {isHealthy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isHealthy ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-red-400'}`} />
            </span>
            <span>
              {isHealthy ? t('availability.heartbeatOk', { seconds: avail.heartbeat_age_seconds }) : isWarning ? t('availability.heartbeatSlow', { seconds: avail.heartbeat_age_seconds }) : t('availability.noSignal')}
            </span>
          </div>

          <button
            onClick={() => refetch()}
            className="btn-ghost p-1.5 text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200"
            title={t('availability.refreshTooltip')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3 Metric Cards: 24h, 7d, 30d Uptime */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">{t('availability.uptime24h')}</p>
            <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{avail.uptime_24h_pct}%</p>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">{t('availability.uptime7d')}</p>
            <p className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">{avail.uptime_7d_pct}%</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">{t('availability.faults24h')}</p>
            <p className={`text-xl font-bold font-mono mt-0.5 ${avail.total_faults_24h === 0 ? 'text-slate-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}`}>
              {avail.total_faults_24h}
            </p>
          </div>
          <div className={`p-2 rounded-lg ${avail.total_faults_24h === 0 ? 'bg-slate-200/50 dark:bg-white/5 text-slate-400 dark:text-gray-400' : 'bg-red-500/10 text-red-500 dark:text-red-400'}`}>
            {avail.total_faults_24h === 0 ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* 24-Hour Timeline Bar (GitHub-style) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
          <span className="font-medium">{t('availability.timelineTitle')}</span>
          <span className="text-[11px] text-slate-500 dark:text-gray-400 font-mono">{t('availability.operational100')}</span>
        </div>

        <div className="flex gap-1 h-8 p-1.5 rounded-xl bg-slate-100 dark:bg-gray-950/80 border border-slate-200 dark:border-white/10 w-full">
          {avail.hourly_timeline.map((item, idx) => (
            <div
              key={idx}
              className={`flex-1 h-full rounded-sm transition-all cursor-pointer hover:scale-110 ${
                item.is_operational
                  ? item.status === 'Charging'
                    ? 'bg-blue-500 shadow-sm shadow-blue-500/30'
                    : 'bg-emerald-500 shadow-sm shadow-emerald-500/30'
                  : 'bg-red-500/80 shadow-sm shadow-red-500/30'
              }`}
              title={`${item.hour}: ${t('availability.colStatus')} ${item.status}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-gray-400 px-1">
          <span>{t('availability.ago24h')}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> {t('availability.available')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {t('availability.charging')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {t('availability.unavailable')}</span>
          </div>
          <span>{t('availability.now')}</span>
        </div>
      </div>

      {/* Connectors Availability Details */}
      {avail.connectors.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('availability.statusPerConnector')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {avail.connectors.map((c) => (
              <div key={c.connector_id} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.status === 'Charging' ? 'bg-blue-400 animate-pulse' : c.status === 'Available' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-gray-200">{t('availability.socket', { id: c.connector_id })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    c.status === 'Available'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : c.status === 'Charging'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}>
                    {c.status}
                  </span>
                  {c.error_code && c.error_code !== 'NoError' && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-mono">({c.error_code})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Error & Fault Events Log (Collapsible Accordion) */}
      <div className="pt-2 border-t border-slate-200 dark:border-white/10">
        <div
          onClick={() => setShowEventsTable(!showEventsTable)}
          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/10 cursor-pointer transition-all select-none group"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-gray-200">
              {t('availability.faultsLogTitle')}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
              avail.total_faults_24h > 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}>
              {t('availability.faultsCount', { count: avail.total_faults_24h })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-300 transition-colors hidden sm:inline">
              {showEventsTable ? t('availability.clickToCollapse') : t('availability.clickToExpand')}
            </span>
            <button
              type="button"
              className="p-1 rounded-lg bg-slate-200/60 dark:bg-white/5 text-slate-500 dark:text-gray-400 group-hover:text-slate-900 dark:group-hover:text-white"
            >
              {showEventsTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showEventsTable && (
          <div className="space-y-3 pt-3 animate-fade-in">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setFilterErrorsOnly(!filterErrorsOnly)
                }}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                  filterErrorsOnly
                    ? 'bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/40 font-semibold'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:text-slate-900 dark:hover:text-gray-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>{filterErrorsOnly ? t('availability.showingErrorsOnly') : t('availability.showErrorsOnly')}</span>
              </button>
            </div>

            {displayedEvents.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mx-auto mb-1.5 opacity-80" />
                <p className="text-xs text-slate-600 dark:text-gray-300 font-medium">{t('availability.noErrorsTitle')}</p>
                <p className="text-[10px] text-slate-500 dark:text-gray-500 mt-0.5">{t('availability.noErrorsSubtitle')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-950/60 max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 sticky top-0 backdrop-blur-md text-[11px] text-slate-500 dark:text-gray-400 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">{t('availability.colDateTime')}</th>
                      <th className="py-2.5 px-3">{t('availability.colSocket')}</th>
                      <th className="py-2.5 px-3">{t('availability.colStatus')}</th>
                      <th className="py-2.5 px-3">{t('availability.colErrorCode')}</th>
                      <th className="py-2.5 px-3">{t('availability.colDetails')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {displayedEvents.map((evt) => {
                      const isFault = (evt.error_code && evt.error_code !== 'NoError') || ['Faulted', 'Unavailable', 'Inoperative'].includes(evt.status)
                      return (
                        <tr
                          key={evt.id}
                          className={`transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${isFault ? 'bg-red-500/5' : ''}`}
                        >
                          <td className="py-2 px-3 text-slate-700 dark:text-gray-300 whitespace-nowrap">
                            {evt.timestamp ? safeFormatDate(evt.timestamp) : '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap text-slate-700 dark:text-gray-300">
                            {evt.connector_id > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 text-[11px]">
                                {t('availability.socket', { id: evt.connector_id })}
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-gray-500 text-[11px]">{t('availability.generalStation')}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              evt.status === 'Faulted'
                                ? 'bg-red-500/20 text-red-500 dark:text-red-400 border-red-500/30'
                                : evt.status === 'Unavailable' || evt.status === 'Inoperative'
                                ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 border-amber-500/30'
                                : evt.status === 'Charging'
                                ? 'bg-blue-500/20 text-blue-500 dark:text-blue-400 border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border-emerald-500/30'
                            }`}>
                              {evt.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {evt.error_code && evt.error_code !== 'NoError' ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30 text-[11px] font-bold">
                                ⚠️ {evt.error_code}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-gray-600 text-[11px]">NoError</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-gray-400 text-[11px] font-sans truncate max-w-xs" title={evt.info || ''}>
                            {evt.info || (isFault ? t('availability.noExtraInfo') : '—')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
