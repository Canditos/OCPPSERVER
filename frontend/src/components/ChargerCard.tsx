import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Zap, WifiOff, Clock, Plug, Play, Square, RotateCcw, Unlock, Loader2, CheckCircle2, AlertCircle, Tag } from 'lucide-react'
import { safeFormatDistance } from '../utils/date'
import { useChargerStore } from '../store/chargerStore'
import { ConnectorBadge } from './ConnectorBadge'
import { BatteryIndicator } from './BatteryIndicator'
import { api } from '../api'
import type { Charger } from '../types'

function LiveKw({ watts }: { watts: number }) {
  const kw = (watts / 1000).toFixed(1)
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gradient-blue">{kw}</span>
      <span className="text-xs text-gray-400 font-medium">kW</span>
    </div>
  )
}

const ACTIVE_STATUSES = ['Charging', 'Preparing', 'SuspendedEVSE', 'SuspendedEV']

export function ChargerCard({ charger }: { charger: Charger }) {
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  // Fetch authorized tags
  const { data: authorizedTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    staleTime: 30000,
  })

  // Fetch active transaction for this charger
  const { data: activeTransaction, refetch: refetchActiveTx } = useQuery({
    queryKey: ['activeTransaction', charger.charge_point_id],
    queryFn: () => api.getActiveTransaction(charger.charge_point_id),
    refetchInterval: 5000,
  })

  // Reset optimistic status when real live status updates
  useEffect(() => {
    if (live?.status) {
      setOptimisticStatus(null)
    }
  }, [live?.status])

  const isOnline = live?.isOnline ?? charger.is_online

  // Determine current status incorporating optimistic state
  const mainStatus = optimisticStatus || live?.status || charger.status || 'Available'

  // Determine connectors array (NEVER EMPTY - defaults to connector #1 if DB/live empty)
  const rawConnectors = (live?.connectors && Object.keys(live.connectors).length > 0)
    ? Object.entries(live.connectors).map(([id, c]) => ({
        connector_id: Number(id),
        status: c.status,
        error_code: c.errorCode ?? null,
        updated_at: null,
      }))
    : (charger.connectors && charger.connectors.length > 0
        ? charger.connectors
        : [{ connector_id: 1, status: mainStatus }])

  // Plug selection state
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(
    rawConnectors.length > 0 ? rawConnectors[0].connector_id : 1
  )

  // Check if any connector or charger is in active session (Preparing, Charging, etc.)
  const isSessionActive = ACTIVE_STATUSES.includes(mainStatus) || rawConnectors.some((c) => ACTIVE_STATUSES.includes(c.status))
  const isPreparing = mainStatus === 'Preparing' || rawConnectors.some((c) => c.status === 'Preparing')
  const isFaulted = mainStatus === 'Faulted' || rawConnectors.some((c) => c.status === 'Faulted')

  // Get tag to use for RemoteStart
  const defaultTag = authorizedTags.length > 0 ? authorizedTags[0].id_tag : null
  const hasAuthorizedTag = defaultTag !== null

  const livePower = live?.meters
    ? Object.entries(live.meters)
        .filter(([measurand]) => measurand.toLowerCase().includes('power') || measurand.toLowerCase().includes('active.power'))
        .map(([, m]) => Number(m.value ?? 0))
        .reduce((a, b) => a + b, 0)
    : null

  // DC detection: SICHARGE D or any model/vendor containing "DC" or ending in "D"
  const isDC = Boolean(
    charger.model?.toUpperCase().includes('SICHARGE D') ||
    charger.model?.toUpperCase().includes(' DC') ||
    charger.model?.toUpperCase().endsWith('-D') ||
    charger.vendor?.toUpperCase().includes('DC')
  )

  // SoC from live meters (reported by vehicle via OCPP MeterValues when DC charging)
  const rawSoC = live?.meters
    ? Object.entries(live.meters).find(([k]) => k.toLowerCase() === 'soc')?.[1]?.value ?? null
    : null
  const liveSoC: number | null = rawSoC !== null ? Math.min(100, Math.max(0, Number(rawSoC))) : null

  const livePowerKw = livePower !== null && livePower > 0 ? livePower / 1000 : null

  const cardGlow = isSessionActive ? 'card-glow-blue' : isFaulted ? 'card-glow-red' : isOnline ? 'card-glow-emerald' : ''
  const lastSeen = safeFormatDistance(live?.lastSeen ?? charger.last_seen)

  const handleRemoteStart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!hasAuthorizedTag) {
      setFeedback({ type: 'error', message: 'Sem tag autorizada! Vai a Configuração > Tags para adicionar.' })
      setTimeout(() => setFeedback(null), 5000)
      return
    }
    setLoadingAction('start')
    setFeedback(null)
    try {
      await api.remoteStart(charger.charge_point_id, defaultTag!, selectedConnectorId)
      setOptimisticStatus('Preparing')
      setFeedback({ type: 'success', message: `Aceite! Tag "${defaultTag}" na tomada #${selectedConnectorId}` })
      // Refetch active transaction after a short delay
      setTimeout(() => refetchActiveTx(), 2000)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: `Falha ao ligar tomada #${selectedConnectorId}` })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  const handleRemoteStop = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('stop')
    setFeedback(null)
    try {
      // Pass the real active transaction_id, or null for auto-detect on backend
      const txId = activeTransaction?.transaction_id ?? null
      const resp = await api.remoteStop(charger.charge_point_id, txId)
      setOptimisticStatus('Available')
      setFeedback({ type: 'success', message: `Paragem enviada! Transação #${resp.transaction_id ?? txId}` })
      setTimeout(() => refetchActiveTx(), 2000)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Falha ao parar — sem transação ativa encontrada' })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 4000)
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
      await api.unlockConnector(charger.charge_point_id, selectedConnectorId)
      setFeedback({ type: 'success', message: `Desbloqueio da tomada #${selectedConnectorId} enviado!` })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: `Falha ao desbloquear tomada #${selectedConnectorId}` })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const chargerFlags = [
    isOnline ? 'online' : '',
    isSessionActive ? 'charging' : '',
    isFaulted ? 'faulted' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`charger-card relative flex flex-col justify-between ${cardGlow}`} data-charger-flags={chargerFlags}>
      {/* top stripe when active session */}
      {isSessionActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 animate-shimmer bg-[length:200%_auto] rounded-t-2xl" />
      )}

      {/* header */}
      <div className="flex items-start justify-between mb-4 pt-1 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`relative flex items-center justify-center w-11 h-11 rounded-2xl transition-all shrink-0 ${
            isSessionActive ? 'bg-blue-500/20 shadow-lg shadow-blue-500/10 border border-blue-500/30'
            : isFaulted ? 'bg-red-500/20 border border-red-500/30'
            : isOnline  ? 'bg-emerald-500/15 border border-emerald-500/25'
            : 'bg-gray-800/60 border border-gray-700/30'
          }`}>
            {isSessionActive ? (
              <Zap className="w-5 h-5 text-blue-400 animate-pulse" fill="currentColor" />
            ) : isFaulted ? (
              <Zap className="w-5 h-5 text-red-400" />
            ) : (
              <Plug className={`w-5 h-5 ${isOnline ? 'text-emerald-400' : 'text-gray-600'}`} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-gray-100 leading-tight truncate">{charger.charge_point_id}</p>
              {isDC && (
                <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-gradient-to-r from-violet-600 to-purple-700 text-white tracking-widest shadow-sm shadow-violet-500/30">
                  DC
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 font-medium truncate">{charger.model ?? 'VersiCharge'} · {charger.vendor ?? 'Siemens'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

          <Link
            to={`/chargers/${charger.charge_point_id}`}
            className="btn-ghost px-3 py-1.5 rounded-full text-xs"
          >
            Detalhes
          </Link>
        </div>
      </div>

      {/* live session panel — DC gets battery indicator, AC gets power bars */}
      {isSessionActive && (
        isDC ? (
          <BatteryIndicator
            soc={liveSoC}
            isCharging={!isPreparing}
            powerKw={livePowerKw}
            className="mb-4"
          />
        ) : (
          <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/60 to-slate-900/60 border border-blue-500/20 shadow-inner">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2 h-7 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
                    {isPreparing ? 'Sessão em Preparação' : 'Potência de Carga'}
                  </p>
                  {livePower !== null && livePower > 0 ? (
                    <LiveKw watts={livePower} />
                  ) : (
                    <div className="flex items-center gap-1 text-blue-400 font-semibold text-sm">
                      <Zap className="w-4 h-4 animate-bounce" />
                      <span>{isPreparing ? 'A comunicar com veículo...' : 'Em carregamento ativo...'}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-end gap-1 h-7 shrink-0">
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
        )
      )}

      {/* Clickable Connectors Selector */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Selecionar Tomada / Plug</span>
          <span className="text-[11px] text-blue-400 font-mono font-semibold">Ativa: #{selectedConnectorId}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {rawConnectors.map((c) => {
            const isSelected = selectedConnectorId === c.connector_id
            const connectorStatus = (isSelected && optimisticStatus) ? optimisticStatus : c.status
            return (
              <button
                key={c.connector_id}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedConnectorId(c.connector_id)
                }}
                className={`transition-all rounded-xl cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-blue-500 shadow-md shadow-blue-500/20 scale-105'
                    : 'opacity-70 hover:opacity-100 hover:scale-102'
                }`}
              >
                <ConnectorBadge
                  connectorId={c.connector_id}
                  status={connectorStatus}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Inline Feedback Toast */}
      {feedback && (
        <div className={`mb-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2 font-medium animate-fade-up ${
          feedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Active Tag & Transaction Info */}
      {(hasAuthorizedTag || activeTransaction) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
          {hasAuthorizedTag && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
              <Tag className="w-3 h-3" />
              {defaultTag}
            </span>
          )}
          {!hasAuthorizedTag && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
              <AlertCircle className="w-3 h-3" />
              Sem tag autorizada
            </span>
          )}
          {activeTransaction && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono font-medium">
              TX #{activeTransaction.transaction_id}
            </span>
          )}
        </div>
      )}

      {/* Quick Controls Toolbar */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
        {isSessionActive ? (
          <button
            type="button"
            onClick={handleRemoteStop}
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
          >
            {loadingAction === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" fill="currentColor" />}
            <span>Parar {activeTransaction ? `TX #${activeTransaction.transaction_id}` : `Tomada #${selectedConnectorId}`}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRemoteStart}
            disabled={!isOnline || loadingAction !== null || !hasAuthorizedTag}
            className={`flex-1 btn text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all ${
              hasAuthorizedTag
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500'
                : 'bg-gray-700 cursor-not-allowed opacity-60'
            }`}
          >
            {loadingAction === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
            <span>{hasAuthorizedTag ? `Iniciar (Tomada #${selectedConnectorId})` : 'Adicionar Tag!'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleUnlock}
          disabled={!isOnline || loadingAction !== null}
          title={`Desbloquear Tomada #${selectedConnectorId}`}
          className="btn-secondary p-2 text-xs text-gray-300 rounded-xl hover:text-white hover:bg-white/10"
        >
          {loadingAction === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Unlock className="w-4 h-4" />}
        </button>

        <button
          type="button"
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
        <div className="flex items-center gap-1 mt-3 pt-2 text-[11px] text-gray-400 font-medium">
          <Clock className="w-3 h-3 text-gray-400" />
          <span>Visto {lastSeen}</span>
        </div>
      )}
    </div>
  )
}
