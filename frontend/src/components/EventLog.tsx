import React, { useEffect, useRef } from 'react'
import { safeFormatTime } from '../utils/date'
import { Zap, Wifi, WifiOff, Activity, ToggleLeft, CreditCard, AlertTriangle, Info } from 'lucide-react'
import { useChargerStore } from '../store/chargerStore'
import type { OcppEvent } from '../types'



interface Props {
  cpId?: string
  maxHeight?: string
}

const EVENT_CONFIG: Record<string, {
  icon: React.ReactNode
  bg: string
  text: string
  border: string
  label: string
}> = {
  charger_connected:    { icon: <Wifi className="w-4 h-4" />,           bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', label: 'Ligado' },
  charger_disconnected: { icon: <WifiOff className="w-4 h-4" />,        bg: 'bg-red-500/20',     text: 'text-red-300',     border: 'border-red-500/40',     label: 'Desligado' },
  heartbeat:            { icon: <Activity className="w-4 h-4" />,       bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40',    label: 'Heartbeat' },
  status_notification:  { icon: <ToggleLeft className="w-4 h-4" />,     bg: 'bg-violet-500/20',  text: 'text-violet-300',  border: 'border-violet-500/40',  label: 'Estado Notificado' },
  transaction_started:  { icon: <Zap className="w-4 h-4" fill="currentColor" />, bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', label: 'Transação Iniciada' },
  transaction_stopped:  { icon: <Zap className="w-4 h-4" />,            bg: 'bg-gray-700/40',    text: 'text-gray-300',    border: 'border-gray-600/40',    label: 'Transação Terminada' },
  meter_values:         { icon: <Activity className="w-4 h-4" />,       bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40',   label: 'MeterValues' },
  authorize:            { icon: <CreditCard className="w-4 h-4" />,     bg: 'bg-teal-500/20',    text: 'text-teal-300',    border: 'border-teal-500/40',    label: 'Autorização' },
}

function EventRow({ event, idx }: { event: OcppEvent; idx: number }) {
  const cfg = EVENT_CONFIG[event.type] ?? {
    icon: <Info className="w-4 h-4" />,
    bg: 'bg-gray-800/60', text: 'text-gray-200', border: 'border-gray-700/50', label: event.type,
  }

  const cpId = event.data?.charge_point_id ?? event.data?.cp_id ?? ''

  return (
    <div
      className="flex items-start gap-3.5 px-4 py-3 border-b border-white/10 animate-slide-in hover:bg-white/5 transition-colors"
      style={{ animationDelay: `${idx * 15}ms` }}
    >
      {/* icon */}
      <div className={`shrink-0 mt-0.5 p-2 rounded-xl border shadow-sm ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        {cfg.icon}
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
          <span className="text-xs text-gray-300 font-mono font-semibold shrink-0 bg-white/5 px-2 py-0.5 rounded border border-white/10">
            {safeFormatTime(event.ts)}
          </span>
        </div>
        {cpId && <p className="text-xs text-gray-300 font-medium truncate mt-0.5 font-mono">{cpId}</p>}

        {/* extra detail for specific events */}
        {event.type === 'status_notification' && event.data?.status && (
          <p className="text-xs text-gray-300 mt-1">
            Tomada #{event.data.connector_id} → <span className="text-white font-bold bg-white/10 px-1.5 py-0.5 rounded">{event.data.status}</span>
          </p>
        )}
        {event.type === 'transaction_started' && event.data?.id_tag && (
          <p className="text-xs text-amber-300 mt-1 font-mono font-semibold">ID Tag: {event.data.id_tag}</p>
        )}
        {event.type === 'meter_values' && event.data?.sampled_values && (
          <p className="text-xs text-amber-300 mt-1 font-mono truncate font-medium">
            {event.data.sampled_values.slice(0, 2).map((v: { measurand?: string; value: string; unit?: string }) =>
              `${v.measurand ?? 'Energy'}: ${v.value}${v.unit ?? ''}`
            ).join('  ')}
          </p>
        )}
      </div>
    </div>
  )
}

export function EventLog({ cpId, maxHeight = '400px' }: Props) {
  const events = useChargerStore((s) => s.events)
  const filtered = cpId
    ? events.filter((e) => e.data?.charge_point_id === cpId || e.data?.cp_id === cpId)
    : events

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [filtered.length])

  return (
    <div className="card p-0 overflow-hidden flex flex-col" style={{ maxHeight }}>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-700 gap-2">
          <Activity className="w-7 h-7 opacity-40" />
          <p className="text-xs">Aguardar eventos…</p>
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-y-auto flex-1">
          {[...filtered].reverse().map((e, i) => (
            <EventRow key={`${e.ts}-${i}`} event={e} idx={i} />
          ))}
        </div>
      )}
    </div>
  )
}
