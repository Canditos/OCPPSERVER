import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Zap, WifiOff, Clock, Plug, Play, Square, RotateCcw, Unlock,
  Loader2, CheckCircle2, AlertCircle, Tag, Plus, X, ShieldCheck
} from 'lucide-react'
import { safeFormatDistance } from '../utils/date'
import { useChargerStore } from '../store/chargerStore'
import { ConnectorBadge } from './ConnectorBadge'
import { BatteryIndicator } from './BatteryIndicator'
import { api } from '../api'
import type { Charger } from '../types'

function LiveKw({ watts }: { watts: number }) {
  if (watts >= 1000) {
    const kw = (watts / 1000).toFixed(1)
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gradient-blue">{kw}</span>
        <span className="text-xs text-gray-400 font-medium">kW</span>
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gradient-blue">{Math.round(watts)}</span>
      <span className="text-xs text-gray-400 font-medium">W</span>
    </div>
  )
}

const ACTIVE_STATUSES = ['Charging', 'Preparing', 'SuspendedEVSE', 'SuspendedEV']

export function ChargerCard({ charger }: { charger: Charger }) {
  const queryClient = useQueryClient()
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  // Quick Add Tag Modal state
  const [showTagModal, setShowTagModal] = useState(false)
  const [newTagId, setNewTagId] = useState('')
  const [newTagDesc, setNewTagDesc] = useState('')
  const [isSavingTag, setIsSavingTag] = useState(false)

  // Fetch authorized tags
  const { data: authorizedTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    staleTime: 30000,
  })

  // Selected tag for RemoteStart
  const [selectedTag, setSelectedTag] = useState<string>('')

  useEffect(() => {
    if (authorizedTags.length > 0 && !selectedTag) {
      setSelectedTag(authorizedTags[0].id_tag)
    }
  }, [authorizedTags, selectedTag])

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
        : [{ connector_id: 1, status: isOnline ? (charger.status || 'Available') : 'Offline' }])

  // Plug selection state
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(
    rawConnectors.length > 0 ? rawConnectors[0].connector_id : 1
  )

  // Determine current operational status incorporating optimistic state
  const computedStatus = !isOnline
    ? 'Offline'
    : (optimisticStatus || live?.status || (charger.status && charger.status !== 'Offline' ? charger.status : null) || (rawConnectors[0]?.status && rawConnectors[0]?.status !== 'Offline' ? rawConnectors[0]?.status : null) || 'Available')

  // Check if any connector or charger is in active session (Preparing, Charging, etc.)
  const isSessionActive = isOnline && (ACTIVE_STATUSES.includes(computedStatus) || rawConnectors.some((c) => ACTIVE_STATUSES.includes(c.status)))
  const isPreparing = isOnline && (computedStatus === 'Preparing' || rawConnectors.some((c) => c.status === 'Preparing'))
  const isFaulted = isOnline && (computedStatus === 'Faulted' || rawConnectors.some((c) => c.status === 'Faulted'))

  const effectiveTag = selectedTag || (authorizedTags.length > 0 ? authorizedTags[0].id_tag : 'VERSICHARGE_TAG')
  const hasAuthorizedTag = authorizedTags.length > 0

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
      setNewTagId('VERSICHARGE_TAG')
      setShowTagModal(true)
      return
    }

    setLoadingAction('start')
    setFeedback(null)
    try {
      await api.remoteStart(charger.charge_point_id, effectiveTag, selectedConnectorId)
      setOptimisticStatus('Preparing')
      setFeedback({ type: 'success', message: `Aceite! Tag "${effectiveTag}" na tomada #${selectedConnectorId}` })
      setTimeout(() => refetchActiveTx(), 2000)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: `Falha ao ligar tomada #${selectedConnectorId}` })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  const handleSaveAndStart = async (tagToSave: string, desc: string, startImmediately: boolean) => {
    if (!tagToSave.trim()) return
    setIsSavingTag(true)
    try {
      await api.createTag(tagToSave.trim(), desc.trim() || undefined)
      await queryClient.invalidateQueries({ queryKey: ['tags'] })
      setSelectedTag(tagToSave.trim())
      setShowTagModal(false)
      setFeedback({ type: 'success', message: `Tag "${tagToSave.trim()}" autorizada com sucesso!` })

      if (startImmediately) {
        setLoadingAction('start')
        await api.remoteStart(charger.charge_point_id, tagToSave.trim(), selectedConnectorId)
        setOptimisticStatus('Preparing')
        setFeedback({ type: 'success', message: `Carga iniciada na tomada #${selectedConnectorId} com tag "${tagToSave.trim()}"!` })
        setTimeout(() => refetchActiveTx(), 2000)
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Erro ao registar a tag RFID.' })
    } finally {
      setIsSavingTag(false)
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
            !isOnline
              ? 'bg-gray-800/60 border border-gray-700/40 text-gray-500'
              : isSessionActive
              ? 'bg-blue-500/20 shadow-lg shadow-blue-500/10 border border-blue-500/30 text-blue-400'
              : isFaulted
              ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
          }`}>
            {!isOnline ? (
              <WifiOff className="w-5 h-5 text-gray-500" />
            ) : isSessionActive ? (
              <Zap className="w-5 h-5 text-blue-400 animate-pulse" fill="currentColor" />
            ) : isFaulted ? (
              <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Plug className="w-5 h-5 text-emerald-400" />
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
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {[charger.model, charger.vendor].filter(Boolean).join(' · ') || 'Posto OCPP'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`status-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
            !isOnline
              ? 'bg-gray-800/80 text-gray-400 border-gray-700/60'
              : isSessionActive
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
              : isPreparing
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
              : isFaulted
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              !isOnline
                ? 'bg-gray-500'
                : isSessionActive
                ? 'bg-blue-400 animate-ping'
                : isPreparing
                ? 'bg-amber-400 animate-pulse'
                : isFaulted
                ? 'bg-red-400'
                : 'bg-emerald-400 shadow-sm shadow-emerald-400'
            }`} />
            <span>
              {!isOnline
                ? 'Offline'
                : isSessionActive
                ? 'A Carregar'
                : isPreparing
                ? 'A Preparar'
                : isFaulted
                ? 'Avaria'
                : 'Disponível'}
            </span>
          </span>

          <Link
            to={`/chargers/${charger.charge_point_id}`}
            className="btn-ghost text-xs text-gray-400 hover:text-gray-200 py-1 px-2 rounded-lg"
          >
            Detalhes
          </Link>
        </div>
      </div>

      {/* Live charging telemetry card with Driver info */}
      {isSessionActive && (
        <div className="mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-xs font-semibold text-blue-300">Carga em Curso</span>
            </div>
            {livePowerKw !== null && <LiveKw watts={livePower!} />}
          </div>

          {/* Active User / Driver banner */}
          {activeTransaction && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 text-xs">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-blue-500/20 text-blue-400">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-100 text-xs block">
                    {activeTransaction.user_username ? `Condutor: ${activeTransaction.user_username}` : `Tag: ${activeTransaction.id_tag}`}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    TX #{activeTransaction.transaction_id} {activeTransaction.user_username ? `· ${activeTransaction.id_tag}` : ''}
                  </span>
                </div>
              </div>

              {activeTransaction.energy_kwh !== null && activeTransaction.energy_kwh !== undefined && (
                <div className="text-right font-mono">
                  <span className="text-emerald-400 font-bold text-xs">
                    {activeTransaction.energy_kwh} kWh
                  </span>
                </div>
              )}
            </div>
          )}

          {liveSoC !== null && (
            <div className="pt-2 border-t border-blue-500/10">
              <BatteryIndicator percentage={liveSoC} animated={true} />
            </div>
          )}
        </div>
      )}

      {/* Plugs / Connectors selector */}
      <div className="mb-3">
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

      {/* Active Tag & Transaction Bar */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasAuthorizedTag ? (
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">Tag:</span>
              <select
                value={effectiveTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-white/5 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-emerald-600 dark:text-emerald-400 rounded-lg px-2 py-0.5 text-xs font-mono font-medium focus:outline-none focus:border-emerald-500/50"
              >
                {authorizedTags.map((t) => (
                  <option key={t.id} value={t.id_tag}>
                    {t.id_tag} {t.description ? `(${t.description})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewTagId('VERSICHARGE_TAG')
                setShowTagModal(true)
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium hover:bg-amber-500/25 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Registar Tag RFID</span>
            </button>
          )}

          {hasAuthorizedTag && (
            <button
              onClick={() => {
                setNewTagId('')
                setShowTagModal(true)
              }}
              className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5"
              title="Adicionar nova tag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeTransaction && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono font-medium">
            TX #{activeTransaction.transaction_id}
          </span>
        )}
      </div>

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
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            {loadingAction === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
            <span>
              {hasAuthorizedTag ? `Iniciar Carga (Tomada #${selectedConnectorId})` : 'Adicionar Tag & Iniciar'}
            </span>
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

      {/* Quick Add Tag Modal */}
      {showTagModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setShowTagModal(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100">Registar Tag RFID Autorizada</h3>
                  <p className="text-xs text-gray-500">Permite autorizar arranques remotos e no posto</p>
                </div>
              </div>
              <button
                onClick={() => setShowTagModal(false)}
                className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-400 font-medium">Sugestões rápidas (1 clique):</span>
              <div className="flex flex-wrap gap-1.5">
                {['VERSICHARGE_TAG', 'ADMIN_TAG', 'MASTER_RFID', 'TAG_001'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setNewTagId(preset)
                      setNewTagDesc(`Tag ${preset}`)
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-emerald-400 border border-emerald-500/20 font-mono"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">ID da Tag RFID / Cartão</label>
                <input
                  type="text"
                  value={newTagId}
                  onChange={(e) => setNewTagId(e.target.value)}
                  placeholder="Ex: VERSICHARGE_TAG ou 04A1B2C3D4"
                  className="input w-full font-mono text-sm uppercase"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Descrição (opcional)</label>
                <input
                  type="text"
                  value={newTagDesc}
                  onChange={(e) => setNewTagDesc(e.target.value)}
                  placeholder="Ex: Cartão Siemens Principal / Utilizador"
                  className="input w-full text-sm"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleSaveAndStart(newTagId, newTagDesc, false)}
                disabled={isSavingTag || !newTagId.trim()}
                className="flex-1 btn-secondary text-xs py-2 rounded-xl text-gray-300 hover:text-white"
              >
                {isSavingTag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apenas Guardar Tag'}
              </button>

              <button
                type="button"
                onClick={() => handleSaveAndStart(newTagId, newTagDesc, true)}
                disabled={isSavingTag || !newTagId.trim()}
                className="flex-1 btn bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-md font-semibold"
              >
                {isSavingTag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
                <span>Guardar & Iniciar Carga</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
