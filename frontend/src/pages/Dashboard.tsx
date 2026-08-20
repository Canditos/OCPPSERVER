import { useQuery } from '@tanstack/react-query'
import { Zap, Wifi, AlertTriangle, Server, Activity, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { ChargerCard } from '../components/ChargerCard'
import { EventLog } from '../components/EventLog'
import { useChargerStore } from '../store/chargerStore'
import type { Charger } from '../types'

interface KpiProps {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  color: 'blue' | 'emerald' | 'red' | 'amber' | 'violet'
  glow?: boolean
  delay?: number
}

const COLOR_MAP = {
  blue:   { icon: 'bg-blue-500/15 text-blue-400',    val: 'text-gradient-blue',   card: 'card-glow-blue' },
  emerald:{ icon: 'bg-emerald-500/15 text-emerald-400', val: 'text-gradient-green', card: 'card-glow-emerald' },
  red:    { icon: 'bg-red-500/15 text-red-400',       val: 'text-gradient-red',    card: 'card-glow-red' },
  amber:  { icon: 'bg-amber-500/15 text-amber-400',   val: 'text-gradient-amber',  card: 'card-glow-amber' },
  violet: { icon: 'bg-violet-500/15 text-violet-400', val: 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent', card: '' },
}

function KpiCard({ label, value, sub, icon, color, glow = false, delay = 0 }: KpiProps) {
  const c = COLOR_MAP[color]
  return (
    <div
      className={`kpi-card ${glow ? c.card : ''} animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
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
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
        <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { data: chargers = [], isLoading } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 5000,
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
    if (live?.connectors) {
      if (Object.values(live.connectors).some((cc) => cc.status === 'Charging')) return true
    }
    return (c.connectors ?? []).some((cc) => cc.status === 'Charging') || c.status === 'Charging'
  }

  const isChargerFaulted = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    if (live?.connectors) {
      if (Object.values(live.connectors).some((cc) => cc.status === 'Faulted')) return true
    }
    return (c.connectors ?? []).some((cc) => cc.status === 'Faulted') || c.status === 'Faulted'
  }

  const online   = chargers.filter(isChargerOnline).length
  const charging = chargers.filter(isChargerCharging).length
  const faulted  = chargers.filter(isChargerFaulted).length

  const liveEnergyWh = Object.values(liveState)
    .flatMap((s) => Object.values(s.meters ?? {}))
    .flatMap((m) => Object.entries(m))
    .filter(([k]) => k.toLowerCase().includes('energy'))
    .reduce((acc, [, v]) => acc + Number(v.value ?? 0), 0)

  const totalKwh = (liveEnergyWh / 1000).toFixed(1)


  return (
    <div className="space-y-8 animate-fade-up">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-shimmer">Central System</h1>
          <p className="text-sm text-gray-500 mt-1">OCPP 1.6 · Siemens VersiCharge</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-emerald-400 font-medium">{events.length} eventos</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Chargers" value={total}   icon={<Server className="w-5 h-5" />}        color="violet"  delay={0} />
        <KpiCard label="Online"   value={online}  icon={<Wifi className="w-5 h-5" />}           color="emerald" glow={online > 0} delay={60} />
        <KpiCard label="A carregar" value={charging} icon={<Zap className="w-5 h-5" />}        color="blue"    glow={charging > 0} delay={120} />
        <KpiCard label="Avaria"   value={faulted} icon={<AlertTriangle className="w-5 h-5" />}  color="red"     glow={faulted > 0} delay={180} />
        <KpiCard label="Energia live" value={totalKwh} sub="kWh acumulado" icon={<TrendingUp className="w-5 h-5" />} color="amber" delay={240} />
      </div>

      {/* main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* charger grid */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Chargers</h2>
            <span className="text-xs text-gray-600">{total} registados</span>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card h-36 animate-pulse bg-gray-800/40" />
              ))}
            </div>
          )}

          {!isLoading && chargers.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 rounded-2xl bg-gray-800/60">
                <Zap className="w-8 h-8 text-gray-700" />
              </div>
              <div>
                <p className="text-gray-400 font-medium">Sem chargers ligados</p>
                <p className="text-gray-600 text-sm mt-1">Liga o VersiCharge a:</p>
                <p className="text-xs font-mono mt-2 px-3 py-1.5 rounded-lg bg-gray-800/80 text-blue-400 border border-blue-500/20">
                  ws://&lt;IP&gt;:9000/&lt;charger-id&gt;
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

        {/* event log */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Eventos live</h2>
            <span className="live-pill">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <EventLog maxHeight="620px" />
        </div>
      </div>
    </div>
  )
}
