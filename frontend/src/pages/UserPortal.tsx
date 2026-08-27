import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, CreditCard, BatteryCharging, Clock, History,
  Activity, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Play, Square, Loader2
} from 'lucide-react'
import { api, MyActiveCharge } from '../api'
import { useAuthStore } from '../store/authStore'
import { safeFormatDateTime, safeFormatDuration } from '../utils/date'
import { RemoteStartModal } from '../components/RemoteStartModal'
import { BatteryIndicator } from '../components/BatteryIndicator'
import type { Transaction } from '../types'
import { useI18n } from '../i18n'

export function UserPortal() {
  const { user } = useAuthStore()
  const { t } = useI18n()
  const [showRemoteStartModal, setShowRemoteStartModal] = useState(false)

  // Profile data with personal stats
  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: api.getMe,
    refetchInterval: 10000,
  })

  // Check active live charge
  const { data: activeCharge, refetch: refetchActive } = useQuery<MyActiveCharge | null>({
    queryKey: ['my-active-charge'],
    queryFn: api.getMyActiveCharge,
    refetchInterval: 4000,
  })

  // Transaction history
  const { data: transactions = [], isLoading: txLoading, refetch: refetchTxs } = useQuery<Transaction[]>({
    queryKey: ['my-transactions'],
    queryFn: api.getMyTransactions,
    refetchInterval: 10000,
  })

  const handleRefresh = () => {
    refetchProfile()
    refetchActive()
    refetchTxs()
  }

  const [isStopping, setIsStopping] = useState(false)
  const [stopFeedback, setStopFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleStopMyCharge = async () => {
    if (!activeCharge) return
    setIsStopping(true)
    setStopFeedback(null)
    try {
      const resp = await api.remoteStop(activeCharge.charge_point_id, activeCharge.transaction_id)
      setStopFeedback({ type: 'success', message: resp?.message || 'Carga terminada com sucesso!' })
      setTimeout(() => {
        handleRefresh()
        setIsStopping(false)
        setStopFeedback(null)
      }, 1200)
    } catch (err: any) {
      setStopFeedback({ type: 'error', message: err?.response?.data?.detail || 'Erro ao parar sessão.' })
      setIsStopping(false)
      setTimeout(() => setStopFeedback(null), 4000)
    }
  }

  const rawTag = profile?.rfid_tag || user?.rfid_tag || ''
  const rfidTag = rawTag || (user?.username ? `TAG_${user.username.toUpperCase()}` : t('userPortal.noAssignedTag'))

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('userPortal.title')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {t('userPortal.activeUser')}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            {t('userPortal.greeting', { name: profile?.username || user?.username || '' })}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="btn btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('common.update')}</span>
        </button>
      </div>

      {/* Hero: Virtual RFID Card & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Virtual RFID Card */}
        <div className="lg:col-span-1 relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white shadow-xl border border-blue-500/20 flex flex-col justify-between min-h-[200px]">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-xs tracking-wider uppercase text-blue-200">{t('userPortal.passTitle')}</span>
            </div>
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>

          <div className="my-4 relative z-10">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">
              {t('userPortal.rfidLabel')}
            </span>
            <div className="font-mono text-lg font-bold tracking-widest text-emerald-400 bg-black/30 px-3 py-1.5 rounded-lg border border-white/10 inline-block">
              {rfidTag}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300 relative z-10 pt-2 border-t border-white/10">
            <span>{profile?.username || user?.username}</span>
            <button
              onClick={() => setShowRemoteStartModal(true)}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Play className="w-3 h-3 fill-current" />
              {t('userPortal.startCharge')}
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 border border-slate-200 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400">
              <span className="text-xs font-semibold uppercase">{t('userPortal.totalConsumed')}</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {profile?.total_kwh ?? 0} <span className="text-sm font-normal text-slate-500">kWh</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 block">
                {t('userPortal.totalChargedEnergy')}
              </span>
            </div>
          </div>

          <div className="card p-5 border border-slate-200 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400">
              <span className="text-xs font-semibold uppercase">{t('userPortal.chargingSessions')}</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <BatteryCharging className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {profile?.total_sessions ?? transactions.length}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 block">
                {t('userPortal.totalUses')}
              </span>
            </div>
          </div>

          <div className="card p-5 border border-slate-200 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 dark:text-gray-400">
              <span className="text-xs font-semibold uppercase">{t('userPortal.avgPerSession')}</span>
              <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {profile?.total_sessions && profile.total_sessions > 0
                  ? ((profile.total_kwh || 0) / profile.total_sessions).toFixed(1)
                  : '0.0'}{' '}
                <span className="text-sm font-normal text-slate-500">kWh</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 block">
                {t('userPortal.avgConsumption')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Charging Session Banner (If currently charging) */}
      {activeCharge ? (
        <div className="card p-6 border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-950/20 via-slate-900/40 to-blue-950/20 shadow-lg shadow-emerald-500/10 animate-fade-up space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="relative flex p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Zap className="w-6 h-6 animate-pulse" />
                <span className="animate-ping absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  {t('userPortal.activeCharging')}
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">
                  {t('userPortal.stationConnector', { cp: activeCharge.charge_point_id, connector: activeCharge.connector_id })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                {t('userPortal.transaction', { id: activeCharge.transaction_id })}
              </div>
              <button
                type="button"
                onClick={handleStopMyCharge}
                disabled={isStopping}
                className="btn text-xs px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-red-600/20 cursor-pointer disabled:opacity-50"
              >
                {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                <span>{isStopping ? 'A Parar...' : 'Terminar Carga'}</span>
              </button>
            </div>
          </div>

          {stopFeedback && (
            <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              stopFeedback.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'
            }`}>
              {stopFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{stopFeedback.message}</span>
            </div>
          )}

          {/* Battery Indicator with live SoC% and Power */}
          <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-black/30 border border-emerald-500/20 shadow-sm">
            <BatteryIndicator
              soc={activeCharge.current_soc ?? null}
              isCharging={true}
              powerKw={activeCharge.current_power_kw || null}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 uppercase block">{t('userPortal.livePower')}</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {activeCharge.current_power_kw} kW
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 uppercase block">{t('userPortal.deliveredEnergy')}</span>
              <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {activeCharge.consumed_kwh} kWh
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 uppercase block">{t('userPortal.startTime')}</span>
              <span className="text-sm font-bold font-mono text-slate-700 dark:text-gray-200">
                {activeCharge.start_time ? safeFormatDateTime(activeCharge.start_time) : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 uppercase block">{t('userPortal.status')}</span>
              <span className="text-sm font-bold text-emerald-500 flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                {t('userPortal.chargingNow')}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Transaction History */}
      <div className="card p-6 border border-slate-200 dark:border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('userPortal.historyTitle')}
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
            {t('userPortal.registeredCount', { count: transactions.length })}
          </span>
        </div>

        {txLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
            {t('userPortal.loadingHistory')}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-gray-500 space-y-2">
            <Clock className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">{t('userPortal.noChargesYet')}</p>
            <p className="text-xs text-slate-400">
              {t('userPortal.noChargesDescription', { tag: rfidTag })}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th>{t('userPortal.table.transaction')}</th>
                  <th>{t('userPortal.table.station')}</th>
                  <th>{t('userPortal.table.start')}</th>
                  <th>{t('userPortal.table.end')}</th>
                  <th>{t('userPortal.table.duration')}</th>
                  <th>{t('userPortal.table.consumption')}</th>
                  <th>{t('userPortal.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any) => {
                  const duration = tx.start_time && tx.stop_time
                    ? safeFormatDuration(
                        (new Date(tx.stop_time).getTime() - new Date(tx.start_time).getTime()) / 1000
                      )
                    : tx.status === 'Active' ? t('userPortal.inProgress') : '—'

                  const kwh = tx.kwh !== undefined
                    ? tx.kwh
                    : (tx.meter_stop && tx.meter_start ? ((tx.meter_stop - tx.meter_start) / 1000).toFixed(2) : '0.0')

                  return (
                    <tr key={tx.id || tx.transaction_id}>
                      <td className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                        #{tx.transaction_id}
                      </td>
                      <td className="font-medium text-xs text-slate-800 dark:text-gray-200">
                        {tx.charge_point_id} ({t('remoteStart.connectorLabel', { id: tx.connector_id })})
                      </td>
                      <td className="text-xs text-slate-600 dark:text-gray-400 font-mono">
                        {safeFormatDateTime(tx.start_time)}
                      </td>
                      <td className="text-xs text-slate-600 dark:text-gray-400 font-mono">
                        {tx.stop_time ? safeFormatDateTime(tx.stop_time) : '—'}
                      </td>
                      <td className="text-xs text-slate-700 dark:text-gray-300 font-mono">
                        {duration}
                      </td>
                      <td>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                          {kwh} kWh
                        </span>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          tx.status === 'Active'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}>
                          {tx.status === 'Active' ? t('userPortal.chargingNow') : t('userPortal.completed')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Remote Start Modal */}
        <RemoteStartModal
          isOpen={showRemoteStartModal}
          onClose={() => setShowRemoteStartModal(false)}
          rfidTag={rfidTag}
          username={profile?.username || user?.username}
        />
      </div>
    </div>
  )
}
