import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Shield, Download, Copy, Check,
  CheckCircle2, XCircle, FileText, Code, Activity, Zap,
  Cpu, ArrowRight, ExternalLink, X, AlertTriangle
} from 'lucide-react'
import { api, TransactionOcmfReport } from '../api'
import { useI18n } from '../i18n'

interface OcmfValidationModalProps {
  transactionId: number
  onClose: () => void
}

export function OcmfValidationModal({ transactionId, onClose }: OcmfValidationModalProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'summary' | 'start' | 'stop' | 'raw'>('summary')
  const [copied, setCopied] = useState(false)

  const { data: report, isLoading, error } = useQuery<TransactionOcmfReport>({
    queryKey: ['transactionOcmf', transactionId],
    queryFn: () => api.getTransactionOcmf(transactionId),
  })

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isStopVerified = report?.stop_report?.verified ?? false
  const isStartVerified = report?.start_report?.verified ?? false
  const isFullyVerified = isStopVerified && (report?.ocmf_start_raw ? isStartVerified : true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])


  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isFullyVerified
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
            }`}>
              {isFullyVerified ? <ShieldCheck className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t('ocmfValidationModal.title', { tx: transactionId })}
                <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  isFullyVerified
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                }`}>
                  {isFullyVerified ? t('ocmfValidationModal.badgeVerified') : t('ocmfValidationModal.badgeSafe')}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                {t('ocmfValidationModal.standardInfo')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={api.getOcmfDownloadUrl(transactionId)}
              target="_blank"
              rel="noreferrer"
              className="btn bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 shadow-sm"
              title={t('ocmfValidationModal.downloadTooltip')}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('ocmfValidationModal.downloadBtn')}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-2 px-4 border-b border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-gray-950/40 text-xs font-semibold">
          {[
            { id: 'summary', label: t('ocmfValidationModal.tabSummary') },
            { id: 'start', label: t('ocmfValidationModal.tabStart') },
            { id: 'stop', label: t('ocmfValidationModal.tabStop') },
            { id: 'raw', label: t('ocmfValidationModal.tabRaw') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {isLoading && (
            <div className="p-12 text-center text-slate-500 dark:text-gray-400 text-xs flex flex-col items-center gap-2">
              <Activity className="w-6 h-6 animate-spin text-blue-500" />
              <span>{t('ocmfValidationModal.loading')}</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {t('ocmfValidationModal.loadError', { error: (error as any)?.message })}
            </div>
          )}

          {report && activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                isFullyVerified
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
              }`}>
                <div className="flex items-start gap-3">
                  {isFullyVerified ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isFullyVerified
                        ? t('ocmfValidationModal.bannerValidTitle')
                        : t('ocmfValidationModal.bannerPendingTitle')}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-300 mt-1">
                      {isFullyVerified
                        ? t('ocmfValidationModal.bannerValidDesc')
                        : (report.ocmf_verification_error || t('ocmfValidationModal.bannerPendingDescDefault'))}
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 shrink-0">
                  {report.meter_model}
                </span>
              </div>

              {/* Hardware & Crypto Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">{t('ocmfValidationModal.certifiedMeter')}</span>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    {report.meter_model || 'LEM DCBM'}
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400">
                    S/N: {report.meter_serial || t('ocmfValidationModal.detectedInOcmf')}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">{t('ocmfValidationModal.cryptoAlgorithm')}</span>
                  <p className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-purple-500" />
                    ECDSA-SHA256
                  </p>
                  <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                    {t('ocmfValidationModal.curveLabel', { curve: report.curve_name })}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">{t('ocmfValidationModal.publicKeyLem')}</span>
                  <p className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                    {report.has_meter_key ? t('ocmfValidationModal.configured') : t('ocmfValidationModal.notRegistered')}
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400 truncate block">
                    {report.public_key_hex ? `${report.public_key_hex.slice(0, 16)}…` : t('ocmfValidationModal.enterInConfig')}
                  </span>
                </div>
              </div>

              {/* S.A.F.E. Transparency Software Guide */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-2">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold">
                  <ExternalLink className="w-4 h-4" />
                  <span>{t('ocmfValidationModal.safeGuideTitle')}</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-gray-300 text-[11px]">
                  <li>{t('ocmfValidationModal.safeGuideStep1')}</li>
                  <li>{t('ocmfValidationModal.safeGuideStep2')}</li>
                  <li>{t('ocmfValidationModal.safeGuideStep3')}</li>
                  <li>{t('ocmfValidationModal.safeGuideStep4')}</li>
                </ol>
              </div>
            </div>
          )}

          {report && activeTab === 'start' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t('ocmfValidationModal.startReadingTitle')}
              </h4>
              {report.start_report ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">{t('ocmfValidationModal.statusLabel', { status: report.start_report.status })}</p>
                    <p className="text-slate-500 font-mono">{t('ocmfValidationModal.timestampLabel', { time: report.start_report.timestamp || 'N/A' })}</p>
                    <p className="text-slate-500 font-mono">{t('ocmfValidationModal.versionLabel', { version: report.start_report.ocmf_version })}</p>
                  </div>

                  <table className="w-full text-xs font-mono">
                    <thead className="bg-slate-100 dark:bg-gray-950 text-left">
                      <tr>
                        <th className="p-2.5">{t('ocmfValidationModal.colObis')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colDesc')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colValue')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colUnit')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                      {report.start_report.readings?.map((r: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2.5 text-blue-500 font-bold">{r.obis}</td>
                          <td className="p-2.5 text-slate-700 dark:text-gray-300 font-sans">{r.description}</td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.value}</td>
                          <td className="p-2.5 text-slate-500">{r.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-400 p-4">{t('ocmfValidationModal.noStartPayload')}</p>
              )}
            </div>
          )}

          {report && activeTab === 'stop' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t('ocmfValidationModal.stopReadingTitle')}
              </h4>
              {report.stop_report ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">{t('ocmfValidationModal.statusLabel', { status: report.stop_report.status })}</p>
                    <p className="text-slate-500 font-mono">{t('ocmfValidationModal.timestampLabel', { time: report.stop_report.timestamp || 'N/A' })}</p>
                    <p className="text-slate-500 font-mono">{t('ocmfValidationModal.versionLabel', { version: report.stop_report.ocmf_version })}</p>
                  </div>

                  <table className="w-full text-xs font-mono">
                    <thead className="bg-slate-100 dark:bg-gray-950 text-left">
                      <tr>
                        <th className="p-2.5">{t('ocmfValidationModal.colObis')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colDesc')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colValue')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colUnit')}</th>
                        <th className="p-2.5">{t('ocmfValidationModal.colCableLoss')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                      {report.stop_report.readings?.map((r: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2.5 text-blue-500 font-bold">{r.obis}</td>
                          <td className="p-2.5 text-slate-700 dark:text-gray-300 font-sans">{r.description}</td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.value}</td>
                          <td className="p-2.5 text-slate-500">{r.unit}</td>
                          <td className="p-2.5 text-amber-500 font-mono">
                            {(() => {
                              const l = r.cable_loss
                              if (l === null || l === undefined) return '—'
                              if (typeof l === 'object') {
                                const v = l.l ?? l.loss ?? l.v ?? l.val ?? l.value
                                const u = l.u ?? l.unit ?? 'Wh'
                                return v !== undefined ? `${v} ${u}` : '—'
                              }
                              return `${l} Wh`
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-400 p-4">{t('ocmfValidationModal.noStopPayload')}</p>
              )}
            </div>
          )}

          {report && activeTab === 'raw' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('ocmfValidationModal.rawTitle')}
                </h4>
                <button
                  type="button"
                  onClick={() => copyText(report.ocmf_stop_raw || report.ocmf_start_raw || '')}
                  className="btn-secondary text-xs py-1 px-2.5 rounded-lg flex items-center gap-1.5"
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> {t('ocmfValidationModal.copied')}</> : <><Copy className="w-3.5 h-3.5" /> {t('ocmfValidationModal.copy')}</>}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 text-cyan-300 font-mono text-xs overflow-auto max-h-64 select-all leading-relaxed">
                <code>
                  {report.ocmf_stop_raw
                    ? `[STOP TX OCMF]:
${report.ocmf_stop_raw}

`
                    : ''}
                  {report.ocmf_start_raw
                    ? `[START TX OCMF]:
${report.ocmf_start_raw}`
                    : t('ocmfValidationModal.noRawPayload')}
                </code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 px-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950 text-xs text-slate-500 dark:text-gray-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('ocmfValidationModal.safeStandard')}</span>
            <a
              href="https://safe-ev.org/files/software/transparenzsoftware-1.4.1.jar"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-mono"
            >
              <Download className="w-3 h-3" /> {t('ocmfValidationModal.jarLatest')}
            </a>
            <span>·</span>
            <a
              href="https://safe-ev.org/files/software/transparenzsoftware-1.3.0.jar"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-mono"
            >
              <Download className="w-3 h-3" /> {t('ocmfValidationModal.jarBase')}
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-medium cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}