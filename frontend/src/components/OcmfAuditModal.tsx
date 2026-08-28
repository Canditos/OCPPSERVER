import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Download, Cpu, Key, FileCode, CheckCircle2, XCircle, Clock
} from 'lucide-react'
import { api } from '../api'
import type { OcmfAuditReport } from '../types'

interface OcmfAuditModalProps {
  transactionId: number
  onClose: () => void
}

export function OcmfAuditModal({ transactionId, onClose }: OcmfAuditModalProps) {
  const { data: audit, isLoading, error } = useQuery<OcmfAuditReport>({
    queryKey: ['ocmf-audit', transactionId],
    queryFn: () => api.getTransactionOcmf(transactionId),
  })

  const [activeTab, setActiveTab] = useState<'summary' | 'raw'>('summary')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${audit?.ocmf_verified ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Auditoria Fiscal & Metrológica (Eichrecht / OCMF)
              </h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Transação #{transactionId} · Medidor Legal LEM DCBM
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
              <p className="text-sm">A carregar registos criptográficos do medidor…</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              Não foi possível carregar a auditoria OCMF desta transação.
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
                      {audit.ocmf_verified ? 'Assinatura Digital Válida & Autêntica' : 'Verificação OCMF Pendente'}
                    </h4>
                    <p className="text-xs opacity-80 mt-0.5">
                      {audit.ocmf_verified
                        ? 'Os dados de energia e tempo foram validados pela chave pública do medidor e não foram adulterados.'
                        : (audit.ocmf_verification_error || 'A aguardar sincronização da chave pública do medidor.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Meter Info Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Medidor DC</span>
                  <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-500" />
                    {audit.meter_model || 'LEM DCBM 400'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Nº Série Medidor</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {audit.meter_serial || '—'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Criptografia</span>
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
                  Leituras Assinadas (OBIS)
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'raw'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Payload OCMF Bruto
                </button>
              </div>

              {activeTab === 'summary' && audit.stop_report?.readings && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-700 dark:text-gray-300">
                    Leituras Registadas no Medidor LEM:
                  </h5>
                  <div className="space-y-1.5">
                    {audit.stop_report.readings.map((r: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <span className="text-blue-600 dark:text-blue-400 font-bold block">{r.obis}</span>
                          <span className="text-[10px] text-slate-500 font-sans">{r.description}</span>
                        </div>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {r.value} {r.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'raw' && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-60 whitespace-pre-wrap break-all leading-relaxed">
                    {audit.ocmf_stop_raw || audit.ocmf_start_raw || 'Sem dados brutos disponíveis.'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <span className="text-[11px] text-slate-400">
            Compatível com S.A.F.E. Transparency Software
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => api.downloadTransactionOcmf(transactionId)}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Descarregar .ocmf
            </button>
            <button onClick={onClose} className="btn btn-primary text-xs">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
