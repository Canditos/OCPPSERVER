import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Cpu, Zap, WifiOff, Shield, RotateCcw, Unlock, Sparkles,
  CheckCircle2, AlertTriangle
} from 'lucide-react'
import { api } from '../../api'
import { useI18n } from '../../i18n'
import type { Charger } from '../../types'

interface ChargerHeaderProps {
  charger: Charger
  isOnline: boolean
  isCharging: boolean
  selectedConnectorId: number
  onSelectTab: (tab: 'telemetry' | 'meters' | 'devicemodel' | 'security' | 'logs') => void
  onRefreshData?: () => void
}

export function ChargerHeader({
  charger,
  isOnline,
  isCharging,
  selectedConnectorId,
  onSelectTab,
  onRefreshData,
}: ChargerHeaderProps) {
  const { t } = useI18n()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleQuickReset = async (type: 'Soft' | 'Hard' = 'Soft') => {
    if (!charger.charge_point_id) return
    if (!confirm(t('chargerDetail.header.resetConfirm', { type, id: charger.charge_point_id }))) return
    setActionLoading('reset')
    try {
      const res = await api.reset(charger.charge_point_id, type)
      setActionToast({ type: 'success', message: t('chargerDetail.header.resetAccepted', { type, status: res.status || 'OK' }) })
      onRefreshData?.()
    } catch (err: any) {
      setActionToast({ type: 'error', message: err?.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionToast(null), 5000)
    }
  }

  const handleQuickUnlock = async () => {
    if (!charger.charge_point_id) return
    setActionLoading('unlock')
    try {
      const res = await api.unlockConnector(charger.charge_point_id, selectedConnectorId)
      setActionToast({ type: 'success', message: t('chargerDetail.header.unlockSuccess', { id: selectedConnectorId, status: res.status || 'OK' }) })
      onRefreshData?.()
    } catch (err: any) {
      setActionToast({ type: 'error', message: err?.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionToast(null), 5000)
    }
  }

  const handleQuickSelfHeal = async () => {
    if (!charger.charge_point_id) return
    setActionLoading('heal')
    try {
      const res = await api.selfHealCharger(charger.charge_point_id)
      setActionToast({ type: 'success', message: t('chargerDetail.header.selfHealSuccess', { actions: res.actions_taken?.join(' · ') || 'OK' }) })
      onRefreshData?.()
    } catch (err: any) {
      setActionToast({ type: 'error', message: err?.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionToast(null), 5000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <Link to="/" className="btn-ghost p-2 mt-0.5 shrink-0" title={t('chargerDetail.header.back')}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`relative p-2.5 rounded-xl ${
              isCharging ? 'bg-blue-500/20 animate-glow-blue'
              : isOnline ? 'bg-emerald-500/15'
              : 'bg-gray-800'
            }`}>
              <Zap
                className={`w-5 h-5 ${isCharging ? 'text-blue-400 animate-charge-bolt' : isOnline ? 'text-emerald-400' : 'text-gray-600'}`}
                fill={isCharging ? 'currentColor' : 'none'}
              />
            </div>

            <div>
              <h1 className="text-xl font-bold text-gray-100">{charger.charge_point_id}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{charger.vendor} · {charger.model}</p>
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* Security Profile Badge */}
              <button
                type="button"
                onClick={() => onSelectTab('security')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer hover:scale-105 transition-all ${
                  (charger.security_profile ?? 0) === 3
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                    : (charger.security_profile ?? 0) === 2
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                    : (charger.security_profile ?? 0) === 1
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                }`}
                title={t('chargerDetail.manageSecurityTooltip')}
              >
                <Shield className="w-3.5 h-3.5" />
                {(charger.security_profile ?? 0) === 3
                  ? 'Profile 3 (mTLS)'
                  : (charger.security_profile ?? 0) === 2
                  ? 'Profile 2 (TLS+Basic)'
                  : (charger.security_profile ?? 0) === 1
                  ? 'Profile 1 (Basic Auth)'
                  : t('chargerDetail.profile0Open')}
              </button>

              {/* OCPP Version Pill */}
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${
                charger.ocpp_version === '2.0.1'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                <Cpu className="w-3.5 h-3.5" />
                {charger.ocpp_version === '2.0.1' ? 'OCPP 2.0.1 (PnC)' : 'OCPP 1.6-J'}
              </span>

              {/* Online / Offline Status */}
              {isOnline ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-gray-500 text-xs font-medium border border-gray-700/40">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}

              {/* Quick Operation Buttons */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                <button
                  type="button"
                  onClick={() => handleQuickReset('Soft')}
                  disabled={actionLoading !== null || !isOnline}
                  className="px-2.5 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                  title="Reset (Soft)"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${actionLoading === 'reset' ? 'animate-spin' : ''}`} />
                  <span>{t('chargerDetail.header.softReset')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickUnlock}
                  disabled={actionLoading !== null || !isOnline}
                  className="px-2.5 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                  title={`Unlock #${selectedConnectorId}`}
                >
                  <Unlock className={`w-3.5 h-3.5 ${actionLoading === 'unlock' ? 'animate-spin' : ''}`} />
                  <span>{t('chargerDetail.header.unlock', { id: selectedConnectorId })}</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickSelfHeal}
                  disabled={actionLoading !== null}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                  title="Self-Heal"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${actionLoading === 'heal' ? 'animate-spin' : ''}`} />
                  <span>{t('chargerDetail.header.selfHeal')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Feedback Toast */}
      {actionToast && (
        <div className={`p-3 rounded-2xl text-xs flex items-center gap-2.5 animate-fade-in shadow-lg ${
          actionToast.type === 'success'
            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-emerald-500/10'
            : 'bg-red-500/15 text-red-300 border border-red-500/30 shadow-red-500/10'
        }`}>
          {actionToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span className="font-semibold">{actionToast.message}</span>
        </div>
      )}
    </div>
  )
}
