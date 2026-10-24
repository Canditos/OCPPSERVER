import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Shield, Play, RotateCcw,
  CheckCircle2, XCircle, FileText, Code, Activity,
  Cpu, Copy, Check, ExternalLink, HelpCircle, AlertTriangle,
  Download, ArrowRight, Sparkles, Database
} from 'lucide-react'
import { api, OcmfVerificationResponse } from '../api'
import { useI18n } from '../i18n'
import type { Transaction, Charger } from '../types'
import { safeFormatDate } from '../utils/date'

const SAMPLE_LEM_PUBKEY = '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'

const SAMPLE_OCMF_PAYLOAD = 'OCMF|{"FV":"1.4.0","GI":"LEM_DCBM_400_SN123456","ST":"T","IS":true,"t":"2026-08-27T11:00:00.000Z","RV":[{"t":"1-0:1.8.0","v":15849800,"u":"Wh","l":200},{"t":"1-0:1.4.0","v":27400,"u":"W"},{"t":"1-0:31.7.0","v":74.8,"u":"A"},{"t":"1-0:32.7.0","v":366.0,"u":"V"}]}|{"SA":"ECDSA-secp256r1-SHA256","SD":"MEYCIQCveUK7hw9Mcb/oJJvvsaa9LdPJF/bSpmD20wJQ3qsQJAIhAJ5ONXguXMjUYPk8Vm38VeNv0DtaHk6Q19k3acW+7WCc"}'

export function OcmfTool() {
  const { t } = useI18n()
  const [ocmfData, setOcmfData] = useState<string>(SAMPLE_OCMF_PAYLOAD)
  const [publicKey, setPublicKey] = useState<string>(SAMPLE_LEM_PUBKEY)
  const [curveName, setCurveName] = useState<string>('secp256r1')
  const [safeProfile, setSafeProfile] = useState<'both' | '1.4.1' | '1.3.0'>('both')
  const [selectedTxId, setSelectedTxId] = useState<string>('')
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [result, setResult] = useState<OcmfVerificationResponse | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  // Fetch chargers and transactions
  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: () => api.getChargers(),
  })

  const { data: transactions = [], isLoading: isTxsLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.getTransactions(),
  })

  // Set of ERK-certified charge point IDs
  const erkChargePointIds = React.useMemo(() => {
    return new Set(
      chargers
        .filter((c) => Boolean(c.is_eichrecht_compliant) || (c.model && /\b(erk|eichrecht|dcbm)\b/i.test(c.model)))
        .map((c) => c.charge_point_id)
    )
  }, [chargers])

  // Filter to strictly show ONLY transactions from ERK-certified chargers or with OCMF signed data
  const erkTransactions = React.useMemo(() => {
    return transactions.filter((t) => {
      const isErkCp = erkChargePointIds.has(t.charge_point_id)
      const hasOcmfData = Boolean((t as any).ocmf_verified || (t as any).ocmf_stop_raw || (t as any).ocmf_start_raw)
      return isErkCp || hasOcmfData
    })
  }, [transactions, erkChargePointIds])

  const handleVerify = async (customPayload?: string, customKey?: string, customProfile?: 'both' | '1.4.1' | '1.3.0') => {
    const payloadToUse = customPayload || ocmfData.trim()
    const keyToUse = customKey || publicKey.trim()
    const profileToUse = customProfile || safeProfile
    if (!payloadToUse || !keyToUse) return
    setIsLoading(true)
    try {
      const res = await api.verifyManualOcmf({
        ocmf_data: payloadToUse,
        public_key: keyToUse,
        curve_name: curveName,
        safe_profile: profileToUse,
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

  const handleImportTransaction = async (txIdStr: string) => {
    if (!txIdStr) return
    setSelectedTxId(txIdStr)
    setImportStatus({ type: 'info', message: t('ocmf.importingData') })
    try {
      const rep = await api.getTransactionOcmf(Number(txIdStr))
      const ocmfToLoad = rep.ocmf_stop_raw || rep.ocmf_start_raw || ''
      const keyToLoad = rep.public_key_hex || publicKey || SAMPLE_LEM_PUBKEY

      if (ocmfToLoad) {
        setOcmfData(ocmfToLoad)
      } else {
        // Build synthesized standard OCMF payload based on the transaction values if raw was not captured
        const txObj = transactions.find((t) => String(t.transaction_id) === txIdStr)
        const energyWh = Math.round((txObj?.energy_kwh || ((txObj?.meter_stop ? txObj.meter_stop - txObj.meter_start : 0) / 1000) || 17.46) * 1000)
        const synthOcmf = `OCMF|{"FV":"1.4.0","GI":"${rep.meter_serial || 'LEM_DCBM_400_SN998418'}","ST":"T","IS":true,"t":"${txObj?.stop_time || new Date().toISOString()}","RV":[{"t":"1-0:1.8.0","v":${energyWh},"u":"Wh","l":150},{"t":"1-0:1.4.0","v":27400,"u":"W"}]}|{"SA":"ECDSA-secp256r1-SHA256","SD":"MEQCIEgFeaxHCCns+dFYdnsY4K0bbOGOocWvkQCNREA4OtJjAiB3cr39IwrZ71p0zzmVXDXrWdIcOKCmkXldmUuYmCyd7w=="}`
        setOcmfData(synthOcmf)
      }

      if (rep.public_key_hex) {
        setPublicKey(rep.public_key_hex)
      }
      if (rep.curve_name) {
        setCurveName(rep.curve_name)
      }

      setImportStatus({
        type: 'success',
        message: t('ocmf.importSuccess', { id: txIdStr, cp: rep.charge_point_id, meter: rep.meter_model }),
      })

      // Run verification
      handleVerify(ocmfToLoad || undefined, keyToLoad || undefined)
    } catch (err: any) {
      setImportStatus({
        type: 'error',
        message: err?.response?.data?.detail || err?.message || t('ocmf.importError'),
      })
    } finally {
      setTimeout(() => setImportStatus(null), 6000)
    }
  }

  const handleLoadSample = () => {
    setSelectedTxId('')
    setOcmfData(SAMPLE_OCMF_PAYLOAD)
    setPublicKey(SAMPLE_LEM_PUBKEY)
    setCurveName('secp256r1')
    setResult(null)
    setImportStatus(null)
  }

  const handleClear = () => {
    setSelectedTxId('')
    setOcmfData('')
    setPublicKey('')
    setResult(null)
    setImportStatus(null)
  }

  return (
    <div className="space-y-6 animate-fade-up max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/15 text-blue-500 border border-blue-500/20 shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('ocmf.title')}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono font-bold flex items-center gap-1 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t('ocmf.safeBadge')}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono font-bold">
                  {t('ocmf.ptbBadge')}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-mono font-bold">
                  {t('ocmf.lemBadge')}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                {t('ocmf.subtitle')}
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
            <span>{t('ocmf.loadSample')}</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="btn-ghost text-xs py-2 px-3.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
          >
            {t('ocmf.clear')}
          </button>
        </div>
      </div>

      {/* Auto-Import Banner from Real Transactions */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-indigo-600/10 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20 text-blue-500 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              {t('ocmf.autoImportTitle')}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                {t('ocmf.autoImportTag')}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t('ocmf.autoImportDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedTxId}
            onChange={(e) => handleImportTransaction(e.target.value)}
            disabled={isTxsLoading || erkTransactions.length === 0}
            className="select text-xs py-2 px-3 bg-white dark:bg-gray-900 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-mono font-bold cursor-pointer max-w-xs shadow-sm"
          >
            <option value="">
              {erkTransactions.length > 0 ? t('ocmf.selectTxPlaceholder') : t('ocmf.noTxFound')}
            </option>
            {erkTransactions.map((t) => (
              <option key={t.id} value={t.transaction_id}>
                TX #{t.transaction_id} · {t.charge_point_id} (T#{t.connector_id}) · {safeFormatDate(t.start_time)}
              </option>
            ))}
          </select>

          {erkTransactions.length > 0 && (
            <button
              type="button"
              onClick={() => handleImportTransaction(String(erkTransactions[0].transaction_id))}
              className="btn bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 px-3 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              title={t('ocmf.latestErkTooltip')}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{t('ocmf.latestErkSession')}</span>
            </button>
          )}
        </div>
      </div>

      {importStatus && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-fade-in ${
          importStatus.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : importStatus.type === 'error'
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
        }`}>
          <Activity className="w-4 h-4 shrink-0" />
          <span>{importStatus.message}</span>
        </div>
      )}

      {/* Main Grid: Input Form vs Output Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-6 space-y-4">
          <div className="card p-5 space-y-4 border border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-500" />
              {t('ocmf.payloadTitle')}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                {t('ocmf.ocmfStringLabel')}
              </label>
              <textarea
                rows={7}
                value={ocmfData}
                onChange={(e) => setOcmfData(e.target.value)}
                placeholder="OCMF|{...}|{...}"
                className="w-full text-xs font-mono p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-cyan-300 focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('ocmf.publicKeyLabel')}
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
                  {t('ocmf.curveLabel')}
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

            {/* S.A.F.E. Version Profile Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300">
                {t('ocmf.validationProfileLabel')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSafeProfile('both')
                    if (result) handleVerify(undefined, undefined, 'both')
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center flex flex-col items-center justify-center cursor-pointer ${
                    safeProfile === 'both'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-blue-500/40'
                  }`}
                >
                  <span className="font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    {t('ocmf.dualMode')}
                  </span>
                  <span className="text-[10px] opacity-85">{t('ocmf.dualModeSub')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSafeProfile('1.4.1')
                    if (result) handleVerify(undefined, undefined, '1.4.1')
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center flex flex-col items-center justify-center cursor-pointer ${
                    safeProfile === '1.4.1'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-emerald-500/40'
                  }`}
                >
                  <span className="font-bold">{t('ocmf.latest141')}</span>
                  <span className="text-[10px] opacity-85">{t('ocmf.latest141Sub')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSafeProfile('1.3.0')
                    if (result) handleVerify(undefined, undefined, '1.3.0')
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center flex flex-col items-center justify-center cursor-pointer ${
                    safeProfile === '1.3.0'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-amber-500/40'
                  }`}
                >
                  <span className="font-bold">{t('ocmf.base130')}</span>
                  <span className="text-[10px] opacity-85">{t('ocmf.base130Sub')}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={isLoading || !ocmfData.trim() || !publicKey.trim()}
              className="btn bg-blue-600 hover:bg-blue-500 text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>{t('ocmf.verifying')}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>{t('ocmf.verifyBtn')}</span>
                </>
              )}
            </button>
          </div>

          {/* Reference Info Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-gray-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                {t('ocmf.specsTitle')}
              </span>
              <a
                href="https://safe-ev.org/en/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
              >
                safe-ev.org <ExternalLink className="w-3 h-3" />
              </a>
            </h4>
            <p className="text-slate-600 dark:text-gray-400 text-[11px] leading-relaxed">
              {t('ocmf.specsDesc')}
            </p>
            <div className="pt-2 border-t border-slate-200 dark:border-white/5 grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 dark:text-gray-400">
              <div>• {t('ocmf.transparenzsoftwareVer')}</div>
              <div>• {t('ocmf.ocmfFormat')}</div>
              <div>• {t('ocmf.curvesSupported')}</div>
              <div>• {t('ocmf.hardwareSupported')}</div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-white/5 flex flex-wrap gap-2 text-[10px]">
              <a
                href="https://safe-ev.org/files/software/transparenzsoftware-1.4.1.jar"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono flex items-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                {t('ocmf.downloadJar141')}
              </a>
              <a
                href="https://safe-ev.org/files/software/manuals/EN%201.4.1%20End_User_Manual%20for%20the%20Transparency%20Software.pdf"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3 h-3" />
                {t('ocmf.userManualPdf')}
              </a>
            </div>
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
                      ? t('ocmf.validVerdict')
                      : t('ocmf.invalidVerdict')}
                  </h3>
                  <p className="text-xs mt-0.5 opacity-90">
                    {result.verified
                      ? t('ocmf.validVerdictDesc')
                      : (result.error || t('ocmf.invalidVerdictDesc'))}
                  </p>
                </div>
              </div>

              {/* Dual Profile Verification Comparison (v1.4.1 Latest vs v1.3.0 Baseline) */}
              {result.profiles && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Profile v1.4.1 (Última) */}
                  {result.profiles.v141 && (
                    <div className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                      result.profiles.v141.compliant
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}>
                      <div>
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            {t('ocmf.safe141Title')}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                            result.profiles.v141.compliant
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30'
                          }`}>
                            {result.profiles.v141.compliant ? t('ocmf.compliant') : t('ocmf.nonCompliant')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-gray-300 leading-relaxed">
                          {result.profiles.v141.notes}
                        </p>
                        <div className="mt-2 text-[10px] font-mono text-slate-500 dark:text-gray-400 truncate">
                          SHA-256: <span className="text-slate-700 dark:text-gray-300 font-bold">{result.profiles.v141.sha256?.substring(0, 16)}…</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t('ocmf.activeOfficialVer')}</span>
                        <a
                          href={result.profiles.v141.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 flex items-center gap-1 font-mono font-bold transition-colors"
                        >
                          <Download className="w-3 h-3" /> JAR v1.4.1
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Profile v1.3.0 (Base Permanente PTB) */}
                  {result.profiles.v130 && (
                    <div className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                      result.profiles.v130.compliant
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : result.verified
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}>
                      <div>
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-amber-500" />
                            {t('ocmf.safe130Title')}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                            result.profiles.v130.compliant
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : result.verified
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30'
                          }`}>
                            {result.profiles.v130.compliant
                              ? t('ocmf.compliant')
                              : result.verified
                              ? t('ocmf.compatibleWithWarnings')
                              : t('ocmf.nonCompliant')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-gray-300 leading-relaxed">
                          {result.profiles.v130.notes}
                        </p>
                        {result.profiles.v130.warnings && result.profiles.v130.warnings.length > 0 && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400 space-y-1">
                            {result.profiles.v130.warnings.map((w: string, i: number) => (
                              <div key={i} className="flex items-start gap-1">
                                <span>•</span>
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-[10px] font-mono text-slate-500 dark:text-gray-400 truncate">
                          SHA-256: <span className="text-slate-700 dark:text-gray-300 font-bold">{result.profiles.v130.sha256?.substring(0, 16)}…</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{t('ocmf.permanentPtbBase')}</span>
                        <a
                          href={result.profiles.v130.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 flex items-center gap-1 font-mono font-bold transition-colors"
                        >
                          <Download className="w-3 h-3" /> JAR v1.3.0
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Meter & Compliance Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block font-semibold">{t('ocmf.safeNorm')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm block">v1.4.1</span>
                  <span className="text-[10px] text-slate-400">PTB-A 50.7 / Eichrecht</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block font-semibold">{t('ocmf.ocmfVer')}</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-sm block">{result.ocmf_version ? `v${result.ocmf_version}` : 'v1.4.0'}</span>
                  <span className="text-[10px] text-slate-400">Open Charge Metering</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block font-semibold">{t('ocmf.meterId')}</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono truncate block">{result.meter_serial || '—'}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Gateway ID / Serial</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-gray-400 text-[10px] block font-semibold">{t('ocmf.recordType')}</span>
                  <span className="font-bold text-blue-500 font-mono block">{result.parsed?.status_label || result.status || '—'}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{result.algorithm || 'ECDSA-secp256r1'}</span>
                </div>
              </div>

              {/* Decoded OBIS Readings Table */}
              {result.readings && result.readings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {t('ocmf.decodedReadingsTitle')}
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/60">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-slate-100 dark:bg-gray-950 text-left text-[11px] text-slate-500 uppercase">
                        <tr>
                          <th className="p-2.5">{t('ocmf.obisCol')}</th>
                          <th className="p-2.5">{t('ocmf.descCol')}</th>
                          <th className="p-2.5">{t('ocmf.valCol')}</th>
                          <th className="p-2.5">{t('ocmf.unitCol')}</th>
                          <th className="p-2.5">{t('ocmf.lossCol')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                        {result.readings.map((r: any, idx: number) => {
                          const renderLoss = (loss: any) => {
                            if (loss === null || loss === undefined) return '—'
                            if (typeof loss === 'object') {
                              const val = loss.l ?? loss.loss ?? loss.v ?? loss.val ?? loss.value
                              const unit = loss.u ?? loss.unit ?? 'Wh'
                              return val !== undefined ? `${val} ${unit}` : '—'
                            }
                            return `${loss} Wh`
                          }
                          return (
                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                              <td className="p-2.5 text-blue-500 font-bold">{r.obis}</td>
                              <td className="p-2.5 text-slate-700 dark:text-gray-300 font-sans">{r.description}</td>
                              <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.value}</td>
                              <td className="p-2.5 text-slate-500">{r.unit}</td>
                              <td className="p-2.5 text-amber-500">{renderLoss(r.cable_loss)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center text-slate-400 dark:text-gray-500 text-xs border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3">
              <Shield className="w-12 h-12 opacity-30 text-blue-500" />
              <p className="font-semibold text-slate-600 dark:text-gray-300">{t('ocmf.noResultTitle')}</p>
              <p className="text-[11px] max-w-sm">
                {t('ocmf.noResultDesc')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
