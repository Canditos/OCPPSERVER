import React, { useState, useEffect } from 'react'
import {
  Cpu, Shield, ShieldCheck, Wifi, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, ChevronRight, Sparkles, Eye, EyeOff, Copy,
  Check, Lock, Send, Activity
} from 'lucide-react'
import { api } from '../../api'
import { ConnectorBadge } from '../ConnectorBadge'
import { safeFormatDate, safeFormatDistance } from '../../utils/date'
import type { Charger } from '../../types'
import { useI18n } from '../../i18n'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
      <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">{label}</span>
      <span className="text-xs text-slate-700 dark:text-gray-300 font-mono text-right max-w-[60%] break-all">{value}</span>
    </div>
  )
}

interface ConnectorItem {
  connector_id: number
  status: string
  error_code?: string | null
  updated_at?: string | null
}

interface ChargerInfoSidebarProps {
  charger: Charger
  isOnline: boolean
  connectors: ConnectorItem[]
  selectedConnectorId: number
  onSelectConnector: (id: number) => void
  successRates: Record<string, { success_rate: number; completed_transactions: number; total_transactions: number }>
  displayedLiveMeters: Array<{ key: string; label: string; value: any; unit: string; timestamp?: string }>
  meterKeysCount: number
  onOpenMetersTab: () => void
  onRefreshCharger?: () => void
}

export function ChargerInfoSidebar({
  charger,
  isOnline,
  connectors,
  selectedConnectorId,
  onSelectConnector,
  successRates,
  displayedLiveMeters,
  meterKeysCount,
  onOpenMetersTab,
  onRefreshCharger,
}: ChargerInfoSidebarProps) {
  const { t } = useI18n()
  // Security Management State
  const [showSecurityCard, setShowSecurityCard] = useState<boolean>(false)
  const [secProfile, setSecProfile] = useState<number>(0)
  const [authKey, setAuthKey] = useState<string>('')
  const [authEnabled, setAuthEnabled] = useState<boolean>(false)
  const [showKey, setShowKey] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<boolean>(false)
  const [secFeedback, setSecFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [savingSec, setSavingSec] = useState<boolean>(false)
  const [showHttpHeader, setShowHttpHeader] = useState<boolean>(false)

  useEffect(() => {
    if (charger) {
      setSecProfile(charger.security_profile ?? 0)
      setAuthKey(charger.auth_password || '')
      setAuthEnabled(charger.auth_enabled ?? false)
    }
  }, [charger])

  const handleSaveSecurity = async () => {
    setSavingSec(true)
    setSecFeedback(null)
    try {
      await api.updateChargerSecurity(charger.charge_point_id, {
        security_profile: secProfile,
        auth_password: authKey,
        auth_enabled: authEnabled || secProfile >= 1,
      })
      setSecFeedback({ type: 'success', message: t('chargerDetail.sidebar.secSaved') })
      onRefreshCharger?.()
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: t('chargerDetail.sidebar.secSaveError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 4000)
    }
  }

  const handleGenerateKey = async () => {
    setSavingSec(true)
    try {
      const res = await api.generateChargerKey(charger.charge_point_id)
      setAuthKey(res.authorization_key)
      setSecFeedback({ type: 'success', message: t('chargerDetail.sidebar.keyGenerated') })
      onRefreshCharger?.()
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: t('chargerDetail.sidebar.keyGenError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 4000)
    }
  }

  const handleSyncKey = async () => {
    setSavingSec(true)
    try {
      const res = await api.syncChargerKey(charger.charge_point_id)
      setSecFeedback({ type: 'success', message: t('chargerDetail.sidebar.keySynced', { status: res.status }) })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: t('chargerDetail.sidebar.keySyncError', { error: err?.response?.data?.detail || err.message }) })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 5000)
    }
  }

  const handleCopyKey = () => {
    if (!authKey) return
    navigator.clipboard.writeText(authKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Device info card */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-slate-400 dark:text-gray-500" />
          <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('chargerDetail.sidebar.device')}</h3>
        </div>
        <InfoRow label={t('chargerDetail.sidebar.chargePointId')} value={charger.charge_point_id} />
        <InfoRow label={t('chargerDetail.sidebar.vendor')} value={charger.vendor} />
        <InfoRow label={t('chargerDetail.sidebar.model')} value={charger.model} />
        <InfoRow label={t('chargerDetail.sidebar.firmware')} value={charger.firmware_version} />
        <InfoRow label={t('chargerDetail.sidebar.serialNumber')} value={charger.serial_number} />
        <InfoRow label={t('chargerDetail.sidebar.iccid')} value={charger.iccid} />
        <InfoRow label={t('chargerDetail.sidebar.imsi')} value={charger.imsi} />
        <InfoRow label={t('chargerDetail.sidebar.ip')} value={charger.client_ip} />
        <InfoRow label={t('chargerDetail.sidebar.timezone')} value={charger.timezone || 'Europe/Lisbon'} />
        <InfoRow label={t('chargerDetail.sidebar.registered')} value={safeFormatDate(charger.registered_at)} />
        <InfoRow label={t('chargerDetail.sidebar.lastSeen')} value={safeFormatDistance(charger.last_seen)} />
      </div>

      {/* Security Management Card (Collapsible) */}
      <div className="card space-y-3">
        <div
          onClick={() => setShowSecurityCard(!showSecurityCard)}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider">
              {t('chargerDetail.sidebar.securityTitle')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
              secProfile === 3 ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
              : secProfile === 2 ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
              : secProfile === 1 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}>
              {secProfile === 3 ? 'Profile 3 (mTLS)' : secProfile === 2 ? 'Profile 2 (TLS)' : secProfile === 1 ? 'Profile 1 (Basic)' : 'Profile 0 (Open)'}
            </span>
            <button type="button" className="p-1 rounded-lg bg-white/5 text-gray-400 group-hover:text-white">
              {showSecurityCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showSecurityCard && (
          <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-white/10 animate-fade-in">
            {secFeedback && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                secFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}>
                {secFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                <span>{secFeedback.message}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">{t('chargerDetail.sidebar.secProfileLabel')}</label>
              <select
                value={secProfile}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setSecProfile(val)
                  if (val >= 1) setAuthEnabled(true)
                }}
                className="select w-full text-xs py-2 bg-white dark:bg-gray-900/90 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white"
              >
                <option value={0}>{t('chargerDetail.sidebar.profile0')}</option>
                <option value={1}>{t('chargerDetail.sidebar.profile1')}</option>
                <option value={2}>{t('chargerDetail.sidebar.profile2')}</option>
                <option value={3}>{t('chargerDetail.sidebar.profile3')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 font-medium">{t('chargerDetail.sidebar.authKeyLabel')}</label>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={savingSec}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> {t('chargerDetail.sidebar.genKeyBtn')}
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  placeholder={t('chargerDetail.sidebar.passwordPlaceholder')}
                  className="input pr-20 text-xs font-mono bg-white dark:bg-gray-900/90 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white w-full"
                />
                <div className="absolute right-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                    title={showKey ? t('chargerDetail.sidebar.hide') : t('chargerDetail.sidebar.show')}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    disabled={!authKey}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                    title={t('chargerDetail.sidebar.copyKey')}
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveSecurity}
                disabled={savingSec}
                className="btn-primary flex-1 text-xs py-2 rounded-lg flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{savingSec ? t('chargerDetail.sidebar.saving') : t('chargerDetail.sidebar.saveSecBtn')}</span>
              </button>

              <button
                type="button"
                onClick={handleSyncKey}
                disabled={savingSec || !isOnline || !authKey}
                className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                title={isOnline ? t('chargerDetail.sidebar.syncKeyBtn') : t('common.offline')}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('chargerDetail.sidebar.syncKeyBtn')}</span>
              </button>
            </div>

            {authKey && secProfile >= 1 && (
              <div className="rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowHttpHeader(!showHttpHeader)}
                  className="w-full p-2.5 flex items-center justify-between text-gray-400 hover:text-gray-200 transition-colors text-[11px] font-medium cursor-pointer"
                >
                  <span>{t('chargerDetail.sidebar.httpBasicHeader')}</span>
                  <span className="flex items-center gap-1 text-[10px] text-blue-400">
                    {showHttpHeader ? t('chargerDetail.sidebar.hide') : t('chargerDetail.sidebar.viewHeader')}
                    {showHttpHeader ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </span>
                </button>
                {showHttpHeader && (
                  <div className="p-2.5 pt-0 border-t border-slate-200 dark:border-white/5 space-y-1">
                    <p className="text-[10px] font-mono text-gray-300 break-all bg-gray-900/90 p-2 rounded border border-white/5 select-all">
                      Authorization: Basic {btoa(`${charger.charge_point_id}:${authKey}`)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Eichrecht / OCMF Quick Card */}
      <div
        onClick={onOpenMetersTab}
        className="card p-3.5 border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent hover:border-purple-500/40 transition-all cursor-pointer group shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                {t('chargerDetail.sidebar.eichrechtTitle')}
                {charger.is_eichrecht_compliant && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded font-bold border border-emerald-500/30">
                    {t('chargerDetail.sidebar.erkActive')}
                  </span>
                )}
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-gray-400">
                {t('chargerDetail.sidebar.calibratedMetersCount', { count: meterKeysCount })}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            {t('chargerDetail.sidebar.manage')} <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {/* Connectors selector */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="w-4 h-4 text-slate-400 dark:text-gray-500" />
          <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('chargerDetail.sidebar.connectors')}</h3>
        </div>
        {connectors.length === 0 ? (
          <p className="text-xs text-gray-500">{t('chargerDetail.sidebar.noConnectors')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <button
                key={c.connector_id}
                type="button"
                onClick={() => onSelectConnector(c.connector_id)}
                className={`cursor-pointer transition-all relative group ${
                  selectedConnectorId === c.connector_id
                    ? 'ring-2 ring-blue-400 shadow-md shadow-blue-500/30 scale-105'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <ConnectorBadge
                  connectorId={c.connector_id}
                  status={c.status}
                  errorCode={c.error_code ?? undefined}
                />
                {successRates[String(c.connector_id)] && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-gray-900/95 text-gray-200 px-2 py-1 rounded whitespace-nowrap border border-gray-700/50 pointer-events-none z-10">
                    {successRates[String(c.connector_id)].success_rate.toFixed(1)}% {t('common.success') || 'sucesso'}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Charging Success Rate Cards */}
      {Object.keys(successRates).length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
              {t('chargerDetail.sidebar.successRateTitle')}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(successRates).map(([connectorId, data]) => (
              <div
                key={connectorId}
                className="p-2.5 rounded-lg bg-slate-100 dark:bg-gray-800/40 border border-slate-200 dark:border-gray-700/50 hover:border-gray-600/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-gray-400">{t('chargerDetail.sidebar.socket', { id: connectorId })}</span>
                  <span className={`text-sm font-bold ${
                    data.success_rate >= 90 ? 'text-emerald-500 dark:text-emerald-400'
                    : data.success_rate >= 70 ? 'text-amber-500 dark:text-amber-400'
                    : 'text-red-500 dark:text-red-400'
                  }`}>
                    {data.success_rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                  {data.completed_transactions}/{data.total_transactions}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Readings */}
      {displayedLiveMeters.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('chargerDetail.sidebar.liveReadings')}</h3>
            <span className="live-pill ml-auto">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <div className="space-y-2">
            {displayedLiveMeters.map((m) => (
              <div key={m.key} className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0">
                <span className="text-xs text-slate-600 dark:text-gray-400 font-medium truncate max-w-[55%]">{m.label}</span>
                <span className="text-xs font-mono text-amber-500 dark:text-amber-300 font-bold">{m.value} {m.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
