import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Activity, Zap } from 'lucide-react'
import { api } from '../api'
import type { MeterValue } from '../types'
import { safeFormatTime } from '../utils/date'

interface Props {
  cpId: string
  connectorId?: number
  transactionId?: number
}

const MEASURAND_CFG: Record<string, { color: string; gradient: [string, string]; label: string }> = {
  'Energy.Active.Import.Register': { color: '#3b82f6', gradient: ['#3b82f6', '#1d4ed8'], label: 'Energia (Wh)' },
  'Power.Active.Import':           { color: '#10b981', gradient: ['#10b981', '#047857'], label: 'Potência (W)' },
  'Current.Import':                { color: '#f59e0b', gradient: ['#f59e0b', '#b45309'], label: 'Corrente (A)' },
  'Voltage':                       { color: '#8b5cf6', gradient: ['#8b5cf6', '#6d28d9'], label: 'Tensão (V)' },
  'Temperature':                   { color: '#ef4444', gradient: ['#ef4444', '#b91c1c'], label: 'Temp (°C)' },
}
const FALLBACK_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444']

function getMeasurandCfg(key: string, idx: number) {
  return MEASURAND_CFG[key] ?? {
    color: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    gradient: [FALLBACK_COLORS[idx % FALLBACK_COLORS.length], FALLBACK_COLORS[idx % FALLBACK_COLORS.length]],
    label: key,
  }
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs space-y-1.5 shadow-xl"
      style={{ background: 'rgba(10,14,26,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-gray-400 font-mono mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-mono font-medium">{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
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

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center h-40 gap-3 text-gray-700">
        <Activity className="w-5 h-5 animate-pulse-slow" />
        <span className="text-sm">A carregar dados…</span>
      </div>
    )
  }

  if (!raw.length) {
    return (
      <div className="card flex flex-col items-center justify-center h-40 gap-2 text-gray-700">
        <Zap className="w-6 h-6 opacity-40" />
        <p className="text-sm">Sem MeterValues</p>
        {!transactionId && <p className="text-xs text-gray-700">Os dados aparecem assim que o charger enviar leituras</p>}
      </div>
    )
  }

  // merge by timestamp
  const measurands = [...new Set(raw.map((r) => r.measurand ?? 'Energy.Active.Import.Register'))]
  const byTs: Record<string, Record<string, number>> = {}

  for (const mv of raw) {
    const key = safeFormatTime(mv.timestamp) || '00:00:00'
    byTs[key] = byTs[key] ?? {}
    byTs[key][mv.measurand ?? 'Energy.Active.Import.Register'] = Number(mv.value)
  }


  const chartData = Object.entries(byTs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, vals]) => ({ time, ...vals }))

  return (
    <div className="card p-4">
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/15">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-xs font-medium text-gray-400">
            {transactionId ? `Transação #${transactionId}` : 'Live · atualiza a cada 5s'}
          </span>
        </div>
        {!transactionId && (
          <span className="live-pill">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            LIVE
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {measurands.map((m, i) => {
              const cfg = getMeasurandCfg(m, i)
              return (
                <linearGradient key={m} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.gradient[0]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cfg.gradient[1]} stopOpacity={0.02} />
                </linearGradient>
              )
            })}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 12 }}
            formatter={(value) => getMeasurandCfg(value, measurands.indexOf(value)).label}
          />

          {measurands.map((m, i) => {
            const cfg = getMeasurandCfg(m, i)
            return (
              <Area
                key={m}
                type="monotone"
                dataKey={m}
                name={m}
                stroke={cfg.color}
                strokeWidth={2}
                fill={`url(#grad-${i})`}
                dot={false}
                activeDot={{ r: 4, fill: cfg.color, stroke: 'rgba(0,0,0,0.4)', strokeWidth: 2 }}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
