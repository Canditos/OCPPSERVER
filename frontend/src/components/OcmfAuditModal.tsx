import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Download, Cpu, Key, FileCode, CheckCircle2, XCircle, Clock
} from 'lucide-react'
import { api } from '../api'
import { useI18n } from '../i18n'
import type { OcmfAuditReport } from '../types'

interface OcmfAuditModalProps {
  transactionId: number
  onClose: () => void
}

export function OcmfAuditModal({ transactionId, onClose }: OcmfAuditModalProps) {
  const { t } = useI18n()
  const { data: audit, isLoading, error } = useQuery<OcmfAuditReport>({
    queryKey: ['ocmf-audit', transactionId],
    queryFn: () => api.getTransactionOcmf(transactionId),
  })

  const [activeTab, setActiveTab] = useState<'summary' | 'raw'>('summary')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${audit?.ocmf_verified ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t('ocmfAuditModal.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {t('ocmfAuditModal.subtitle', { tx: transactionId })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Clock className="w-8 h-8 animate-spin mb-2 text-blue-500" />
              <p className="text-sm">{t('ocmfAuditModal.loading')}</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              {t('ocmfAuditModal.loadError')}
            </div>
          )}

          {audit && (
            <>
              {/* Verdict Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                audit.ocmf_verified
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}>
                <div className="flex items-center gap-3">
                  {audit.ocmf_verified ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm">
                      {audit.ocmf_verified ? t('ocmfAuditModal.validTitle') : t('ocmfAuditModal.pendingTitle')}
                    </h4>
                    <p className="text-xs opacity-80 mt-0.5">
                      {audit.ocmf_verified
                        ? t('ocmfAuditModal.validDesc')
                        : (audit.ocmf_verification_error || t('ocmfAuditModal.pendingDescDefault'))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Meter Info Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">{t('ocmfAuditModal.dcMeter')}</span>
                  <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-500" />
                    {audit.meter_model || 'LEM DCBM 400'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">{t('ocmfAuditModal.meterSerial')}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {audit.meter_serial || '—'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">{t('ocmfAuditModal.crypto')}</span>
                  <span className="font-mono text-slate-700 dark:text-gray-300">
                    ECDSA ({audit.curve_name || 'secp256r1'})
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 pb-2 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'summary'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  {t('ocmfAuditModal.tabSignedReadings')}
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'raw'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  {t('ocmfAuditModal.tabRawPayload')}
                </button>
              </div>

              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {/* Total Transaction Value & Energy Summary Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-blue-500/10 to-indigo-500/15 border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-emerald-500/20">
                      {/* Total Energy */}
                      <div className="sm:pr-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
                          {t('ocmfAuditModal.totalEnergyDelivered')}
                        </span>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {(audit.signed_energy_kwh ?? audit.energy_kwh ?? 0).toFixed(3)}{' '}
                          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">kWh</span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 block">
                          {t('ocmfAuditModal.deltaMetrological')}
                        </span>
                      </div>

                      {/* Total Cost */}
                      <div className="pt-3 sm:pt-0 sm:px-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
                          {t('ocmfAuditModal.totalTransactionCost')}
                        </span>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                          {((audit.signed_energy_kwh ?? audit.energy_kwh ?? 0) * 0.28).toFixed(2)}{' '}
                          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">€</span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 block">
                          {t('ocmfAuditModal.tariffEstimated')}
                        </span>
                      </div>

                      {/* Session Details */}
                      <div className="pt-3 sm:pt-0 sm:pl-4 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 block mb-1">
                            {t('ocmfAuditModal.durationAndId')}
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-gray-200 text-sm block">
                            {audit.duration_seconds
                              ? t('ocmfAuditModal.durationValue', {
                                  min: Math.floor(audit.duration_seconds / 60),
                                  sec: audit.duration_seconds % 60
                                })
                              : '—'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                          Tag: {audit.id_tag || 'Standard RFID'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Labeled Readings */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-slate-700 dark:text-gray-300">
                      {t('ocmfAuditModal.physicalAccumulatorsTitle')}
                    </h5>
                    <div className="space-y-2">
                      {audit.stop_report?.readings?.map((r: any, idx: number) => {
                        // Distinguish start vs stop readings
                        const isFirstHalf = idx < Math.ceil((audit.stop_report.readings.length || 1) / 2)
                        const stageLabel = (audit.stop_report.readings.length > 2)
                          ? (isFirstHalf ? t('ocmfAuditModal.startOfChargeBadge') : t('ocmfAuditModal.endOfChargeBadge'))
                          : null

                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex items-center justify-between text-xs font-mono hover:border-blue-500/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-blue-600 dark:text-blue-400 font-bold">{r.obis}</span>
                                {stageLabel && (
                                  <span className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded-md ${
                                    isFirstHalf ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  }`}>
                                    {stageLabel}
                                  </span>
                                )}
                                {r.obis === '1-0:1.8.0' ? (
                                  <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                    {t('ocmfAuditModal.supplyToBattery')}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                    {t('ocmfAuditModal.v2gExportInactive')}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                                {r.obis === '1-0:2.8.0'
                                  ? t('ocmfAuditModal.v2gExportDesc')
                                  : r.description}
                              </span>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                              <span className="font-bold text-slate-900 dark:text-white text-base">
                                {r.value} <span className="text-xs text-slate-500 font-normal">{r.unit}</span>
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'raw' && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-60 whitespace-pre-wrap break-all leading-relaxed">
                    {audit.ocmf_stop_raw || audit.ocmf_start_raw || t('ocmfAuditModal.noRawData')}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <span className="text-[11px] text-slate-400">
            {t('ocmfAuditModal.safeTransparencyCompliance')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => api.downloadTransactionOcmf(transactionId)}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {t('ocmfAuditModal.downloadOcmfBtn')}
            </button>
            <button onClick={onClose} className="btn btn-primary text-xs">
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
