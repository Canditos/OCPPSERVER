import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, Wifi, WifiOff, HeartPulse, RefreshCw, Layers, ShieldAlert,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { api, AvailabilityData } from '../api'
import { safeFormatDate } from '../utils/date'

interface AvailabilityMonitorProps {
  chargePointId: string
  compact?: boolean
}

export function AvailabilityMonitor({ chargePointId, compact = false }: AvailabilityMonitorProps) {
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
      <div className="card p-4 flex items-center justify-center gap-2 text-xs text-gray-500">
        <Activity className="w-4 h-4 animate-spin text-emerald-400" />
        <span>A carregar métricas de disponibilidade…</span>
      </div>
    )
  }

  const isHealthy = avail.heartbeat_status === 'healthy'
  const isWarning = avail.heartbeat_status === 'warning'

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 border border-white/6 text-xs">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isHealthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            <HeartPulse className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-semibold text-gray-200">Disponibilidade 24h</p>
            <p className="text-[10px] text-gray-500 font-mono">Heartbeat: {avail.heartbeat_age_seconds}s atrás</p>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-sm font-bold font-mono ${avail.uptime_24h_pct >= 98 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {avail.uptime_24h_pct}%
          </span>
          <span className="text-[10px] text-gray-500 block">Uptime</span>
        </div>
      </div>
    )
  }

  const faultEvents = (avail.recent_events || []).filter(
    (e) => (e.error_code && e.error_code !== 'NoError') || ['Faulted', 'Unavailable', 'Inoperative'].includes(e.status)
  )
  const displayedEvents = filterErrorsOnly ? faultEvents : (avail.recent_events || [])

  return (
    <div className="card border border-white/10 space-y-5 animate-fade-up">
      {/* Title & Heartbeat Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              Monitorização de Disponibilidade & Uptime
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                LIVE
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Supervisão de integridade, telemetria de Heartbeats e histórico operacional
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Heartbeat Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            isHealthy
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : isWarning
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <span className="relative flex h-2 w-2">
              {isHealthy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isHealthy ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-red-400'}`} />
            </span>
            <span>
              {isHealthy ? `Heartbeat OK (${avail.heartbeat_age_seconds}s)` : isWarning ? `Heartbeat Lento (${avail.heartbeat_age_seconds}s)` : 'Sem Sinal'}
            </span>
          </div>

          <button
            onClick={() => refetch()}
            className="btn-ghost p-1.5 text-gray-500 hover:text-gray-200"
            title="Atualizar métricas"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3 Metric Cards: 24h, 7d, 30d Uptime */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-white/3 border border-white/6 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-500 font-medium">Uptime Últimas 24h</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{avail.uptime_24h_pct}%</p>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white/3 border border-white/6 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-500 font-medium">Uptime Médio 7 Dias</p>
            <p className="text-xl font-bold font-mono text-blue-400 mt-0.5">{avail.uptime_7d_pct}%</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white/3 border border-white/6 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-500 font-medium">Falhas / Erros 24h</p>
            <p className={`text-xl font-bold font-mono mt-0.5 ${avail.total_faults_24h === 0 ? 'text-gray-300' : 'text-red-400'}`}>
              {avail.total_faults_24h}
            </p>
          </div>
          <div className={`p-2 rounded-lg ${avail.total_faults_24h === 0 ? 'bg-white/5 text-gray-400' : 'bg-red-500/10 text-red-400'}`}>
            {avail.total_faults_24h === 0 ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* 24-Hour Timeline Bar (GitHub-style) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="font-medium">Linha Temporal das Últimas 24 Horas (1 bloco = 1 hora)</span>
          <span className="text-[11px] text-gray-500 font-mono">100% Operacional</span>
        </div>

        <div className="grid grid-cols-24 gap-1 h-8 p-1.5 rounded-xl bg-gray-950/80 border border-white/10">
          {avail.hourly_timeline.map((item, idx) => (
            <div
              key={idx}
              className={`h-full rounded-sm transition-all cursor-pointer hover:scale-110 ${
                item.is_operational
                  ? item.status === 'Charging'
                    ? 'bg-blue-500 shadow-sm shadow-blue-500/30'
                    : 'bg-emerald-500 shadow-sm shadow-emerald-500/30'
                  : 'bg-red-500/80 shadow-sm shadow-red-500/30'
              }`}
              title={`${item.hour}: Estado ${item.status}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
          <span>24h atrás</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Disponível</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> A Carregar</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Indisponível</span>
          </div>
          <span>Agora</span>
        </div>
      </div>

      {/* Connectors Availability Details */}
      {avail.connectors.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado por Tomada / Conector</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {avail.connectors.map((c) => (
              <div key={c.connector_id} className="p-3 rounded-xl bg-white/3 border border-white/6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.status === 'Charging' ? 'bg-blue-400 animate-pulse' : c.status === 'Available' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs font-bold text-gray-200">Tomada #{c.connector_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    c.status === 'Available'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : c.status === 'Charging'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {c.status}
                  </span>
                  {c.error_code && c.error_code !== 'NoError' && (
                    <span className="text-[10px] text-red-400 font-mono">({c.error_code})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Error & Fault Events Log (Collapsible Accordion) */}
      <div className="pt-2 border-t border-white/8">
        <div
          onClick={() => setShowEventsTable(!showEventsTable)}
          className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 hover:bg-white/6 border border-white/6 cursor-pointer transition-all select-none group"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-xs font-bold text-gray-200">
              Registo de Falhas & Eventos Recentes (Últimas 24h)
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
              avail.total_faults_24h > 0 ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            }`}>
              {avail.total_faults_24h} falhas
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors hidden sm:inline">
              {showEventsTable ? 'Clique para recolher' : 'Clique para expandir'}
            </span>
            <button
              type="button"
              className="p-1 rounded-lg bg-white/5 text-gray-400 group-hover:text-white"
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
                    ? 'bg-red-500/20 text-red-300 border-red-500/40 font-semibold'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>{filterErrorsOnly ? 'A mostrar Apenas Erros' : 'Mostrar Apenas Falhas/Erros'}</span>
              </button>
            </div>

            {displayedEvents.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/2 border border-white/5 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1.5 opacity-80" />
                <p className="text-xs text-gray-400 font-medium">Nenhum erro ou anomalia registado nas últimas 24 horas.</p>
                <p className="text-[10px] text-gray-600 mt-0.5">O carregador e os conectores mantiveram operação estável.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-950/60 max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 border-b border-white/10 sticky top-0 backdrop-blur-md text-[11px] text-gray-400 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Tomada</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Código de Erro OCPP</th>
                      <th className="py-2.5 px-3">Detalhes / Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {displayedEvents.map((evt) => {
                      const isFault = (evt.error_code && evt.error_code !== 'NoError') || ['Faulted', 'Unavailable', 'Inoperative'].includes(evt.status)
                      return (
                        <tr
                          key={evt.id}
                          className={`transition-colors hover:bg-white/5 ${isFault ? 'bg-red-500/5' : ''}`}
                        >
                          <td className="py-2 px-3 text-gray-300 whitespace-nowrap">
                            {evt.timestamp ? safeFormatDate(evt.timestamp) : '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap text-gray-300">
                            {evt.connector_id > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-white/5 text-gray-300 text-[11px]">
                                Tomada #{evt.connector_id}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-[11px]">Posto Geral</span>
                            )}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              evt.status === 'Faulted'
                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : evt.status === 'Unavailable' || evt.status === 'Inoperative'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : evt.status === 'Charging'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {evt.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {evt.error_code && evt.error_code !== 'NoError' ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 text-[11px] font-bold">
                                ⚠️ {evt.error_code}
                              </span>
                            ) : (
                              <span className="text-gray-600 text-[11px]">NoError</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-400 text-[11px] font-sans truncate max-w-xs" title={evt.info || ''}>
                            {evt.info || (isFault ? 'Sem informação adicional transmitida pelo posto' : '—')}
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
