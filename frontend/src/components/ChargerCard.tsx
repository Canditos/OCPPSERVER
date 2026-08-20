import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, WifiOff, Clock, Plug, Play, Square, RotateCcw, Unlock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { safeFormatDistance } from '../utils/date'
import { useChargerStore } from '../store/chargerStore'
import { ConnectorBadge } from './ConnectorBadge'
import { api } from '../api'
import type { Charger } from '../types'

function LiveKw({ watts }: { watts: number }) {
  const kw = (watts / 1000).toFixed(1)
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gradient-blue">{kw}</span>
      <span className="text-xs text-gray-500 font-medium">kW</span>
    </div>
  )
}

export function ChargerCard({ charger }: { charger: Charger }) {
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isOnline  = live?.isOnline  ?? charger.is_online
  const isCharging = (live?.connectors
    ? Object.values(live.connectors).some((c) => c.status === 'Charging')
    : (charger.connectors ?? []).some((c) => c.status === 'Charging')) || charger.status === 'Charging'

  const isFaulted  = (live?.connectors
    ? Object.values(live.connectors).some((c) => c.status === 'Faulted')
    : (charger.connectors ?? []).some((c) => c.status === 'Faulted')) || charger.status === 'Faulted'

  const connectors = live?.connectors
    ? Object.entries(live.connectors).map(([id, c]) => ({ connector_id: Number(id), ...c }))
    : charger.connectors ?? []

  const livePower = live?.meters
    ? Object.values(live.meters)
        .flatMap((m) => Object.entries(m))
        .filter(([k]) => k.toLowerCase().includes('power') || k.toLowerCase().includes('active'))
        .map(([, v]) => Number(v.value))
        .reduce((a, b) => a + b, 0)
    : null

  const cardGlow = isCharging ? 'card-glow-blue' : isFaulted ? 'card-glow-red' : isOnline ? 'card-glow-emerald' : ''
  const lastSeen = safeFormatDistance(live?.lastSeen ?? charger.last_seen)

  const handleRemoteStart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('start')
    setFeedback(null)
    try {
      await api.remoteStart(charger.charge_point_id, 'VERSICHARGE_TAG', 1)
      setFeedback({ type: 'success', message: 'Comando de arranque enviado!' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Falha ao ligar o posto' })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const handleRemoteStop = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('stop')
    setFeedback(null)
    try {
      await api.remoteStop(charger.charge_point_id, 100001)
      setFeedback({ type: 'success', message: 'Comando de paragem enviado!' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Falha ao parar o posto' })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const handleReset = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('reset')
    setFeedback(null)
    try {
      await api.reset(charger.charge_point_id, 'Soft')
      setFeedback({ type: 'success', message: 'Comando Reset enviado!' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Falha ao fazer Reset' })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const handleUnlock = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('unlock')
    setFeedback(null)
    try {
      await api.unlockConnector(charger.charge_point_id, 1)
      setFeedback({ type: 'success', message: 'Desbloqueio enviado!' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Falha ao desbloquear' })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  return (
    <div className={`charger-card relative flex flex-col justify-between ${cardGlow}`}>
      <Link to={`/chargers/${charger.charge_point_id}`} className="block">
        {/* top stripe when charging */}
        {isCharging && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 animate-shimmer bg-[length:200%_auto] rounded-t-2xl" />
        )}

        {/* header */}
        <div className="flex items-start justify-between mb-4 pt-1">
          <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center w-11 h-11 rounded-2xl transition-all ${
              isCharging ? 'bg-blue-500/20 shadow-lg shadow-blue-500/10 border border-blue-500/30'
              : isFaulted ? 'bg-red-500/20 border border-red-500/30'
              : isOnline  ? 'bg-emerald-500/15 border border-emerald-500/25'
              : 'bg-gray-800/60 border border-gray-700/30'
            }`}>
              {isCharging ? (
                <Zap className="w-5 h-5 text-blue-400 animate-pulse" fill="currentColor" />
              ) : isFaulted ? (
                <Zap className="w-5 h-5 text-red-400" />
              ) : (
                <Plug className={`w-5 h-5 ${isOnline ? 'text-emerald-400' : 'text-gray-600'}`} />
              )}
            </div>

            <div>
              <p className="text-base font-bold text-gray-100 leading-tight group-hover:text-blue-400 transition-colors">{charger.charge_point_id}</p>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">{charger.model ?? 'VersiCharge'} · {charger.vendor ?? 'Siemens'}</p>
            </div>
          </div>

          {/* online badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            isOnline
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'bg-gray-800/60 text-gray-500 border border-gray-700/30'
          }`}>
            {isOnline ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                Online
              </>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" />Offline</>
            )}
          </div>
        </div>

        {/* live power display */}
        {isCharging && (
          <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/60 to-slate-900/60 border border-blue-500/20 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-7 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600 animate-pulse" />
                <div>
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Potência de Carga</p>
                  {livePower !== null ? <LiveKw watts={livePower} /> : (
                    <div className="flex items-center gap-1 text-blue-400 font-semibold text-sm">
                      <Zap className="w-4 h-4 animate-bounce" />
                      <span>Em carregamento ativo...</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-end gap-1 h-7">
                {[4, 7, 10, 6, 8, 12].map((h, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-cyan-400/80 animate-pulse"
                    style={{ height: `${h * 2}px`, animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* connectors list */}
        {connectors.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {connectors.map((c) => (
              <ConnectorBadge
                key={c.connector_id}
                connectorId={c.connector_id}
                status={c.status}
              />
            ))}
          </div>
        )}
      </Link>

      {/* Inline Feedback Toast */}
      {feedback && (
        <div className={`mb-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2 font-medium animate-fade-up ${
          feedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Quick Controls Toolbar */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
        {isCharging ? (
          <button
            onClick={handleRemoteStop}
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
          >
            {loadingAction === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" fill="currentColor" />}
            <span>Parar Carga</span>
          </button>
        ) : (
          <button
            onClick={handleRemoteStart}
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
          >
            {loadingAction === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
            <span>Iniciar Carga</span>
          </button>
        )}

        <button
          onClick={handleUnlock}
          disabled={!isOnline || loadingAction !== null}
          title="Desbloquear Conector 1"
          className="btn-secondary p-2 text-xs text-gray-300 rounded-xl hover:text-white hover:bg-white/10"
        >
          {loadingAction === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Unlock className="w-4 h-4" />}
        </button>

        <button
          onClick={handleReset}
          disabled={!isOnline || loadingAction !== null}
          title="Reiniciar Posto (Soft Reset)"
          className="btn-secondary p-2 text-xs text-gray-300 rounded-xl hover:text-amber-400 hover:bg-amber-500/10"
        >
          {loadingAction === 'reset' ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>

      {/* footer date */}
      {lastSeen && (
        <div className="flex items-center gap-1 mt-3 pt-2 text-[11px] text-gray-500 font-medium">
          <Clock className="w-3 h-3 text-gray-600" />
          <span>Visto {lastSeen}</span>
        </div>
      )}
    </div>
  )
}
