import React from 'react'
import { Zap, WifiOff, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react'
import { useI18n } from '../../i18n'

export type StatusFilterType = 'all' | 'online' | 'charging' | 'available' | 'faulted' | 'offline'

interface FleetStatusRibbonProps {
  total: number
  available: number
  charging: number
  faulted: number
  offline: number
  activeFilter: StatusFilterType
  onSelectFilter: (filter: StatusFilterType) => void
}

export function FleetStatusRibbon({
  total,
  available,
  charging,
  faulted,
  offline,
  activeFilter,
  onSelectFilter,
}: FleetStatusRibbonProps) {
  const { t } = useI18n()
  if (total === 0) return null

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  const items = [
    {
      key: 'available' as StatusFilterType,
      label: t('dashboard.statusAvailable'),
      count: available,
      percentage: pct(available),
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-500/30',
      activeRing: 'ring-2 ring-emerald-500 bg-emerald-500/10',
      barColor: 'bg-emerald-500 hover:bg-emerald-400',
    },
    {
      key: 'charging' as StatusFilterType,
      label: t('dashboard.statusCharging'),
      count: charging,
      percentage: pct(charging),
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-500/30',
      activeRing: 'ring-2 ring-blue-500 bg-blue-500/10',
      barColor: 'bg-blue-500 hover:bg-blue-400',
    },
    {
      key: 'faulted' as StatusFilterType,
      label: t('dashboard.statusFaulted'),
      count: faulted,
      percentage: pct(faulted),
      color: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400',
      borderColor: 'border-red-500/30',
      activeRing: 'ring-2 ring-red-500 bg-red-500/10',
      barColor: 'bg-red-500 hover:bg-red-400',
    },
    {
      key: 'offline' as StatusFilterType,
      label: t('dashboard.statusOffline'),
      count: offline,
      percentage: pct(offline),
      color: 'bg-slate-400 dark:bg-slate-600',
      textColor: 'text-slate-600 dark:text-slate-400',
      borderColor: 'border-slate-300 dark:border-white/10',
      activeRing: 'ring-2 ring-slate-400 bg-slate-500/10',
      barColor: 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-300',
    },
  ]

  return (
    <div className="card p-4 space-y-3.5 border border-slate-200/80 dark:border-white/10 shadow-sm backdrop-blur-md">
      {/* Header bar: Fleet summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse-slow" />
          <span className="font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wider text-[11px]">
            {t('dashboard.ribbonTitle')}
          </span>
          <span className="text-slate-400 dark:text-gray-500 font-mono text-[10px]">
            {t('dashboard.registeredStations', {
              count: total,
              word: total === 1 ? t('dashboard.stationWordSingular') : t('dashboard.stationWordPlural')
            })}
          </span>
        </div>

        {activeFilter !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectFilter('all')}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <RotateCw className="w-3 h-3" />
            <span>{t('dashboard.clearFilter', { filter: activeFilter })}</span>
          </button>
        )}
      </div>

      {/* Segmented Ribbon Bar */}
      <div className="h-3 w-full bg-slate-100 dark:bg-black/40 rounded-full overflow-hidden flex shadow-inner p-0.5 gap-0.5">
        {items.map((item) => {
          if (item.count === 0) return null
          const widthPct = (item.count / total) * 100
          const isFilterMatch = activeFilter === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectFilter(activeFilter === item.key ? 'all' : item.key)}
              title={`${item.label}: ${item.count} (${item.percentage}%)`}
              style={{ width: `${widthPct}%` }}
              className={`h-full rounded-sm transition-all duration-300 cursor-pointer ${item.barColor} ${
                activeFilter !== 'all' && !isFilterMatch ? 'opacity-30' : 'opacity-100 shadow-sm'
              }`}
            />
          )
        })}
      </div>

      {/* Interactive Legend Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {items.map((item) => {
          const isSelected = activeFilter === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectFilter(isSelected ? 'all' : item.key)}
              className={`p-2 rounded-xl text-left transition-all border cursor-pointer ${
                isSelected
                  ? item.activeRing
                  : 'border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-[11px] font-bold text-slate-700 dark:text-gray-300 truncate">
                    {item.label}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono font-medium">
                  {item.percentage}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-base font-bold tabular-nums ${item.textColor}`}>
                  {item.count}
                </span>
                <span className="text-[10px] text-slate-400">
                  {item.count === 1 ? t('dashboard.stationWordSingular').toLowerCase() : t('dashboard.stationWordPlural').toLowerCase()}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
