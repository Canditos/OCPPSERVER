import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, Square, Loader2, Play, CheckCircle2, AlertCircle,
  Clock, BatteryCharging, Activity
} from 'lucide-react'
import { api, type MyActiveCharge } from '../../api'
import { useAuthStore } from '../../store/authStore'
import { BatteryIndicator } from '../../components/BatteryIndicator'
import { RemoteStartModal } from '../../components/RemoteStartModal'
import { QrScanModal } from '../../components/driver/QrScanModal'
import { safeFormatDateTime } from '../../utils/date'
import { useI18n } from '../../i18n'
import { useTheme } from '../../hooks/useTheme'

export function ActiveChargeTab() {
  const { user } = useAuthStore()
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'
  const { t } = useI18n()

  const [showStartModal, setShowStartModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrPrefill, setQrPrefill] = useState<{ cpId: string; connectorId: number } | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const [stopFeedback, setStopFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: api.getMe, refetchInterval: 10000 })
  const { data: activeCharge, refetch } = useQuery<MyActiveCharge | null>({
    queryKey: ['my-active-charge'],
    queryFn: api.getMyActiveCharge,
    refetchInterval: 3000,
  })

  const rfidTag = profile?.rfid_tag || user?.rfid_tag || (user?.username ? `TAG_${user.username.toUpperCase()}` : '—')

  const handleStop = async () => {
    if (!activeCharge) return
    setIsStopping(true)
    setStopFeedback(null)
    try {
      const resp = await api.remoteStop(activeCharge.charge_point_id, activeCharge.transaction_id)
      setStopFeedback({ type: 'success', message: resp?.message || t('userPortal.stopSuccess') })
      setTimeout(() => { refetch(); setIsStopping(false); setStopFeedback(null) }, 1500)
    } catch (err: any) {
      setStopFeedback({ type: 'error', message: err?.response?.data?.detail || t('userPortal.stopError') })
      setIsStopping(false)
      setTimeout(() => setStopFeedback(null), 4000)
    }
  }

  const handleQrResult = (cpId: string, connectorId: number) => {
    setShowQrModal(false)
    setQrPrefill({ cpId, connectorId })
    setShowStartModal(true)
  }

  // --- ACTIVE CHARGE VIEW ---
  if (activeCharge) {
    const elapsed = activeCharge.start_time
      ? Math.floor((Date.now() - new Date(activeCharge.start_time).getTime()) / 1000)
      : 0
    const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0')
    const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
    const ss = String(elapsed % 60).padStart(2, '0')

    return (
      <div className="space-y-5 animate-fade-up">
        {/* Hero status card */}
        <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-950/60 via-slate-900/60 to-blue-950/60 border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                <Zap className="w-7 h-7 animate-pulse" />
                <span className="animate-ping absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  {t('userPortal.activeCharging')}
                </span>
                <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {activeCharge.charge_point_id} · #{activeCharge.connector_id}
                </span>
              </div>
            </div>
            <div className={`font-mono text-2xl font-bold tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {hh}:{mm}:{ss}
            </div>
          </div>

          {/* Battery indicator */}
          <div className={`p-3.5 rounded-2xl mb-4 ${isDark ? 'bg-black/30' : 'bg-white/70'} border border-emerald-500/20`}>
            <BatteryIndicator
              soc={activeCharge.current_soc ?? null}
              isCharging={true}
              powerKw={activeCharge.current_power_kw || null}
            />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: t('userPortal.livePower'), value: `${activeCharge.current_power_kw} kW`, color: 'text-emerald-400' },
              { label: t('userPortal.deliveredEnergy'), value: `${activeCharge.consumed_kwh} kWh`, color: 'text-blue-400' },
              { label: 'Transação', value: `#${activeCharge.transaction_id}`, color: isDark ? 'text-gray-300' : 'text-slate-700' },
            ].map(stat => (
              <div key={stat.label} className={`p-3 rounded-2xl text-center ${isDark ? 'bg-white/5' : 'bg-white/60'} border ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <span className={`text-[9px] uppercase tracking-wider block mb-1 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{stat.label}</span>
                <span className={`text-base font-bold font-mono ${stat.color}`}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Stop feedback */}
          {stopFeedback && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs mb-3 ${
              stopFeedback.type === 'success'
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/20 border border-red-500/30 text-red-300'
            }`}>
              {stopFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{stopFeedback.message}</span>
            </div>
          )}

          {/* Stop button */}
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isStopping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
            <span>{isStopping ? 'A Parar...' : 'Terminar Carga'}</span>
          </button>
        </div>

        {/* Start info */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-xs ${isDark ? 'bg-white/5 text-gray-400' : 'bg-slate-100 text-slate-500'}`}>
          <Clock className="w-4 h-4 shrink-0" />
          <span>{t('userPortal.startTime')}: {activeCharge.start_time ? safeFormatDateTime(activeCharge.start_time) : '—'}</span>
        </div>
      </div>
    )
  }

  // --- IDLE / NO CHARGE VIEW ---
  return (
    <div className="space-y-5 animate-fade-up">
      {/* Idle hero */}
      <div className={`rounded-3xl p-6 flex flex-col items-center justify-center text-center min-h-[260px] ${
        isDark
          ? 'bg-slate-900 border border-white/10'
          : 'bg-white border border-slate-200'
      } shadow-sm`}>
        <div className={`p-5 rounded-3xl mb-4 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <BatteryCharging className={`w-12 h-12 ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
        </div>
        <h2 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Sem carga ativa
        </h2>
        <p className={`text-sm mb-6 max-w-xs ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
          Inicie uma sessão de carregamento no posto com o seu cartão RFID ou através do botão abaixo.
        </p>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setShowQrModal(true)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity"
          >
            <span>📷</span>
            <span>Ler QR Code do Posto</span>
          </button>
          <button
            onClick={() => setShowStartModal(true)}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 border ${
              isDark
                ? 'border-white/10 text-gray-300 hover:bg-white/5'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            } transition-colors`}
          >
            <Play className="w-4 h-4" />
            <span>Iniciar Manualmente</span>
          </button>
        </div>
      </div>

      {/* RFID card reminder */}
      <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl ${isDark ? 'bg-white/5 border border-white/10' : 'bg-blue-50 border border-blue-100'}`}>
        <Activity className={`w-5 h-5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
        <div>
          <span className={`text-xs font-bold block ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Cartão RFID: {rfidTag}</span>
          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>Aproxime o cartão ao leitor do posto</span>
        </div>
      </div>

      {/* Modals */}
      <RemoteStartModal
        isOpen={showStartModal}
        onClose={() => { setShowStartModal(false); setQrPrefill(null) }}
        rfidTag={rfidTag}
        username={profile?.username || user?.username}
      />
      <QrScanModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        onResult={handleQrResult}
      />
    </div>
  )
}
