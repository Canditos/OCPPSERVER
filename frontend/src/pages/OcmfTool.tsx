import React, { useState } from 'react'
import {
  ShieldCheck, ShieldAlert, Shield, Play, RotateCcw,
  CheckCircle2, XCircle, FileText, Code, Activity,
  Cpu, Copy, Check, ExternalLink, HelpCircle, AlertTriangle
} from 'lucide-react'
import { api, OcmfVerificationResponse } from '../api'

const SAMPLE_LEM_PUBKEY = '04039b53aa82192578b6072ada612554a768cd0a48c0bb37b792c8938033b06e350527995ee44e71be19135402b363ae9aa347734331ae1d18abd57e5487a5368b'

const SAMPLE_OCMF_PAYLOAD = 'OCMF|{"FV":"1.4.0","GI":"LEM_DCBM_400_SN123456","ST":"T","IS":true,"t":"2026-08-27T11:00:00.000Z","RV":[{"t":"1-0:1.8.0","v":15849800,"u":"Wh","l":200},{"t":"1-0:1.4.0","v":27400,"u":"W"},{"t":"1-0:31.7.0","v":74.8,"u":"A"},{"t":"1-0:32.7.0","v":366.0,"u":"V"}]}|{"SA":"ECDSA-secp256r1-SHA256","SD":"MEQCIEgFeaxHCCns+dFYdnsY4K0bbOGOocWvkQCNREA4OtJjAiB3cr39IwrZ71p0zzmVXDXrWdIcOKCmkXldmUuYmCyd7w=="}'

export function OcmfTool() {
  const [ocmfData, setOcmfData] = useState<string>(SAMPLE_OCMF_PAYLOAD)
  const [publicKey, setPublicKey] = useState<string>(SAMPLE_LEM_PUBKEY)
  const [curveName, setCurveName] = useState<string>('secp256r1')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [result, setResult] = useState<OcmfVerificationResponse | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const handleVerify = async () => {
    if (!ocmfData.trim() || !publicKey.trim()) return
    setIsLoading(true)
    try {
      const res = await api.verifyManualOcmf({
        ocmf_data: ocmfData.trim(),
        public_key: publicKey.trim(),
        curve_name: curveName,
      })
      setResult(res)
    } catch (err: any) {
      setResult({
        verified: false,
        error: err?.response?.data?.detail || err?.message || 'Erro ao processar validação OCMF',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSample = () => {
    setOcmfData(SAMPLE_OCMF_PAYLOAD)
    setPublicKey(SAMPLE_LEM_PUBKEY)
    setCurveName('secp256r1')
    setResult(null)
  }

  const handleClear = () => {
    setOcmfData('')
    setPublicKey('')
    setResult(null)
  }

  return (
    <div className="space-y-6 animate-fade-up max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-500/15 text-blue-500 border border-blue-500/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Validador & Inspetor OCMF (Eichrecht / S.A.F.E.)
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono font-bold">
                  LEM DCBM Compliant
                </span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">
                Verificação criptográfica ECDSA, descodificação OBIS e conformidade com medidores certificados
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSample}
            className="btn-secondary text-xs py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Carregar Exemplo LEM DCBM</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="btn-ghost text-xs py-2 px-3.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Main Grid: Input Form vs Output Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-6 space-y-4">
          <div className="card p-5 space-y-4 border border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-500" />
              1. Payload OCMF Assinado
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                String OCMF (Formato S.A.F.E. standard `OCMF|&lt;DATA&gt;|&lt;SIG&gt;` ou JSON):
              </label>
              <textarea
                rows={7}
                value={ocmfData}
                onChange={(e) => setOcmfData(e.target.value)}
                placeholder="OCMF|{...}|{...}"
                className="w-full text-xs font-mono p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-cyan-300 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Chave Pública do Medidor LEM (Hex ou PEM):
                </label>
                <input
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="04..."
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Curva ECDSA:
                </label>
                <select
                  value={curveName}
                  onChange={(e) => setCurveName(e.target.value)}
                  className="input text-xs font-mono w-full"
                >
                  <option value="secp256r1">secp256r1 (NIST P-256)</option>
                  <option value="brainpoolP256r1">brainpoolP256r1</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={isLoading || !ocmfData.trim() || !publicKey.trim()}
              className="btn bg-blue-600 hover:bg-blue-500 text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>A processar verificação criptográfica…</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Validar Assinatura & Decodificar OCMF</span>
                </>
              )}
            </button>
          </div>

          {/* Reference Info Card */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2">
            <h4 className="font-bold text-gray-200 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              Sobre a Validação OCMF & Medidores LEM:
            </h4>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              O <strong>Open Charge Metering Format (OCMF)</strong> garante a integridade legal da medição em postos de carregamento público. A assinatura digital ECDSA protege a contagem de energia contra qualquer adulteração entre o medidor e o sistema de faturação.
            </p>
          </div>
        </div>

        {/* Right Column: Verification Results */}
        <div className="lg:col-span-6 space-y-4">
          {result ? (
            <div className="card p-5 space-y-4 border border-slate-200 dark:border-white/10 animate-fade-in">
              {/* Verdict Header */}
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                result.verified
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/15 border-red-500/30 text-red-400'
              }`}>
                {result.verified ? (
                  <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="w-8 h-8 shrink-0 text-red-400" />
                )}
                <div>
                  <h3 className="text-base font-bold">
                    {result.verified
                      ? 'Assinatura ECDSA Válida & Autêntica ✅'
                      : 'Falha na Verificação Criptográfica ❌'}
                  </h3>
                  <p className="text-xs mt-0.5 opacity-90">
                    {result.verified
                      ? 'A assinatura confere com o medidor LEM e os dados de medição não sofreram adulteração.'
                      : (result.error || 'A assinatura digital não confere com os dados ou com a chave pública fornecida.')}
                  </p>
                </div>
              </div>

              {/* Meter Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block">Versão OCMF</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">{result.ocmf_version || '1.0'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block">Identificador Medidor</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono truncate block">{result.meter_serial || '—'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block">Tipo de Registo</span>
                  <span className="font-bold text-blue-500 font-mono">{result.parsed?.status_label || result.status || '—'}</span>
                </div>
              </div>

              {/* Decoded OBIS Readings Table */}
              {result.readings && result.readings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Leituras Decodificadas (Códigos OBIS)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/60">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-slate-100 dark:bg-gray-950 text-left text-[11px] text-slate-500 uppercase">
                        <tr>
                          <th className="p-2.5">OBIS</th>
                          <th className="p-2.5">Descrição</th>
                          <th className="p-2.5">Valor</th>
                          <th className="p-2.5">Unidade</th>
                          <th className="p-2.5">Perda Cabo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                        {result.readings.map((r, idx) => (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
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
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center text-slate-400 dark:text-gray-500 text-xs border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3">
              <Shield className="w-12 h-12 opacity-30 text-blue-500" />
              <p className="font-semibold text-slate-600 dark:text-gray-300">Nenhum resultado de validação para apresentar</p>
              <p className="text-[11px] max-w-sm">
                Introduz uma string OCMF e a chave pública do medidor LEM (ou clica em "Carregar Exemplo") e prime "Validar Assinatura".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
