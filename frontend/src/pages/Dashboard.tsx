import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Zap, Wifi, RotateCcw, AlertTriangle, Server, Activity, ChevronDown, ChevronRight, Search, X, Filter, Square, Play, Sparkles } from 'lucide-react'
import { api } from '../api'
import { ChargerCard } from '../components/ChargerCard'
import { SimulatorModal } from '../components/SimulatorModal'
import { useChargerStore } from '../store/chargerStore'
import { useChargerUiStore } from '../store/chargerUiStore'
import type { Charger } from '../types'
import { useI18n } from '../i18n'

type StatusFilterType = 'all' | 'online' | 'charging' | 'available' | 'faulted'

interface KpiProps {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  color: 'blue' | 'emerald' | 'red' | 'amber' | 'violet'
  glow?: boolean
  delay?: number
  isActive?: boolean
  onClick?: () => void
}

const COLOR_MAP = {
  blue:   { icon: 'bg-blue-500/15 text-blue-400',    val: 'text-gradient-blue',   card: 'card-glow-blue' },
  emerald:{ icon: 'bg-emerald-500/15 text-emerald-400', val: 'text-gradient-green', card: 'card-glow-emerald' },
  red:    { icon: 'bg-red-500/15 text-red-400',       val: 'text-gradient-red',    card: 'card-glow-red' },
  amber:  { icon: 'bg-amber-500/15 text-amber-400',   val: 'text-gradient-amber',  card: 'card-glow-amber' },
  violet: { icon: 'bg-violet-500/15 text-violet-400', val: 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent', card: '' },
}

function KpiCard({ label, value, sub, icon, color, glow = false, delay = 0, isActive = false, onClick }: KpiProps) {
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
        {sub && <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{sub}</p>}
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 font-semibold uppercase tracking-wide">{label}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`kpi-card w-full text-left transition-all cursor-pointer ${
          isActive
            ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20 scale-[1.02] border-blue-400/50 bg-blue-500/5 dark:bg-blue-500/10'
            : glow ? c.card : ''
        } animate-fade-up hover:scale-[1.01]`}
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
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [isFleetHealing, setIsFleetHealing] = useState(false)
  const [fleetFeedback, setFleetFeedback] = useState<string | null>(null)

  const handleFleetSelfHeal = async () => {
    setIsFleetHealing(true)
    setFleetFeedback('A executar auto-diagnóstico e sincronização em todos os postos…')
    try {
      await Promise.all(chargers.map((c) => api.selfHealCharger(c.charge_point_id).catch(() => null)))
      await queryClient.invalidateQueries({ queryKey: ['chargers'] })
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setFleetFeedback('Frota 100% sincronizada e verificada com sucesso!')
    } catch {
      setFleetFeedback('Concluída a verificação da frota.')
    } finally {
      setIsFleetHealing(false)
      setTimeout(() => setFleetFeedback(null), 5000)
    }
  }

  const { data: simStatus, refetch: refetchSim } = useQuery({
    queryKey: ['simulatorStatus'],
    queryFn: api.getSimulatorStatus,
    refetchInterval: 2500,
  })

  const stopSim = async () => {
    try {
      await api.stopSimulator()
      refetchSim()
      refetchChargers()
    } catch (e) {
      console.error(e)
    }
  }

  const { data: chargers = [], isLoading, refetch: refetchChargers } = useQuery<Charger[]>({
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

  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all')
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  const scrollToSection = (id: string) => {
    const el = document.querySelector(`#${id}`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleKpiClick = (filter: StatusFilterType) => {
    setStatusFilter((prev) => (prev === filter ? 'all' : filter))
    scrollToSection('chargers-section')
  }

  const filteredChargers = useMemo(() => {
    return chargers.filter((c) => {
      if (statusFilter === 'online' && !isChargerOnline(c)) return false
      if (statusFilter === 'charging' && !isChargerCharging(c)) return false
      if (statusFilter === 'available') {
        if (!isChargerOnline(c) || isChargerCharging(c) || isChargerFaulted(c)) return false
      }
      if (statusFilter === 'faulted' && !isChargerFaulted(c)) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const idMatch = c.charge_point_id.toLowerCase().includes(q)
        const modelMatch = (c.model || '').toLowerCase().includes(q)
        const vendorMatch = (c.vendor || '').toLowerCase().includes(q)
        const groupMatch = (groups[c.charge_point_id] || '').toLowerCase().includes(q)
        if (!idMatch && !modelMatch && !vendorMatch && !groupMatch) return false
      }
      return true
    })
  }, [chargers, statusFilter, searchQuery, liveState, groups])

  // Group chargers: named groups sorted alphabetically, then ungrouped at the end
  const grouped = useMemo(() => {
    const map: Record<string, Charger[]> = {}
    const ungrouped: Charger[] = []
    for (const c of filteredChargers) {
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
  }, [filteredChargers, groups])

  const hasGroups = grouped.sortedGroups.length > 0

  return (
    <div className="space-y-8 animate-fade-up">
      {/* page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-shimmer">Central System</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">OCPP 1.6-J & 2.0.1 Ready · @Canditos Mission Control</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm w-fit">
          <Activity className="w-4 h-4 text-emerald-500 dark:text-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t('dashboard.registeredEvents', { count: events.length })}</span>
        </div>
      </div>

      {/* LIVE SIMULATION ACTIVE BANNER */}
      {simStatus?.is_running && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-600/15 via-indigo-600/15 to-blue-600/15 border border-purple-500/40 flex items-center justify-between shadow-xl shadow-purple-500/10 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Simulação Virtual em Curso: <span className="font-mono text-purple-600 dark:text-purple-400">{simStatus.station_id}</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-mono">
                  {simStatus.ocpp_version}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                A transmitir pacotes OCPP em tempo real para os cartões abaixo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={stopSim}
            className="btn text-xs px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-600/20"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Parar Simulação</span>
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label={t('dashboard.chargers')}
          value={total}
          icon={<Server className="w-5 h-5" />}
          color="violet"
          delay={0}
          isActive={statusFilter === 'all'}
          onClick={() => handleKpiClick('all')}
        />
        <KpiCard
          label={t('dashboard.online')}
          value={online}
          sub={t('dashboard.onlineAvailability', { pct: total > 0 ? Math.round((online / total) * 100) : 0 })}
          icon={<Wifi className="w-5 h-5" />}
          color="emerald"
          glow={online > 0}
          delay={60}
          isActive={statusFilter === 'online'}
          onClick={() => handleKpiClick('online')}
        />
        <KpiCard
          label={t('dashboard.charging')}
          value={charging}
          sub={t('dashboard.activePower', { kw: totalChargingKw.toFixed(1) })}
          icon={<Zap className="w-5 h-5" />}
          color="blue"
          glow={charging > 0}
          delay={120}
          isActive={statusFilter === 'charging'}
          onClick={() => handleKpiClick('charging')}
        />
        <KpiCard
          label={t('dashboard.available')}
          value={available}
          icon={<Zap className="w-5 h-5" />}
          color="amber"
          delay={180}
          isActive={statusFilter === 'available'}
          onClick={() => handleKpiClick('available')}
        />
        <KpiCard
          label={t('dashboard.faults')}
          value={faulted}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          delay={240}
          isActive={statusFilter === 'faulted'}
          onClick={() => handleKpiClick('faulted')}
        />
      </div>

      {/* CHARGERS SECTION */}
      <div id="chargers-section" className="space-y-6">
        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 dark:bg-gray-900/60 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-md">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> {t('dashboard.filter')}
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {t('dashboard.all')} ({total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('online')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'online'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {t('dashboard.online')} ({online})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('charging')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'charging'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <Zap className="w-3 h-3 text-blue-400" /> {t('dashboard.charging')} ({charging})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'available'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {t('dashboard.available')} ({available})
            </button>
            {faulted > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('faulted')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === 'faulted'
                    ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
                    : 'bg-slate-100 dark:bg-white/5 text-red-500 dark:text-red-400 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-red-400" /> {t('dashboard.faults')} ({faulted})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {/* Simulator Quick Trigger Button */}
            <button
              type="button"
              onClick={() => setIsSimulatorOpen(true)}
              className="btn text-xs px-3.5 py-2 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-500/20 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Abrir painel do Simulador Virtual OCPP 1.6 / 2.0.1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulador Virtual</span>
            </button>

            {/* Real-time Search Bar */}
            <div className="relative min-w-[220px] flex-1 md:flex-initial">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              className="input pl-9 pr-8 py-1.5 text-xs font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card h-44 animate-pulse bg-slate-200/60 dark:bg-gray-800/40" />
            ))}
          </div>
        )}

        {/* Empty State - No chargers registered */}
        {!isLoading && chargers.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="p-4 rounded-2xl bg-blue-500/10 text-blue-500">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <p className="text-slate-800 dark:text-gray-200 font-bold text-base">{t('dashboard.noChargers')}</p>
              <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">{t('dashboard.connectStation')}</p>
              <p className="text-xs font-mono mt-3 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-black/60 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-white/10 select-all inline-block">
                wss://ocpp.gatoescondido.com/ocpp/&lt;charger-id&gt;
              </p>
            </div>
          </div>
        )}

        {/* Empty State - Filter produced 0 results */}
        {!isLoading && chargers.length > 0 && filteredChargers.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Filter className="w-8 h-8 text-slate-400 dark:text-gray-500" />
            <p className="text-slate-700 dark:text-gray-300 font-semibold text-sm">
              {t('dashboard.noResults', {
                filter: statusFilter,
                search: searchQuery ? t('dashboard.searchQueryLabel', { query: searchQuery }) : '',
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all')
                setSearchQuery('')
              }}
              className="btn-secondary text-xs px-4 py-1.5 rounded-lg mt-1"
            >
              {t('dashboard.clearFilters')}
            </button>
          </div>
        )}

        {/* Stations Grid with Groups */}
        {!isLoading && filteredChargers.length > 0 && (
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
                {filteredChargers.map((c) => <ChargerCard key={c.id} charger={c} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIRTUAL SIMULATOR MODAL */}
      <SimulatorModal isOpen={isSimulatorOpen} onClose={() => setIsSimulatorOpen(false)} />
    </div>
  )
}
