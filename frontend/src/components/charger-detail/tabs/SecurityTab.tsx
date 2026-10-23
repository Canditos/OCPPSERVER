import React, { useState } from 'react'
import {
  Award, Download, Send, RefreshCw, Sparkles, CheckCircle2, AlertTriangle,
  FileText, Eye, Trash2, X, Copy
} from 'lucide-react'
import { api } from '../../../api'
import { safeFormatDate } from '../../../utils/date'
import type { Charger, Certificate, IssueClientCertResponse } from '../../../types'

interface SecurityTabProps {
  charger: Charger
  isOnline: boolean
  certs: Certificate[]
  onRefreshCerts: () => void
}

export function SecurityTab({ charger, isOnline, certs, onRefreshCerts }: SecurityTabProps) {
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
      setCertFeedback({ type: 'success', message: `Root CA enviada ao posto via InstallCertificate (${res.status})` })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao instalar CA no posto: ${err?.response?.data?.detail || err.message}` })
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
      setCertFeedback({ type: 'success', message: `Consulta concluída: ${count} certificado(s) reportados pelo posto (${res.status})` })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao consultar certificados no posto: ${err?.response?.data?.detail || err.message}` })
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
      setCertFeedback({ type: 'success', message: 'Novo Certificado de Cliente X.509 emitido com sucesso!' })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao emitir certificado: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
    }
  }

  const handleDeleteCert = async (certId: number) => {
    if (!charger.charge_point_id || !confirm('Tem a certeza que deseja remover este registo de certificado?')) return
    setCertLoading(true)
    try {
      await api.deleteCertificate(charger.charge_point_id, certId)
      setCertFeedback({ type: 'success', message: 'Certificado removido do sistema!' })
      onRefreshCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao remover: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 4000)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Certificate Management Card (Security Profile 3) */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/25">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                Certificados Digitais X.509 & mTLS
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono">
                  Profile 3
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Infraestrutura de Chaves Públicas (PKI), Root CA do CSMS e certificados de hardware
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={api.getRootCaUrl()}
              download="csms_root_ca.crt"
              className="btn bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 transition-all"
              title="Descarregar certificado Root CA (.crt) para importar no posto ou browser"
            >
              <Download className="w-3.5 h-3.5 text-purple-400" />
              <span>Baixar Root CA</span>
            </a>

            <button
              type="button"
              onClick={handleInstallRootCa}
              disabled={certLoading || !isOnline}
              className="btn bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
              title={isOnline ? 'Enviar Root CA do CSMS ao posto via OCPP InstallCertificate' : 'Posto offline'}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Instalar CA no Posto</span>
            </button>

            <button
              type="button"
              onClick={handleQueryDeviceCerts}
              disabled={certLoading || !isOnline}
              className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
              title={isOnline ? 'Consultar certificados no posto via OCPP GetInstalledCertificateIds' : 'Posto offline'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${certLoading ? 'animate-spin' : ''}`} />
              <span>Consultar no Posto</span>
            </button>

            <button
              type="button"
              onClick={handleIssueClientCert}
              disabled={certLoading}
              className="btn-primary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Emitir Certificado de Cliente</span>
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {certFeedback && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            certFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}>
            {certFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
            <span>{certFeedback.message}</span>
          </div>
        )}

        {/* Certificates Table */}
        {certs.length === 0 ? (
          <div className="p-4 rounded-xl bg-white/2 border border-white/5 text-center">
            <FileText className="w-5 h-5 text-gray-500 mx-auto mb-1 opacity-70" />
            <p className="text-xs text-gray-400 font-medium">Nenhum certificado registado para este carregador.</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Clica em "Emitir Certificado de Cliente" para gerar um par de chaves X.509 ou "Instalar CA no Posto".</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/15 bg-gray-950/80 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 border-b border-white/15 text-[11px] text-gray-200 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Tipo / Função</th>
                  <th className="py-3 px-3">Common Name (CN)</th>
                  <th className="py-3 px-3">Emissor</th>
                  <th className="py-3 px-3">Nº Série</th>
                  <th className="py-3 px-3">Validade</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 font-mono">
                {certs.map((c) => {
                  const isRootCa = c.certificate_type === 'CentralSystemRootCertificate'
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-white/8">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isRootCa ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40' : 'bg-blue-500/25 text-blue-300 border border-blue-500/40'
                        }`}>
                          {isRootCa ? '🏛️ CSMS Root CA' : '⚡ Client (EVSE)'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-white font-sans font-bold whitespace-nowrap">
                        {c.subject_cn || (isRootCa ? 'Canditos Root CA' : charger.charge_point_id)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-300 font-sans text-xs whitespace-nowrap">
                        {c.issuer_cn || 'Canditos CSMS Root CA'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-300 font-mono text-xs truncate max-w-[120px]" title={c.serial_number}>
                        {c.serial_number.slice(0, 12)}…
                      </td>
                      <td className="py-2.5 px-3 text-gray-300 font-mono text-xs whitespace-nowrap">
                        {c.valid_to ? safeFormatDate(c.valid_to) : '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          c.status === 'InstalledOnDevice'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : c.status === 'Active'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-red-500/20 text-red-300 border-red-500/40'
                        }`}>
                          {c.status === 'InstalledOnDevice' ? 'Instalado no Posto' : c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap space-x-1 font-sans">
                        <button
                          type="button"
                          onClick={() => setInspectCert(c)}
                          className="btn-ghost p-1 text-gray-400 hover:text-white rounded"
                          title="Ver Detalhes do Certificado (PEM)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {!isRootCa && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCert(c.id)}
                            className="btn-ghost p-1 text-red-400 hover:text-red-300 rounded"
                            title="Remover Certificado"
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
            className="w-full max-w-2xl bg-gray-900 border border-white/15 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">{inspectCert.subject_cn || 'Certificado X.509'}</h3>
                  <p className="text-xs text-gray-400">{inspectCert.certificate_type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Emissor (Issuer)</span>
                <span className="font-semibold text-gray-200">{inspectCert.issuer_cn || 'Canditos CSMS Root CA'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Número de Série</span>
                <span className="font-mono text-gray-200 truncate block" title={inspectCert.serial_number}>{inspectCert.serial_number}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Válido De</span>
                <span className="font-mono text-gray-200">{inspectCert.valid_from ? safeFormatDate(inspectCert.valid_from) : '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Válido Até</span>
                <span className="font-mono text-emerald-400">{inspectCert.valid_to ? safeFormatDate(inspectCert.valid_to) : '—'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">Conteúdo do Certificado (PEM Format)</label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inspectCert.certificate_pem)
                    alert('Certificado copiado para a área de transferência!')
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar PEM
                </button>
              </div>
              <textarea
                readOnly
                value={inspectCert.certificate_pem}
                rows={8}
                className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-gray-300 select-all focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
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
                className="btn bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Descarregar Ficheiro .crt
              </button>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                Fechar
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
            className="w-full max-w-2xl bg-gray-900 border border-emerald-500/30 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">Certificado de Cliente X.509 Emitido!</h3>
                  <p className="text-xs text-gray-400 font-mono">{newClientCert.charge_point_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Atenção:</strong> Guarda a Chave Privada (<code className="font-mono text-amber-200">.key</code>) num local seguro agora. Por motivos de segurança estrita, o par de chaves privadas não é guardado em texto simples no servidor.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Certificado X.509 (.crt / .pem)</label>
                <textarea
                  readOnly
                  value={newClientCert.certificate_pem}
                  rows={6}
                  className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-gray-300 select-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Chave Privada (.key / .pem)</label>
                <textarea
                  readOnly
                  value={newClientCert.private_key_pem}
                  rows={6}
                  className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-amber-300 select-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-white/10 justify-end flex-wrap">
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
                className="btn bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descarregar Certificado (.crt)
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
                className="btn bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descarregar Chave Privada (.key)
              </button>

              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
