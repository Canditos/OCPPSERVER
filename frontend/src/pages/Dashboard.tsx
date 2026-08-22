import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap, Wifi, AlertTriangle, Server, Activity, TrendingUp, Terminal } from 'lucide-react'
import { api } from '../api'
import { ChargerCard } from '../components/ChargerCard'
import { EventLog } from '../components/EventLog'
import { OcppLogViewer } from '../components/OcppLogViewer'
import { useChargerStore } from '../store/chargerStore'
import type { Charger, OcppMessage } from '../types'

interface KpiProps {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  color: 'blue' | 'emerald' | 'red' | 'amber' | 'violet'
  glow?: boolean
  delay?: number
  onClick?: () => void
}

const COLOR_MAP = {
  blue:   { icon: 'bg-blue-500/15 text-blue-400',    val: 'text-gradient-blue',   card: 'card-glow-blue' },
  emerald:{ icon: 'bg-emerald-500/15 text-emerald-400', val: 'text-gradient-green', card: 'card-glow-emerald' },
  red:    { icon: 'bg-red-500/15 text-red-400',       val: 'text-gradient-red',    card: 'card-glow-red' },
  amber:  { icon: 'bg-amber-500/15 text-amber-400',   val: 'text-gradient-amber',  card: 'card-glow-amber' },
  violet: { icon: 'bg-violet-500/15 text-violet-400', val: 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent', card: '' },
}

function KpiCard({ label, value, sub, icon, color, glow = false, delay = 0, onClick }: KpiProps) {
  const c = COLOR_MAP[color]
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${c.icon}`}>{icon}</div>
        {glow && (
          <span className="live-pill">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            LIVE
          </span>
        )}
      </div>
      <div>
        <p className={`text-3xl font-bold tabular-nums ${c.val}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">{label}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`kpi-card w-full text-left ${glow ? c.card : ''} animate-fade-up cursor-pointer hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
        style={{ animationDelay: `${delay}ms` }}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={`kpi-card ${glow ? c.card : ''} animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {content}
    </div>
  )
}

export function Dashboard() {
  const { data: chargers = [], isLoading } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 5000,
  })

  // State for selected charger logs on the dashboard
  const [selectedLogCpId, setSelectedLogCpId] = React.useState<string>('')
  const currentCpId = selectedLogCpId || chargers[0]?.charge_point_id

  const { data: messages = [] } = useQuery<OcppMessage[]>({
    queryKey: ['messages', currentCpId],
    queryFn: () => api.getMessages(currentCpId!, 100),
    enabled: !!currentCpId,
    refetchInterval: 3000,
  })

  const liveState = useChargerStore((s) => s.liveState)
  const events    = useChargerStore((s) => s.events)

  const total = chargers.length

  const isChargerOnline = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    return live?.isOnline ?? c.is_online
  }

  const isChargerCharging = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    if (live?.connectors && Object.keys(live.connectors).length > 0) {
      return Object.values(live.connectors).some((cc) => cc.status === 'Charging')
    }
    return (c.connectors ?? []).some((cc) => cc.status === 'Charging') || c.status === 'Charging'
  }

  const isChargerFaulted = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    if (live?.connectors && Object.keys(live.connectors).length > 0) {
      return Object.values(live.connectors).some((cc) => cc.status === 'Faulted')
    }
    return (c.connectors ?? []).some((cc) => cc.status === 'Faulted') || c.status === 'Faulted'
  }

  const online   = chargers.filter(isChargerOnline).length
  const charging = chargers.filter(isChargerCharging).length
  const faulted  = chargers.filter(isChargerFaulted).length

  const totalEnergyWh = Object.values(liveState)
    .flatMap((s) => Object.entries(s.meters ?? {}))
    .filter(([measurand]) => measurand.toLowerCase().includes('energy'))
    .reduce((acc, [, m]) => acc + Number(m.value ?? 0), 0)
  const totalKwh = (totalEnergyWh / 1000).toFixed(1)

  const scrollToSelector = (selector: string) => {
    const el = document.querySelector(selector) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el?.classList.add('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
    window.setTimeout(() => {
      el?.classList.remove('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
    }, 1400)
  }

  const scrollToSection = (id: string) => {
    scrollToSelector(`#${id}`)
  }

  const scrollToFirstMatchingCard = (status: 'online' | 'charging' | 'faulted') => {
    const el = document.querySelector(`[data-charger-flags~="${status}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
      }, 1400)
      return
    }
    scrollToSection('chargers-section')
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-shimmer">Central System</h1>
          <p className="text-sm text-gray-400 mt-1">OCPP 1.6 · Siemens VersiCharge</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-emerald-400 font-medium">{events.length} eventos registados</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Chargers"
          value={total}
          icon={<Server className="w-5 h-5" />}
          color="violet"
          delay={0}
          onClick={() => scrollToSection('chargers-section')}
        />
        <KpiCard
          label="Online"
          value={online}
          icon={<Wifi className="w-5 h-5" />}
          color="emerald"
          glow={online > 0}
          delay={60}
          onClick={() => scrollToFirstMatchingCard('online')}
        />
        <KpiCard
          label="A carregar"
          value={charging}
          icon={<Zap className="w-5 h-5" />}
          color="blue"
          glow={charging > 0}
          delay={120}
          onClick={() => scrollToFirstMatchingCard('charging')}
        />
        <KpiCard
          label="Avaria"
          value={faulted}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          glow={faulted > 0}
          delay={180}
          onClick={() => scrollToFirstMatchingCard('faulted')}
        />
        <KpiCard
          label="Energia live"
          value={totalKwh}
          sub="kWh acumulado"
          icon={<TrendingUp className="w-5 h-5" />}
          color="amber"
          delay={240}
          onClick={() => scrollToSection('live-events-section')}
        />
      </div>

      {/* main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* charger grid */}
        <div className="xl:col-span-2 space-y-6" id="chargers-section">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Postos de Carga (EVSE)</h2>
            <span className="text-xs text-gray-400">{total} registados</span>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card h-44 animate-pulse bg-gray-800/40" />
              ))}
            </div>
          )}

          {!isLoading && chargers.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 rounded-2xl bg-gray-800/60">
                <Zap className="w-8 h-8 text-gray-600" />
              </div>
              <div>
                <p className="text-gray-400 font-medium">Sem chargers ligados</p>
                <p className="text-gray-500 text-sm mt-1">Liga o VersiCharge a:</p>
                <p className="text-xs font-mono mt-2 px-3 py-1.5 rounded-lg bg-gray-800/80 text-blue-400 border border-blue-500/20">
                  wss://ocpp.gatoescondido.com/ocpp/&lt;charger-id&gt;
                </p>
              </div>
            </div>
          )}

          {!isLoading && chargers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {chargers.map((c) => <ChargerCard key={c.id} charger={c} />)}
            </div>
          )}
        </div>

        {/* event log sidebar */}
        <div className="space-y-4" id="live-events-section">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Eventos Live</h2>
            <span className="live-pill">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <EventLog maxHeight="520px" />
        </div>
      </div>

      {/* FULL OCPP MESSAGES LOG VIEWER SECTION */}
      <div className="pt-6 border-t border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-gray-200 uppercase tracking-wider">Visualizador Completo de Logs & Payloads JSON</h2>
          </div>

          {/* HIGH-TECH INTERACTIVE BUTTON SELECTOR CARDS FOR CHARGERS */}
          {chargers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-gray-400 font-medium mr-1">Selecionar Charger:</span>
              {chargers.map((c) => {
                const isSelected = currentCpId === c.charge_point_id
                const isCharging = isChargerCharging(c)
                const isOnline = isChargerOnline(c)

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedLogCpId(c.charge_point_id)}
                    className={`relative px-4 py-2.5 rounded-2xl text-xs font-medium border transition-all duration-300 flex items-center gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-600/35 via-cyan-600/25 to-blue-600/35 border-blue-400 text-white shadow-lg shadow-blue-500/25 scale-102 ring-1 ring-blue-400/50'
                        : 'bg-gray-900/80 border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200 hover:bg-gray-800/80'
                    } ${isCharging ? 'border-cyan-400/60 shadow-cyan-500/20' : ''}`}
                  >
                    {isCharging ? (
                      <div className="relative flex items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-cyan-400 opacity-75" />
                        <Zap className="w-4 h-4 text-cyan-400 animate-bounce" fill="currentColor" />
                      </div>
                    ) : (
                      <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-gray-600'}`} />
                    )}

                    <div className="text-left">
                      <p className="font-mono font-bold leading-tight text-xs">{c.charge_point_id}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">
                        {c.vendor ?? 'Siemens'} {isCharging ? '· ⚡ CARGA ATIVA' : ''}
                      </p>
                    </div>

                    {isSelected && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <OcppLogViewer messages={messages} cpId={currentCpId} maxHeight="500px" />
      </div>
    </div>
  )
}
