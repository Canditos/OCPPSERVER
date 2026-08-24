import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap, Wifi, AlertTriangle, Server, Activity, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../api'
import { ChargerCard } from '../components/ChargerCard'
import { useChargerStore } from '../store/chargerStore'
import { useChargerUiStore } from '../store/chargerUiStore'
import type { Charger } from '../types'
import { useI18n } from '../i18n'

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

interface GroupSectionProps {
  groupName: string
  chargers: Charger[]
  isNoGroup?: boolean
}

function GroupSection({ groupName, chargers, isNoGroup = false }: GroupSectionProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const label = isNoGroup ? groupName : groupName

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-wider ${isNoGroup ? 'text-gray-600' : 'text-gray-400'}`}>
          {label}
        </span>
        <span className="text-xs text-gray-600 font-mono">{chargers.length}</span>
        <div className="flex-1 h-px bg-white/5 ml-1" />
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
          {chargers.map((c) => <ChargerCard key={c.id} charger={c} />)}
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const { t } = useI18n()
  const { data: chargers = [], isLoading } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 5000,
  })

  const liveState = useChargerStore((s) => s.liveState)
  const events    = useChargerStore((s) => s.events)
  const { groups } = useChargerUiStore()

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
  const available = Math.max(0, online - charging - faulted)

  const totalChargingWatts = Object.values(liveState)
    .flatMap((s) => Object.entries(s.meters ?? {}))
    .filter(([measurand]) => measurand.toLowerCase().includes('power'))
    .reduce((acc, [, m]) => acc + Number(m.value ?? 0), 0)
  const totalChargingKw = totalChargingWatts / 1000

  const scrollToSection = (id: string) => {
    const el = document.querySelector(`#${id}`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el?.classList.add('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
    window.setTimeout(() => {
      el?.classList.remove('ring-2', 'ring-blue-500/40', 'ring-offset-2', 'ring-offset-slate-950')
    }, 1400)
  }

  // Group chargers: named groups sorted alphabetically, then ungrouped at the end
  const grouped = React.useMemo(() => {
    const map: Record<string, Charger[]> = {}
    const ungrouped: Charger[] = []
    for (const c of chargers) {
      const g = groups[c.charge_point_id]
      if (g && g.trim()) {
        if (!map[g]) map[g] = []
        map[g].push(c)
      } else {
        ungrouped.push(c)
      }
    }
    const sortedGroups = Object.keys(map).sort((a, b) => a.localeCompare(b))
    return { sortedGroups, map, ungrouped }
  }, [chargers, groups])

  const hasGroups = grouped.sortedGroups.length > 0

  return (
    <div className="space-y-8 animate-fade-up">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-shimmer">Central System</h1>
          <p className="text-sm text-gray-400 mt-1">OCPP 1.6 · @Canditos OCPP</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-emerald-400 font-medium">{t('dashboard.registeredEvents', { count: events.length })}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label={t('dashboard.chargers')}
          value={total}
          icon={<Server className="w-5 h-5" />}
          color="violet"
          delay={0}
          onClick={() => scrollToSection('chargers-section')}
        />
        <KpiCard
          label={t('dashboard.online')}
          value={online}
          sub={t('dashboard.onlineAvailability', { pct: total > 0 ? Math.round((online / total) * 100) : 0 })}
          icon={<Wifi className="w-5 h-5" />}
          color="emerald"
          glow={online > 0}
          delay={60}
          onClick={() => scrollToSection('chargers-section')}
        />
        <KpiCard
          label={t('dashboard.charging')}
          value={charging}
          sub={t('dashboard.activePower', { kw: totalChargingKw.toFixed(1) })}
          icon={<Zap className="w-5 h-5" />}
          color="blue"
          glow={charging > 0}
          delay={120}
          onClick={() => scrollToSection('chargers-section')}
        />
        <KpiCard
          label={t('dashboard.available')}
          value={available}
          icon={<Zap className="w-5 h-5" />}
          color="amber"
          delay={180}
          onClick={() => scrollToSection('chargers-section')}
        />
        <KpiCard
          label={t('dashboard.faults')}
          value={faulted}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          delay={240}
          onClick={() => scrollToSection('chargers-section')}
        />
      </div>

      {/* CHARGERS */}
      <div id="chargers-section">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{t('dashboard.chargingStations')}</h2>
            <span className="text-xs text-gray-500 font-mono">{t('dashboard.registered', { count: chargers.length })}</span>
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
                <p className="text-gray-400 font-medium">{t('dashboard.noChargers')}</p>
                <p className="text-gray-500 text-sm mt-1">{t('dashboard.connectStation')}</p>
                <p className="text-xs font-mono mt-2 px-3 py-1.5 rounded-lg bg-gray-800/80 text-blue-400 border border-blue-500/20">
                  wss://ocpp.gatoescondido.com/ocpp/&lt;charger-id&gt;
                </p>
              </div>
            </div>
          )}

          {!isLoading && chargers.length > 0 && (
            <div className="space-y-6">
              {hasGroups ? (
                <>
                  {grouped.sortedGroups.map((g) => (
                    <GroupSection key={g} groupName={g} chargers={grouped.map[g]} />
                  ))}
                  {grouped.ungrouped.length > 0 && (
                    <GroupSection
                      groupName={t('dashboard.noGroup')}
                      chargers={grouped.ungrouped}
                      isNoGroup
                    />
                  )}
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {chargers.map((c) => <ChargerCard key={c.id} charger={c} />)}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
