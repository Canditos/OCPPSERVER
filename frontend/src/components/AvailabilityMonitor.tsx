import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, Wifi, WifiOff, HeartPulse, RefreshCw, Layers, ShieldAlert
} from 'lucide-react'
import { api, AvailabilityData } from '../api'

interface AvailabilityMonitorProps {
  chargePointId: string
  compact?: boolean
}

export function AvailabilityMonitor({ chargePointId, compact = false }: AvailabilityMonitorProps) {
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
    </div>
  )
}
