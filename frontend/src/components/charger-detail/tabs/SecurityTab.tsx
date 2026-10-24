import React, { useState } from 'react'
import {
  Award, Download, Send, RefreshCw, Sparkles, CheckCircle2, AlertTriangle,
  FileText, Eye, Trash2, X, Copy
} from 'lucide-react'
import { api } from '../../../api'
import { useI18n } from '../../../i18n'
import { safeFormatDate } from '../../../utils/date'
import type { Charger, Certificate, IssueClientCertResponse } from '../../../types'

interface SecurityTabProps {
  charger: Charger
  isOnline: boolean
  certs: Certificate[]
  onRefreshCerts: () => void
}

export function SecurityTab({ charger, isOnline, certs, onRefreshCerts }: SecurityTabProps) {
  const { t } = useI18n()
  const [certFeedback, setCertFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [certLoading, setCertLoading] = useState<boolean>(false)
  const [inspectCert, setInspectCert] = useState<Certificate | null>(null)
  const [newClientCert, setNewClientCert] = useState<IssueClientCertResponse | null>(null)

  const handleInstallRootCa = async () => {
    if (!charger.charge_point_id) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.installCertificate(charger.charge_point_id, {
        certificate_type: 'CentralSystemRootCertificate',
      })
      setCertFeedback({ type: 'success', message: t('securityTab.rootCaSuccess', { status: res.status }) })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: t('securityTab.rootCaError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 5000)
    }
  }

  const handleQueryDeviceCerts = async () => {
    if (!charger.charge_point_id) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.queryInstalledCertificates(charger.charge_point_id)
      const count = res.certificate_hash_data ? res.certificate_hash_data.length : 0
      setCertFeedback({ type: 'success', message: t('securityTab.querySuccess', { count, status: res.status }) })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: t('securityTab.queryError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 5000)
    }
  }

  const handleIssueClientCert = async () => {
    if (!charger.charge_point_id) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.issueClientCert(charger.charge_point_id, { validity_days: 365 })
      setNewClientCert(res)
      setCertFeedback({ type: 'success', message: t('securityTab.issueSuccess') })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: t('securityTab.issueError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setCertLoading(false)
    }
  }

  const handleDeleteCert = async (certId: number) => {
    if (!charger.charge_point_id || !confirm(t('securityTab.deleteConfirm'))) return
    setCertLoading(true)
    try {
      await api.deleteCertificate(charger.charge_point_id, certId)
      setCertFeedback({ type: 'success', message: t('securityTab.deleteSuccess') })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: t('securityTab.deleteError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 4000)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Certificate Management Card (Security Profile 3) */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
                {t('securityTab.title')}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30 font-mono">
                  Profile 3
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                {t('securityTab.subtitle')}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={api.getRootCaUrl()}
              download="csms_root_ca.crt"
              className="btn bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-white/10 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 transition-all"
              title={t('securityTab.downloadRootCaTooltip')}
            >
              <Download className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              <span>{t('securityTab.downloadRootCa')}</span>
            </a>

            <button
              type="button"
              onClick={handleInstallRootCa}
              disabled={certLoading || !isOnline}
              className="btn bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
              title={isOnline ? t('securityTab.installRootCaTooltipOnline') : t('securityTab.offlineTooltip')}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t('securityTab.installCaBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handleQueryDeviceCerts}
              disabled={certLoading || !isOnline}
              className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
              title={isOnline ? t('securityTab.queryStationTooltipOnline') : t('securityTab.offlineTooltip')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${certLoading ? 'animate-spin' : ''}`} />
              <span>{t('securityTab.queryBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handleIssueClientCert}
              disabled={certLoading}
              className="btn-primary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('securityTab.issueClientCert')}</span>
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {certFeedback && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            certFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30'
          }`}>
            {certFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500 dark:text-red-400" />}
            <span>{certFeedback.message}</span>
          </div>
        )}

        {/* Certificates Table */}
        {certs.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-white/10 text-center">
            <FileText className="w-5 h-5 text-gray-500 mx-auto mb-1 opacity-70" />
            <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">{t('securityTab.noCerts')}</p>
            <p className="text-[10px] text-slate-500 dark:text-gray-500 mt-0.5">{t('securityTab.noCertsSub')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-gray-950/80 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-gray-950 border-b border-slate-200 dark:border-white/15 text-[11px] text-slate-700 dark:text-gray-200 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">{t('securityTab.tableType')}</th>
                  <th className="py-3 px-3">{t('securityTab.tableCommonName')}</th>
                  <th className="py-3 px-3">{t('securityTab.tableIssuer')}</th>
                  <th className="py-3 px-3">{t('securityTab.tableSerial')}</th>
                  <th className="py-3 px-3">{t('securityTab.tableValidity')}</th>
                  <th className="py-3 px-3">{t('securityTab.tableStatus')}</th>
                  <th className="py-3 px-3 text-right">{t('securityTab.tableActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-mono">
                {certs.map((c) => {
                  const isRootCa = c.certificate_type === 'CentralSystemRootCertificate'
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isRootCa ? 'bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/40' : 'bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-500/40'
                        }`}>
                          {isRootCa ? t('securityTab.badgeCsmsRoot') : t('securityTab.badgeClientEvse')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-white font-sans font-bold whitespace-nowrap">
                        {c.subject_cn || (isRootCa ? 'Canditos Root CA' : charger.charge_point_id)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-gray-300 font-sans text-xs whitespace-nowrap">
                        {c.issuer_cn || 'Canditos CSMS Root CA'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-gray-300 font-mono text-xs truncate max-w-[120px]" title={c.serial_number}>
                        {c.serial_number.slice(0, 12)}…
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-gray-300 font-mono text-xs whitespace-nowrap">
                        {c.valid_to ? safeFormatDate(c.valid_to) : '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          c.status === 'InstalledOnDevice'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40'
                            : c.status === 'Active'
                            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/40'
                            : 'bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/40'
                        }`}>
                          {c.status === 'InstalledOnDevice' ? t('securityTab.installedOnDevice') : c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap space-x-1 font-sans">
                        <button
                          type="button"
                          onClick={() => setInspectCert(c)}
                          className="btn-ghost p-1 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white rounded"
                          title={t('securityTab.viewPemTooltip')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {!isRootCa && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCert(c.id)}
                            className="btn-ghost p-1 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 rounded"
                            title={t('securityTab.deleteCertTooltip')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Certificate Modal */}
      {inspectCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setInspectCert(null)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-gray-100">{inspectCert.subject_cn || t('securityTab.certDetailsTitle')}</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400">{inspectCert.certificate_type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="p-1 text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 space-y-1">
                <span className="text-slate-500 dark:text-gray-400 block text-[10px]">{t('securityTab.issuerLabel')}</span>
                <span className="font-semibold text-slate-800 dark:text-gray-200">{inspectCert.issuer_cn || 'Canditos CSMS Root CA'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 space-y-1">
                <span className="text-slate-500 dark:text-gray-400 block text-[10px]">{t('securityTab.serialLabel')}</span>
                <span className="font-mono text-slate-800 dark:text-gray-200 truncate block" title={inspectCert.serial_number}>{inspectCert.serial_number}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 space-y-1">
                <span className="text-slate-500 dark:text-gray-400 block text-[10px]">{t('securityTab.validFrom')}</span>
                <span className="font-mono text-slate-800 dark:text-gray-200">{inspectCert.valid_from ? safeFormatDate(inspectCert.valid_from) : '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 space-y-1">
                <span className="text-slate-500 dark:text-gray-400 block text-[10px]">{t('securityTab.validTo')}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{inspectCert.valid_to ? safeFormatDate(inspectCert.valid_to) : '—'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800 dark:text-gray-300">{t('securityTab.certContent')}</label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inspectCert.certificate_pem)
                    alert(t('securityTab.copiedPemAlert'))
                  }}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 font-medium"
                >
                  <Copy className="w-3.5 h-3.5" /> {t('securityTab.copyPemBtn')}
                </button>
              </div>
              <textarea
                readOnly
                value={inspectCert.certificate_pem}
                rows={8}
                className="w-full bg-slate-100 dark:bg-gray-950/90 border border-slate-200 dark:border-white/10 rounded-xl p-3 font-mono text-[11px] text-slate-800 dark:text-gray-300 select-all focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([inspectCert.certificate_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${(inspectCert.subject_cn || 'cert').toLowerCase().replace(/\s+/g, '_')}.crt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-300 border border-purple-500/30 text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> {t('securityTab.downloadCrtBtn')}
              </button>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                {t('securityTab.closeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freshly Issued Client Certificate Modal */}
      {newClientCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setNewClientCert(null)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-emerald-500/30 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-gray-100">{t('securityTab.clientCertIssued')}</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 font-mono">{newClientCert.charge_point_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="p-1 text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t('securityTab.warningPrivateKey')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-gray-300 block mb-1">{t('securityTab.certX509Label')}</label>
                <textarea
                  readOnly
                  value={newClientCert.certificate_pem}
                  rows={6}
                  className="w-full bg-slate-100 dark:bg-gray-950/90 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-slate-800 dark:text-gray-300 select-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-gray-300 block mb-1">{t('securityTab.privKeyLabel')}</label>
                <textarea
                  readOnly
                  value={newClientCert.private_key_pem}
                  rows={6}
                  className="w-full bg-slate-100 dark:bg-gray-950/90 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-amber-700 dark:text-amber-300 select-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10 justify-end flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([newClientCert.certificate_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${newClientCert.charge_point_id}_client.crt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> {t('securityTab.downloadCertCrtBtn')}
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([newClientCert.private_key_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${newClientCert.charge_point_id}_client.key`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> {t('securityTab.downloadKeyBtn')}
              </button>

              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                {t('securityTab.doneBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
