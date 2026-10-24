import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDuration, intervalToDuration } from 'date-fns'
import {
  ChevronDown, ChevronRight, Zap, User as UserIcon,
  Shield, CreditCard, Clock, Activity, ArrowLeftRight,
  ShieldCheck, ShieldAlert, RefreshCw, Download
} from 'lucide-react'
import { safeFormatDate } from '../utils/date'
import { api } from '../api'
import { useI18n } from '../i18n'
import { MeterChart } from '../components/MeterChart'
import { OcmfAuditModal } from '../components/OcmfAuditModal'
import type { Charger, MeterKeyData, Transaction } from '../types'

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const cls = status === 'Active'
    ? 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse flex items-center gap-1.5'
    : 'px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-gray-700'

  return (
    <span className={cls}>
      {status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
      {status === 'Active' ? t('transactions.charging') : t('transactions.completed')}
    </span>
  )
}

export function Transactions() {
  const { t } = useI18n()
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const { data: meterKeys = [] } = useQuery<MeterKeyData[]>({
    queryKey: ['ocmf-meter-keys'],
    queryFn: () => api.getMeterKeys(),
    refetchInterval: 30000,
  })
  const [filterCp, setFilterCp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [selectedOcmfTx, setSelectedOcmfTx] = useState<number | null>(null)
  const [isRevalidating, setIsRevalidating] = useState(false)

  const { data: txs = [], refetch } = useQuery<Transaction[]>({
    queryKey: ['transactions', filterCp, filterStatus],
    queryFn: () => api.getTransactions(filterCp || undefined, filterStatus || undefined),
    refetchInterval: 5000,
  })

  const toggle = (id: number) => setExpanded(expanded === id ? null : id)

  const handleReverifyOcmf = async () => {
    try {
      setIsRevalidating(true)
      await api.reverifyOcmfTransactions()
      await refetch()
    } catch (e) {
      console.error(e)
    } finally {
      setIsRevalidating(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('transactions.title')}
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            {t('transactions.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReverifyOcmf}
            disabled={isRevalidating}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title={t('transactions.reverifyTooltip')}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isRevalidating ? 'animate-spin' : ''}`} />
            <span>{t('transactions.reverifyOcmf')}</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-gray-800/80 border border-slate-200 dark:border-gray-700 text-xs font-mono text-slate-700 dark:text-gray-300">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('transactions.registered', { count: txs.length })}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className="select max-w-[220px] text-xs" value={filterCp} onChange={(e) => setFilterCp(e.target.value)}>
          <option value="">{t('transactions.allStations')}</option>
          {chargers.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
        </select>
        <select className="select max-w-[180px] text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('transactions.allStatuses')}</option>
          <option value="Active">{t('transactions.activeOnly')}</option>
          <option value="Completed">{t('transactions.completedOnly')}</option>
        </select>
      </div>

      {/* Transactions List */}
      <div className="space-y-2.5">
        {txs.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-slate-400 dark:text-gray-500 text-sm border border-slate-200 dark:border-white/5 space-y-2">
            <Clock className="w-8 h-8 opacity-40" />
            <p>{t('transactions.noneFound')}</p>
          </div>
        )}

        {txs.map((tx) => {
          const duration = tx.stop_time
            ? formatDuration(intervalToDuration({ start: new Date(tx.start_time), end: new Date(tx.stop_time) }), { format: ['hours', 'minutes', 'seconds'] })
            : tx.status === 'Active' ? t('transactions.inProgress') : null

          const isOpen = expanded === tx.id
          const charger = chargers.find((item) => item.charge_point_id === tx.charge_point_id)
          const hasActiveErk = meterKeys.some((key) =>
            key.charge_point_id === tx.charge_point_id
            && key.connector_id === tx.connector_id
            && key.is_active !== false
            && key.is_valid !== false
          )
          const isErkCompliant = Boolean(charger?.is_eichrecht_compliant && hasActiveErk)
          const isErkMissingKey = Boolean(charger?.is_eichrecht_compliant && !hasActiveErk)

          return (
            <div
              key={tx.id}
              className={`card p-0 overflow-hidden border transition-all duration-150 ${
                tx.status === 'Active'
                  ? 'border-emerald-500/40 shadow-md shadow-emerald-500/5 bg-emerald-500/[0.02]'
                  : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <button
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                onClick={() => toggle(tx.id)}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}

                <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3 items-center text-xs">
                  {/* Transaction ID & Charger */}
                  <div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm block">
                      #{tx.transaction_id}
                    </span>
                    <span className="text-slate-500 dark:text-gray-400 font-medium text-[11px]">
                      {tx.charge_point_id} · T#{tx.connector_id}
                    </span>
                  </div>

                  {/* Driver / User */}
                  <div className="md:col-span-2">
                    {tx.user_username ? (
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                          <UserIcon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-xs block">
                            {tx.user_username}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                            Tag: {tx.id_tag}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700 dark:text-gray-300 text-xs">
                          {tx.id_tag || t('transactions.noTag')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Start Time */}
                  <div>
                    <span className="text-slate-800 dark:text-gray-200 font-mono text-xs block">
                      {safeFormatDate(tx.start_time, 'dd/MM HH:mm')}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">
                      {tx.stop_time ? safeFormatDate(tx.stop_time, 'dd/MM HH:mm') : t('transactions.inProgress')}
                    </span>
                  </div>

                  {/* Energy Consumed & Total Cost */}
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm">
                          {tx.energy_kwh !== undefined && tx.energy_kwh !== null ? tx.energy_kwh.toFixed(3) : '0.000'} kWh
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-900 dark:text-white px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">
                          {(((tx.energy_kwh ?? 0) * 0.28)).toFixed(2)} €
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {duration || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Status & Metrology Badge */}
                  <div className="flex flex-col md:flex-row items-end md:items-center justify-end gap-1.5">
                    <StatusBadge status={tx.status} />
                    {tx.ocmf_verified ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOcmfTx(tx.transaction_id)
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 hover:bg-emerald-500/25 transition-colors"
                        title={t('transactions.validOcmfTooltip')}
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span>{t('transactions.ocmfValid')}</span>
                      </button>
                    ) : tx.status === 'Active' && isErkCompliant ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1"
                        title={t('transactions.erkCompliantTooltip')}
                      >
                        <ShieldCheck className="w-3 h-3 text-blue-500" />
                        <span>{t('transactions.erkCompliance')}</span>
                      </span>
                    ) : tx.status === 'Active' && isErkMissingKey ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"
                        title={t('transactions.erkMissingTooltip')}
                      >
                        <ShieldAlert className="w-3 h-3 text-amber-500" />
                        <span>{t('transactions.erkMissingKey')}</span>
                      </span>
                    ) : tx.status !== 'Active' && isErkCompliant && !tx.ocmf_start_raw && !tx.ocmf_stop_raw ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 flex items-center gap-1"
                        title={t('transactions.ocmfNotReceivedTooltip')}
                      >
                        <ShieldAlert className="w-3 h-3 text-red-500" />
                        <span>{t('transactions.ocmfNotReceived')}</span>
                      </span>
                    ) : (tx.ocmf_stop_raw || tx.ocmf_start_raw) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOcmfTx(tx.transaction_id)
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/25 transition-colors"
                        title={t('transactions.inspectOcmfTooltip')}
                      >
                        <ShieldAlert className="w-3 h-3 text-amber-500" />
                        <span>{t('transactions.ocmfBadge')}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isOpen && (
                <div className="px-5 pb-5 pt-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01]">
                  {/* Detailed summary pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs mb-3">
                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">{t('transactions.user')}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {tx.user_username ? `${tx.user_username} (${tx.user_role || 'user'})` : t('transactions.notRegistered')}
                      </span>
                      {tx.user_email && <span className="text-[10px] text-slate-400 block">{tx.user_email}</span>}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">{t('transactions.startEnd')}</span>
                      <span className="font-mono text-slate-800 dark:text-gray-200 text-[11px] block">
                        {t('transactions.start')}: {safeFormatDate(tx.start_time, 'dd/MM/yyyy HH:mm:ss')}
                      </span>
                      {tx.stop_time && (
                        <span className="font-mono text-slate-500 text-[11px] block">
                          {t('transactions.stop')}: {safeFormatDate(tx.stop_time, 'dd/MM/yyyy HH:mm:ss')}
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">{t('transactions.meterReadings')}</span>
                      <span className="font-mono text-slate-800 dark:text-gray-200 text-[11px] block">
                        Start: {tx.meter_start} Wh
                      </span>
                      {tx.meter_stop !== null && tx.meter_stop !== undefined && (
                        <span className="font-mono text-slate-500 text-[11px] block">
                          Stop: {tx.meter_stop} Wh
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">{t('transactions.legalMetrology')}</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-bold text-xs flex items-center gap-1">
                          {tx.ocmf_verified ? (
                            <span className="text-emerald-500 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> {t('transactions.signedValid')}
                            </span>
                          ) : tx.status === 'Active' && isErkCompliant ? (
                            <span
                              className="text-blue-500 flex items-center gap-1"
                              title={t('transactions.erkCompliantTooltip')}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> {t('transactions.erkActiveValidationEnd')}
                            </span>
                          ) : tx.status === 'Active' && isErkMissingKey ? (
                            <span className="text-amber-500 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> {t('transactions.erkMissingKey')}
                            </span>
                          ) : tx.status !== 'Active' && isErkCompliant && !tx.ocmf_start_raw && !tx.ocmf_stop_raw ? (
                            <span className="text-red-500 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> {t('transactions.ocmfFinalNotReceived')}
                            </span>
                          ) : tx.ocmf_stop_raw ? (
                            <span className="text-amber-500 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> {t('transactions.recorded')}
                            </span>
                          ) : (
                            <span className="text-slate-400">{t('transactions.standard')}</span>
                          )}
                        </span>
                        {(tx.ocmf_stop_raw || tx.ocmf_start_raw) && (
                          <button
                            onClick={() => setSelectedOcmfTx(tx.transaction_id)}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            {t('transactions.audit')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MeterValues Chart */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                    <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-2 block">
                      {t('transactions.telemetryCurve')}
                    </span>
                    <MeterChart cpId={tx.charge_point_id} transactionId={tx.id} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* OCMF Audit Modal */}
      {selectedOcmfTx && (
        <OcmfAuditModal
          transactionId={selectedOcmfTx}
          onClose={() => setSelectedOcmfTx(null)}
        />
      )}
    </div>
  )
}
