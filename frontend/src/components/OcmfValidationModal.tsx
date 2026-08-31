import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Shield, Download, Copy, Check,
  CheckCircle2, XCircle, FileText, Code, Activity, Zap,
  Cpu, ArrowRight, ExternalLink, X, AlertTriangle
} from 'lucide-react'
import { api, TransactionOcmfReport } from '../api'

interface OcmfValidationModalProps {
  transactionId: number
  onClose: () => void
}

export function OcmfValidationModal({ transactionId, onClose }: OcmfValidationModalProps) {
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
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden"
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
                Conformidade Legal Eichrecht & OCMF · <span className="font-mono text-blue-600 dark:text-blue-400">TX #{transactionId}</span>
                <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  isFullyVerified
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                }`}>
                  {isFullyVerified ? 'Assinatura ECDSA Válida ✅' : 'Validação OCMF / S.A.F.E.'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                Norma S.A.F.E. e.V. · Open Charge Metering Format (OCMF V1.0 - V1.4.1) · Medidor LEM DCBM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={api.getOcmfDownloadUrl(transactionId)}
              target="_blank"
              rel="noreferrer"
              className="btn bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 shadow-sm"
              title="Descarregar ficheiro .ocmf para carregar no S.A.F.E. Transparency Software"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descarregar .ocmf</span>
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
            { id: 'summary', label: '📊 Resumo & Auditoria Legal' },
            { id: 'start', label: '🟢 Leitura Inicial (ST=G)' },
            { id: 'stop', label: '🔴 Leitura Final (ST=T)' },
            { id: 'raw', label: '📜 Payloads OCMF em Bruto' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:border-white/5'
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
              <span>A verificar assinaturas criptográficas ECDSA e dados do medidor…</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              Erro ao obter relatório OCMF da transação: {(error as any)?.message}
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
                        ? 'Medição Assinada e Criptograficamente Válida (Eichrecht MID Compliant)'
                        : 'Aguardando Associação de Chave Pública ou Verificação Manual'}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-300 mt-1">
                      {isFullyVerified
                        ? 'Todas as assinaturas ECDSA do medidor LEM foram validadas com sucesso através da curva secp256r1/NIST P-256 e hash SHA-256.'
                        : (report.ocmf_verification_error || 'Para validar esta transação, certifique-se que a chave pública do medidor LEM está configurada no posto.')}
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
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">Medidor Certificado</span>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    {report.meter_model || 'LEM DCBM'}
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400">
                    S/N: {report.meter_serial || 'Detectado no OCMF'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">Algoritmo Criptográfico</span>
                  <p className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-purple-500" />
                    ECDSA-SHA256
                  </p>
                  <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                    Curva: {report.curve_name}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                  <span className="text-slate-500 dark:text-gray-400 block text-[11px]">Chave Pública LEM</span>
                  <p className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                    {report.has_meter_key ? '✅ Configurada' : '⚠️ Não Registada'}
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400 truncate block">
                    {report.public_key_hex ? `${report.public_key_hex.slice(0, 16)}…` : 'Introduzir na Configuração'}
                  </span>
                </div>
              </div>

              {/* S.A.F.E. Transparency Software Guide */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-2">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold">
                  <ExternalLink className="w-4 h-4" />
                  <span>Como validar no S.A.F.E. Transparency Software (Transparenzsoftware):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-gray-300 text-[11px]">
                  <li>Clica no botão <strong>"Descarregar .ocmf"</strong> no topo deste modal.</li>
                  <li>Abre o <strong>S.A.F.E. Transparency Software</strong> oficial ou a ferramenta <strong>Chargy</strong>.</li>
                  <li>Importa o ficheiro descarregado e fornece a Chave Pública do Medidor LEM.</li>
                  <li>O software confirma a integridade jurídica e conformidade MID dos kWh faturados.</li>
                </ol>
              </div>
            </div>
          )}

          {report && activeTab === 'start' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Leitura de Início de Transação (ST=G / Start)
              </h4>
              {report.start_report ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">Estado: {report.start_report.status}</p>
                    <p className="text-slate-500 font-mono">Timestamp: {report.start_report.timestamp || 'N/A'}</p>
                    <p className="text-slate-500 font-mono">Versão OCMF: {report.start_report.ocmf_version}</p>
                  </div>

                  <table className="w-full text-xs font-mono">
                    <thead className="bg-slate-100 dark:bg-gray-950 text-left">
                      <tr>
                        <th className="p-2.5">Código OBIS</th>
                        <th className="p-2.5">Descrição</th>
                        <th className="p-2.5">Valor</th>
                        <th className="p-2.5">Unidade</th>
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
                <p className="text-xs text-slate-500 dark:text-gray-400 p-4">Nenhum payload OCMF de início registado nesta sessão.</p>
              )}
            </div>
          )}

          {report && activeTab === 'stop' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Leitura Final de Transação (ST=T / Stop)
              </h4>
              {report.stop_report ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">Estado: {report.stop_report.status}</p>
                    <p className="text-slate-500 font-mono">Timestamp: {report.stop_report.timestamp || 'N/A'}</p>
                    <p className="text-slate-500 font-mono">Versão OCMF: {report.stop_report.ocmf_version}</p>
                  </div>

                  <table className="w-full text-xs font-mono">
                    <thead className="bg-slate-100 dark:bg-gray-950 text-left">
                      <tr>
                        <th className="p-2.5">Código OBIS</th>
                        <th className="p-2.5">Descrição</th>
                        <th className="p-2.5">Valor</th>
                        <th className="p-2.5">Unidade</th>
                        <th className="p-2.5">Perda de Cabo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                      {report.stop_report.readings?.map((r: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2.5 text-blue-500 font-bold">{r.obis}</td>
                          <td className="p-2.5 text-slate-700 dark:text-gray-300 font-sans">{r.description}</td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.value}</td>
                          <td className="p-2.5 text-slate-500">{r.unit}</td>
                          <td className="p-2.5 text-amber-500">{r.cable_loss !== null && r.cable_loss !== undefined ? `${r.cable_loss} Wh` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-400 p-4">Nenhum payload OCMF final registado nesta sessão.</p>
              )}
            </div>
          )}

          {report && activeTab === 'raw' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Conteúdo OCMF em Bruto
                </h4>
                <button
                  type="button"
                  onClick={() => copyText(report.ocmf_stop_raw || report.ocmf_start_raw || '')}
                  className="btn-secondary text-xs py-1 px-2.5 rounded-lg flex items-center gap-1.5"
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
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
                    : 'Nenhum payload OCMF em bruto guardado.'}
                </code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 px-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950 text-xs text-slate-500 dark:text-gray-400">
          <span>Padrão S.A.F.E. e.V. · Compatível com OpenChargeMeteringFormatParser</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}