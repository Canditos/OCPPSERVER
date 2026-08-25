import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Activity, Zap, Check, Eye, EyeOff, BarChart2 } from 'lucide-react'
import { api } from '../api'
import type { MeterValue } from '../types'
import { safeFormatTime } from '../utils/date'

interface Props {
  cpId: string
  connectorId?: number
  transactionId?: number
}

const MEASURAND_CFG: Record<string, { color: string; gradient: [string, string]; label: string; unit: string }> = {
  'Energy.Active.Import.Register': { color: '#3b82f6', gradient: ['#3b82f6', '#1d4ed8'], label: 'Energia (Wh)', unit: 'Wh' },
  'Energy.Active.Import.Interval': { color: '#60a5fa', gradient: ['#60a5fa', '#2563eb'], label: 'Energia Intervalo', unit: 'Wh' },
  'Power.Active.Import':           { color: '#10b981', gradient: ['#10b981', '#047857'], label: 'Potência (W)', unit: 'W' },
  'Power.Offered':                 { color: '#f59e0b', gradient: ['#f59e0b', '#d97706'], label: 'Power.Offered', unit: 'W' },
  'Current.Import':                { color: '#ec4899', gradient: ['#ec4899', '#be185d'], label: 'Corrente (A)', unit: 'A' },
  'Current.Offered':               { color: '#06b6d4', gradient: ['#06b6d4', '#0891b2'], label: 'Current.Offered', unit: 'A' },
  'Voltage':                       { color: '#8b5cf6', gradient: ['#8b5cf6', '#6d28d9'], label: 'Tensão (V)', unit: 'V' },
  'SoC':                           { color: '#a855f7', gradient: ['#a855f7', '#7e22ce'], label: 'Bateria SoC (%)', unit: '%' },
  'Temperature':                   { color: '#ef4444', gradient: ['#ef4444', '#b91c1c'], label: 'Temperatura (°C)', unit: '°C' },
}

const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#14b8a6']

function getMeasurandCfg(key: string, idx: number) {
  if (MEASURAND_CFG[key]) return MEASURAND_CFG[key]
  const c = FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
  return {
    color: c,
    gradient: [c, c] as [string, string],
    label: key,
    unit: '',
  }
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl p-3 text-xs space-y-1.5 shadow-2xl backdrop-blur-md bg-white/95 dark:bg-slate-950/95 border border-slate-200 dark:border-white/15"
    >
      <p className="text-slate-500 dark:text-gray-400 font-mono mb-2 border-b border-slate-200 dark:border-white/10 pb-1 font-semibold">{label}</p>
      {payload.map((p) => {
        const cfg = MEASURAND_CFG[p.name]
        const displayLabel = cfg ? cfg.label : p.name
        const unit = cfg?.unit ? ` ${cfg.unit}` : ''
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ background: p.color }} />
              <span className="text-slate-600 dark:text-gray-300 font-medium">{displayLabel}:</span>
            </div>
            <span className="text-slate-900 dark:text-white font-mono font-bold">
              {Number(p.value).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}{unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MeterChart({ cpId, connectorId = 1, transactionId }: Props) {
  const { data: raw = [], isLoading } = useQuery<MeterValue[]>({
    queryKey: transactionId
      ? ['meter-values', 'tx', transactionId]
      : ['meter-values', 'live', cpId, connectorId],
    queryFn: () =>
      transactionId
        ? api.getMeterValues(transactionId)
        : api.getLiveMeterValues(cpId, connectorId),
    refetchInterval: transactionId ? false : 5000,
  })

  // Discover all distinct measurands from data
  const allMeasurands = useMemo(() => {
    const set = new Set<string>()
    for (const r of raw) {
      if (r.measurand) set.add(r.measurand)
      else set.add('Energy.Active.Import.Register')
    }
    return Array.from(set)
  }, [raw])

  // Track active/selected series
  const [selectedMeasurands, setSelectedMeasurands] = useState<string[]>([])

  // Initialize or keep selection valid
  const activeMeasurands = useMemo(() => {
    if (selectedMeasurands.length === 0 && allMeasurands.length > 0) {
      return allMeasurands
    }
    const valid = selectedMeasurands.filter((m) => allMeasurands.includes(m))
    return valid.length > 0 ? valid : allMeasurands
  }, [selectedMeasurands, allMeasurands])

  const toggleMeasurand = (m: string) => {
    if (activeMeasurands.includes(m)) {
      if (activeMeasurands.length === 1) return // Keep at least one selected
      setSelectedMeasurands(activeMeasurands.filter((x) => x !== m))
    } else {
      setSelectedMeasurands([...activeMeasurands, m])
    }
  }

  const selectOnly = (m: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedMeasurands([m])
  }

  const selectAll = () => {
    setSelectedMeasurands(allMeasurands)
  }

  // Merge raw datapoints by timestamp chronologically
  const chartData = useMemo(() => {
    const byTs: Record<string, { timestampMs: number; time: string; [key: string]: any }> = {}

    for (const mv of raw) {
      if (!mv.timestamp) continue
      const rawIso = mv.timestamp
      const d = new Date(rawIso.endsWith('Z') ? rawIso : rawIso + 'Z')
      const tsMs = !isNaN(d.getTime()) ? d.getTime() : new Date(rawIso).getTime()
      const timeLabel = safeFormatTime(mv.timestamp) || '00:00:00'
      const key = rawIso

      if (!byTs[key]) {
        byTs[key] = { timestampMs: tsMs, time: timeLabel }
      }
      const measurandKey = mv.measurand ?? 'Energy.Active.Import.Register'
      byTs[key][measurandKey] = Number(mv.value)
    }

    return Object.values(byTs)
      .sort((a, b) => a.timestampMs - b.timestampMs)
  }, [raw])

  // Latest values map for badges (sorted by real timestamp)
  const latestValues = useMemo(() => {
    const sorted = [...raw].sort((a, b) => {
      const ta = new Date(a.timestamp?.endsWith('Z') ? a.timestamp : (a.timestamp + 'Z')).getTime()
      const tb = new Date(b.timestamp?.endsWith('Z') ? b.timestamp : (b.timestamp + 'Z')).getTime()
      return ta - tb
    })
    const latest: Record<string, number> = {}
    for (let i = sorted.length - 1; i >= 0; i--) {
      const m = sorted[i].measurand ?? 'Energy.Active.Import.Register'
      if (latest[m] === undefined) {
        latest[m] = Number(sorted[i].value)
      }
    }
    return latest
  }, [raw])

  // Find latest timestamp and check if fresh (last 2 minutes)
  const latestTimestampMs = useMemo(() => {
    if (!raw.length) return 0
    let max = 0
    for (const r of raw) {
      if (r.timestamp) {
        const d = new Date(r.timestamp.endsWith('Z') ? r.timestamp : (r.timestamp + 'Z'))
        const ms = !isNaN(d.getTime()) ? d.getTime() : new Date(r.timestamp).getTime()
        if (ms > max) max = ms
      }
    }
    return max
  }, [raw])

  const isFreshLive = useMemo(() => {
    if (!latestTimestampMs) return false
    return (Date.now() - latestTimestampMs) < 120_000 // within 2 minutes
  }, [latestTimestampMs])

  const latestTimeStr = useMemo(() => {
    if (!latestTimestampMs) return ''
    return safeFormatTime(new Date(latestTimestampMs).toISOString())
  }, [latestTimestampMs])

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center h-44 gap-3 text-gray-400">
        <Activity className="w-5 h-5 animate-spin text-blue-400" />
        <span className="text-sm">A carregar telemetria em tempo real…</span>
      </div>
    )
  }

  if (!raw.length) {
    return (
      <div className="card flex flex-col items-center justify-center h-44 gap-2 text-gray-500">
        <Zap className="w-6 h-6 opacity-40 text-gray-400" />
        <p className="text-sm font-medium text-gray-300">Sem Leituras de Telemetria (MeterValues)</p>
        {!transactionId && <p className="text-xs text-gray-500">Os dados serão desenhados assim que o carregador enviar medições.</p>}
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-4">
      {/* Header with Title, Mode & Select All */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/8 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/20">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-gray-200 block">
              {transactionId
                ? `Transação #${transactionId} · Histórico`
                : isFreshLive
                ? 'Telemetria Live · Gráfico Interativo'
                : `Telemetria · Última Sessão (${latestTimeStr})`}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-gray-500">
              {isFreshLive
                ? 'A receber leituras OCPP em tempo real do posto'
                : `Sem carga ativa. A exibir últimas leituras gravadas às ${latestTimeStr}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeMeasurands.length < allMeasurands.length && (
            <button
              onClick={selectAll}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 border border-slate-300 dark:border-white/10 transition-colors"
            >
              Mostrar Todas ({allMeasurands.length})
            </button>
          )}

          {!transactionId && (
            isFreshLive ? (
              <span className="live-pill">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                LIVE (5s)
              </span>
            ) : latestTimestampMs > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500" />
                Última Sessão ({latestTimeStr})
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Interactive Selectable Metric Badges / Legend */}
      <div className="flex flex-wrap gap-2">
        {allMeasurands.map((m, i) => {
          const cfg = getMeasurandCfg(m, i)
          const isSelected = activeMeasurands.includes(m)
          const latest = latestValues[m]

          return (
            <div
              key={m}
              onClick={() => toggleMeasurand(m)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer select-none transition-all text-xs border ${
                isSelected
                  ? 'bg-white/8 border-white/15 shadow-sm text-gray-200 hover:border-white/30'
                  : 'bg-white/2 border-white/5 opacity-40 text-gray-500 hover:opacity-75'
              }`}
              title="Clique para ligar/desligar no gráfico"
            >
              <div
                className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125"
                style={{ background: isSelected ? cfg.color : '#6b7280' }}
              />
              <span className="font-medium">{cfg.label}</span>

              {latest !== undefined && (
                <span className="font-mono font-bold text-[11px]" style={{ color: isSelected ? cfg.color : '#9ca3af' }}>
                  {latest.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}{cfg.unit ? ` ${cfg.unit}` : ''}
                </span>
              )}

              {/* Only this button */}
              <button
                type="button"
                onClick={(e) => selectOnly(m, e)}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-opacity ml-1"
                title={`Mostrar apenas ${cfg.label}`}
              >
                Apenas
              </button>
            </div>
          )
        })}
      </div>

      {/* Chart Canvas */}
      <div className="pt-2">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              {allMeasurands.map((m, i) => {
                const cfg = getMeasurandCfg(m, i)
                return (
                  <linearGradient key={m} id={`meter-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cfg.gradient[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={cfg.gradient[1]} stopOpacity={0.01} />
                  </linearGradient>
                )
              })}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              tickFormatter={(v) => {
                if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
                return String(v)
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {activeMeasurands.map((m) => {
              const originalIdx = allMeasurands.indexOf(m)
              const cfg = getMeasurandCfg(m, originalIdx)
              return (
                <Area
                  key={m}
                  type="monotone"
                  dataKey={m}
                  name={m}
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  fill={`url(#meter-grad-${originalIdx})`}
                  dot={false}
                  activeDot={{ r: 5, fill: cfg.color, stroke: 'rgba(10,14,26,0.9)', strokeWidth: 2 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
