import { useEffect, useRef } from 'react'
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
  charger_connected:    { icon: <Wifi className="w-3.5 h-3.5" />,           bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Ligado' },
  charger_disconnected: { icon: <WifiOff className="w-3.5 h-3.5" />,        bg: 'bg-gray-700/30',    text: 'text-gray-500',    border: 'border-gray-700/20',    label: 'Desligado' },
  heartbeat:            { icon: <Activity className="w-3.5 h-3.5" />,       bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/15',    label: 'Heartbeat' },
  status_notification:  { icon: <ToggleLeft className="w-3.5 h-3.5" />,     bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20',  label: 'Status' },
  transaction_started:  { icon: <Zap className="w-3.5 h-3.5" fill="currentColor" />, bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25', label: 'Transação iniciada' },
  transaction_stopped:  { icon: <Zap className="w-3.5 h-3.5" />,            bg: 'bg-gray-700/30',    text: 'text-gray-400',    border: 'border-gray-700/20',    label: 'Transação terminada' },
  meter_values:         { icon: <Activity className="w-3.5 h-3.5" />,       bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/15',   label: 'MeterValues' },
  authorize:            { icon: <CreditCard className="w-3.5 h-3.5" />,     bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/15',    label: 'Authorize' },
}

function EventRow({ event, idx }: { event: OcppEvent; idx: number }) {
  const cfg = EVENT_CONFIG[event.type] ?? {
    icon: <Info className="w-3.5 h-3.5" />,
    bg: 'bg-gray-800/30', text: 'text-gray-500', border: 'border-gray-700/20', label: event.type,
  }

  const cpId = event.data?.charge_point_id ?? event.data?.cp_id ?? ''

  return (
    <div
      className={`flex items-start gap-3 px-4 py-2.5 border-b border-white/4 animate-slide-in hover:bg-white/2 transition-colors`}
      style={{ animationDelay: `${idx * 15}ms` }}
    >
      {/* icon */}
      <div className={`shrink-0 mt-0.5 p-1.5 rounded-lg border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        {cfg.icon}
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
          <span className="text-[10px] text-gray-400 font-mono shrink-0">
            {safeFormatTime(event.ts)}
          </span>

        </div>
        {cpId && <p className="text-[11px] text-gray-600 truncate mt-0.5 font-mono">{cpId}</p>}

        {/* extra detail for specific events */}
        {event.type === 'status_notification' && event.data?.status && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            #{event.data.connector_id} → <span className="text-gray-300">{event.data.status}</span>
          </p>
        )}
        {event.type === 'transaction_started' && event.data?.id_tag && (
          <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{event.data.id_tag}</p>
        )}
        {event.type === 'meter_values' && event.data?.sampled_values && (
          <p className="text-[11px] text-amber-400/70 mt-0.5 font-mono truncate">
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
