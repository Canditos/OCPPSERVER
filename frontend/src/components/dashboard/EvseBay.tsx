import React from 'react'
import { Zap, Plug, AlertCircle, Clock, Tag, Unlock, Mail, CheckCircle2, WifiOff } from 'lucide-react'
import { useI18n } from '../../i18n'

interface EvseBayProps {
  connectorId: number
  status: string
  powerKw: number | null
  soc: number | null
  energyKwh?: number | null
  activeTx?: any | null
  isSelected: boolean
  isDC: boolean
  onSelect: () => void
  onUnlock?: () => void
  onNotifyDriver?: () => void
}

export function EvseBay({
  connectorId,
  status,
  powerKw,
  soc,
  energyKwh,
  activeTx,
  isSelected,
  isDC,
  onSelect,
  onUnlock,
  onNotifyDriver,
}: EvseBayProps) {
  const { t } = useI18n()
  const isCharging = status === 'Charging'
  const isPreparing = status === 'Preparing'
  const isFaulted = status === 'Faulted'
  const isAvailable = status === 'Available'
  const isSuspended = status.startsWith('Suspended')
  const isOffline = status === 'Offline' || status === 'Unavailable'

  // Plug type heuristic: DC is CCS2 Combo, AC is Type 2 Mennekes
  const plugLabel = isDC ? t('evseBay.plugTypeDC') : t('evseBay.plugTypeAC')
  const maxPowerLabel = isDC ? t('evseBay.maxPowerDC') : t('evseBay.maxPowerAC')

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-2xl p-3.5 transition-all cursor-pointer border ${
        isSelected
          ? 'ring-2 ring-blue-500 border-blue-500/50 bg-blue-50/70 dark:bg-blue-950/30 shadow-md'
          : isCharging
          ? 'border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 hover:border-blue-500/50'
          : isFaulted
          ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/10 hover:border-red-500/50'
          : isOffline
          ? 'border-slate-200 dark:border-white/5 bg-slate-100/50 dark:bg-slate-900/20 opacity-75'
          : 'border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-white/20'
      }`}
    >
      {/* Bay Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-gray-200 text-xs font-mono font-black flex items-center justify-center shrink-0">
            #{connectorId}
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-gray-200 truncate">
            {plugLabel}
          </span>
        </div>

        {/* Status Badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 border shrink-0 ${
          isCharging
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
            : isPreparing
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse'
            : isFaulted
            ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
            : isSuspended
            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
            : isOffline
            ? 'bg-slate-500/15 text-slate-500 dark:text-gray-400 border-slate-500/30'
            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isCharging ? 'bg-blue-500 animate-ping' : isFaulted ? 'bg-red-500' : isOffline ? 'bg-slate-400' : isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
          }`} />
          <span>
            {isCharging
              ? t('evseBay.statusCharging')
              : isPreparing
              ? t('evseBay.statusPreparing')
              : isFaulted
              ? t('evseBay.statusFaulted')
              : isSuspended
              ? t('evseBay.statusSuspended')
              : isOffline
              ? t('evseBay.statusDisconnected')
              : t('evseBay.statusAvailable')}
          </span>
        </span>
      </div>

      {/* Main Bay Content: When Charging */}
      {isCharging ? (
        <div className="space-y-2.5 pt-1">
          {/* Big Digital Power Meter */}
          <div className="flex items-baseline justify-between p-2.5 rounded-xl bg-white dark:bg-black/30 border border-blue-500/20 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 animate-pulse">
                <Zap className="w-4 h-4" fill="currentColor" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-gray-400 block font-semibold uppercase tracking-wider">
                  {t('evseBay.instantPower')}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-cyan-300">
                    {powerKw !== null && powerKw > 0 ? powerKw.toFixed(1) : '—'}
                  </span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">kW</span>
                </div>
              </div>
            </div>

            {/* Energy delivered so far */}
            <div className="text-right">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 block font-semibold uppercase tracking-wider">
                {t('evseBay.deliveredEnergy')}
              </span>
              <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                {activeTx?.energy_kwh !== undefined && activeTx?.energy_kwh !== null
                  ? `${activeTx.energy_kwh} kWh`
                  : energyKwh !== undefined && energyKwh !== null
                  ? `${energyKwh} kWh`
                  : '0.0 kWh'}
              </span>
            </div>
          </div>

          {/* SoC Battery Bar (if available) */}
          {soc !== null && soc !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-gray-400">{t('evseBay.batterySoc')}</span>
                <span className="font-bold text-slate-900 dark:text-white">{Math.round(soc)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, soc))}%` }}
                />
              </div>
            </div>
          )}

          {/* Driver / Session details badge */}
          {activeTx && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 dark:border-white/5 text-slate-600 dark:text-gray-300">
              <div className="flex items-center gap-1.5 truncate">
                <Tag className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="font-mono truncate">
                  {activeTx.user_username || activeTx.id_tag || t('evseBay.driverFallback')}
                </span>
                <span className="text-slate-400 dark:text-gray-500 text-[10px]">
                  (TX #{activeTx.transaction_id})
                </span>
              </div>
              {onNotifyDriver && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onNotifyDriver()
                  }}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  title={t('evseBay.notifyDriverTooltip')}
                >
                  <Mail className="w-3 h-3" /> {t('evseBay.notifyDriver')}
                </button>
              )}
            </div>
          )}
        </div>
      ) : isFaulted ? (
        /* When Faulted */
        <div className="py-2.5 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">
              <AlertCircle className="w-4 h-4 shrink-0" /> {t('evseBay.bayInoperative')}
            </span>
            {onUnlock && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onUnlock()
                }}
                className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Unlock className="w-3 h-3" /> {t('evseBay.unlock')}
              </button>
            )}
          </div>
          <p className="text-[11px] opacity-90">{t('evseBay.cableLockedWarning')}</p>
        </div>
      ) : isOffline ? (
        /* When Offline / Unavailable */
        <div className="flex items-center justify-between py-2 text-xs text-slate-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-4 h-4 text-slate-400" />
            <span className="font-medium">{t('evseBay.stationDisconnected')}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 dark:text-gray-500">
            Offline
          </span>
        </div>
      ) : (
        /* When Available or Preparing */
        <div className="flex items-center justify-between py-2 text-xs text-slate-600 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <Plug className="w-4 h-4 text-emerald-500" />
            <span className="font-medium">
              {isPreparing ? t('evseBay.vehicleConnectedStarting') : t('evseBay.readyToCharge')}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-gray-400">
            {maxPowerLabel}
          </span>
        </div>
      )}
    </div>
  )
}
