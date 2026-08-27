import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Zap, WifiOff, Clock, Plug, Play, Square, RotateCcw, Unlock,
  Loader2, CheckCircle2, AlertCircle, Tag, Plus, X, ShieldCheck, Mail,
  Pencil, Check, Shield, Lock, Eye, EyeOff, Copy, Sparkles, Send
} from 'lucide-react'
import { safeFormatDistance } from '../utils/date'
import { useChargerStore } from '../store/chargerStore'
import { useChargerUiStore } from '../store/chargerUiStore'
import { ConnectorBadge } from './ConnectorBadge'
import { BatteryIndicator } from './BatteryIndicator'
import { api } from '../api'
import type { Charger } from '../types'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])
  const { displayNames, groups, setDisplayName, setGroup } = useChargerUiStore()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  // Display name editing state
  const cpId = charger.charge_point_id
  const displayName = displayNames[cpId] || ''
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  const startEditName = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setNameInput(displayName || cpId)
    setEditingName(true)
  }

  const commitName = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== cpId) {
      setDisplayName(cpId, trimmed)
    } else if (!trimmed || trimmed === cpId) {
      setDisplayName(cpId, '')
    }
    setEditingName(false)
  }

  const cancelEditName = () => {
    setEditingName(false)
  }

  // Group assignment state
  const currentGroup = groups[cpId] || ''
  const allGroups = Array.from(new Set(Object.values(groups).filter(Boolean))).sort()
  const [showGroupInput, setShowGroupInput] = useState(false)
  const [groupInput, setGroupInput] = useState('')
  const groupInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showGroupInput && groupInputRef.current) {
      groupInputRef.current.focus()
    }
  }, [showGroupInput])

  const commitGroup = (val: string) => {
    if (val === '__new__') {
      setGroupInput('')
      setShowGroupInput(true)
      return
    }
    setGroup(cpId, val)
  }

  const commitNewGroup = () => {
    const trimmed = groupInput.trim()
    if (trimmed) setGroup(cpId, trimmed)
    setShowGroupInput(false)
    setGroupInput('')
  }

  // Quick Add Tag Modal state
  const [showTagModal, setShowTagModal] = useState(false)
  const [newTagId, setNewTagId] = useState('')
  const [newTagDesc, setNewTagDesc] = useState('')
  const [isSavingTag, setIsSavingTag] = useState(false)

  // Security Modal state
  const [showSecModal, setShowSecModal] = useState(false)
  const [secProfile, setSecProfile] = useState<number>(charger.security_profile ?? 0)
  const [authKey, setAuthKey] = useState<string>(charger.auth_password || '')
  const [authEnabled, setAuthEnabled] = useState<boolean>(charger.auth_enabled ?? false)
  const [showKey, setShowKey] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<boolean>(false)
  const [secFeedback, setSecFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSavingSec, setIsSavingSec] = useState(false)

  useEffect(() => {
    setSecProfile(charger.security_profile ?? 0)
    setAuthKey(charger.auth_password || '')
    setAuthEnabled(charger.auth_enabled ?? false)
  }, [charger])

  const handleOpenSecModal = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowSecModal(true)
    setSecProfile(charger.security_profile ?? 0)
    setAuthKey(charger.auth_password || '')
    setAuthEnabled(charger.auth_enabled ?? false)
    setSecFeedback(null)
  }

  const handleSaveSecurity = async () => {
    setIsSavingSec(true)
    setSecFeedback(null)
    try {
      await api.updateChargerSecurity(charger.charge_point_id, {
        security_profile: secProfile,
        auth_password: authKey,
        auth_enabled: authEnabled || secProfile >= 1,
      })
      setSecFeedback({ type: 'success', message: 'Segurança guardada com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
      setTimeout(() => {
        setShowSecModal(false)
        setSecFeedback(null)
      }, 1200)
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleGenerateKey = async () => {
    setIsSavingSec(true)
    try {
      const res = await api.generateChargerKey(charger.charge_point_id)
      setAuthKey(res.authorization_key)
      setSecFeedback({ type: 'success', message: 'Nova AuthorizationKey gerada!' })
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao gerar: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleSyncKey = async () => {
    setIsSavingSec(true)
    try {
      const res = await api.syncChargerKey(charger.charge_point_id)
      setSecFeedback({ type: 'success', message: `Chave enviada ao posto via OCPP (${res.status})` })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao sincronizar: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleCopyKey = () => {
    if (!authKey) return
    navigator.clipboard.writeText(authKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

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

  // Merge persisted connectors with live connector updates so a charger never "loses" plugs
  const rawConnectors = (() => {
    const connectorMap = new Map<number, {
      connector_id: number
      status: string
      error_code: string | null
      updated_at: string | null
    }>()

    for (const connector of charger.connectors || []) {
      connectorMap.set(connector.connector_id, {
        connector_id: connector.connector_id,
        status: connector.status,
        error_code: connector.error_code ?? null,
        updated_at: connector.updated_at ?? null,
      })
    }

    for (const [id, connector] of Object.entries(live?.connectors || {})) {
      connectorMap.set(Number(id), {
        connector_id: Number(id),
        status: connector.status,
        error_code: connector.errorCode ?? null,
        updated_at: null,
      })
    }

    if (connectorMap.size === 0) {
      return [{ connector_id: 1, status: live?.isOnline ?? charger.is_online ? (charger.status || 'Available') : 'Offline', error_code: null, updated_at: null }]
    }

    return Array.from(connectorMap.values()).sort((a, b) => a.connector_id - b.connector_id)
  })()

  // Plug selection state - moved before use
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(
    rawConnectors.length > 0 ? rawConnectors[0].connector_id : 1
  )

  // Fetch active transaction for this charger
  const { data: activeTransaction, refetch: refetchActiveTx } = useQuery({
    queryKey: ['activeTransaction', charger.charge_point_id],
    queryFn: () => api.getActiveTransaction(charger.charge_point_id),
    refetchInterval: 5000,
  })

  // Fetch charging success rate per connector
  const { data: successRates = {} } = useQuery({
    queryKey: ['successRate', charger.charge_point_id],
    queryFn: () => api.getChargingSuccessRate(charger.charge_point_id),
    refetchInterval: 30000,
  })

  // Filter active transaction by selected connector
  const activeTransactionForSelectedConnector = activeTransaction && activeTransaction.connector_id === selectedConnectorId
    ? activeTransaction
    : null

  // Reset optimistic status when real live status updates
  useEffect(() => {
    if (live?.status) {
      setOptimisticStatus(null)
    }
  }, [live?.status])

  const isOnline = live?.isOnline ?? charger.is_online

  // Determine current operational status incorporating optimistic state
  const computedStatus = !isOnline
    ? 'Offline'
    : (optimisticStatus || live?.status || (charger.status && charger.status !== 'Offline' ? charger.status : null) || (rawConnectors[0]?.status && rawConnectors[0]?.status !== 'Offline' ? rawConnectors[0]?.status : null) || 'Available')

  // Check if SELECTED connector is in active session (Preparing, Charging, etc.)
  const selectedConnectorStatus = rawConnectors.find((c) => c.connector_id === selectedConnectorId)?.status
  const isSessionActive = isOnline && selectedConnectorStatus && ACTIVE_STATUSES.includes(selectedConnectorStatus)
  const isPreparing = isOnline && (computedStatus === 'Preparing' || rawConnectors.some((c) => c.status === 'Preparing'))
  const isFaulted = isOnline && (computedStatus === 'Faulted' || rawConnectors.some((c) => c.status === 'Faulted'))

  const effectiveTag = selectedTag || (authorizedTags.length > 0 ? authorizedTags[0].id_tag : 'VERSICHARGE_TAG')
  const hasAuthorizedTag = authorizedTags.length > 0

  // DC detection: SICHARGE D or any model/vendor containing "DC" or ending in "D"
  const isDC = Boolean(
    charger.model?.toUpperCase().includes('SICHARGE D') ||
    charger.model?.toUpperCase().includes(' DC') ||
    charger.model?.toUpperCase().endsWith('-D') ||
    charger.vendor?.toUpperCase().includes('DC')
  )

  // Active charging connectors list
  const activeChargingConnectors = rawConnectors.filter((c) => ACTIVE_STATUSES.includes(c.status))

  // Helper to extract isolated Power and SoC for any connector
  const getConnectorTelemetry = (connId: number) => {
    const connMeters = live?.connectorMeters?.[connId]
    let rawPower: number | null = null
    let rawSoC: number | null = null

    if (connMeters && Object.keys(connMeters).length > 0) {
      const pValues = Object.entries(connMeters)
        .filter(([measurand]) => measurand.toLowerCase().includes('power') || measurand.toLowerCase().includes('active.power'))
        .map(([, m]) => Number(m.value ?? 0))
      if (pValues.length > 0) rawPower = pValues.reduce((a, b) => a + b, 0)

      const socEntry = Object.entries(connMeters).find(([k]) => k.toLowerCase() === 'soc')
      if (socEntry) {
        const parsed = Number(socEntry[1].value)
        if (!isNaN(parsed)) rawSoC = Math.min(100, Math.max(0, parsed))
      }
    }

    // Fallback to global meters ONLY if this is the only active connector
    if (activeChargingConnectors.length <= 1) {
      if (rawPower === null && live?.meters) {
        const pValues = Object.entries(live.meters)
          .filter(([measurand]) => measurand.toLowerCase().includes('power') || measurand.toLowerCase().includes('active.power'))
          .map(([, m]) => Number(m.value ?? 0))
        if (pValues.length > 0) rawPower = pValues.reduce((a, b) => a + b, 0)
      }
      if (rawSoC === null && live?.meters) {
        const socEntry = Object.entries(live.meters).find(([k]) => k.toLowerCase() === 'soc')
        if (socEntry) {
          const parsed = Number(socEntry[1].value)
          if (!isNaN(parsed)) rawSoC = Math.min(100, Math.max(0, parsed))
        }
      }
    }

    return {
      powerWatts: rawPower,
      powerKw: rawPower !== null && rawPower > 0 ? rawPower / 1000 : null,
      soc: rawSoC,
    }
  }

  const selectedConnTelemetry = getConnectorTelemetry(selectedConnectorId)
  const livePower = selectedConnTelemetry.powerWatts
  const livePowerKw = selectedConnTelemetry.powerKw
  const liveSoC = selectedConnTelemetry.soc

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
      setFeedback({ type: 'success', message: t('chargerCard.accepted', { tag: effectiveTag, connector: selectedConnectorId }) })
      setTimeout(() => {
        refetchActiveTx()
        queryClient.invalidateQueries({ queryKey: ['chargers'] })
        queryClient.invalidateQueries({ queryKey: ['transactions'] })
      }, 1000)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('chargerCard.startFailed', { connector: selectedConnectorId })
      setFeedback({ type: 'error', message: msg })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 5000)
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
      setFeedback({ type: 'success', message: t('chargerCard.tagAuthorized', { tag: tagToSave.trim() }) })

      if (startImmediately) {
        setLoadingAction('start')
        await api.remoteStart(charger.charge_point_id, tagToSave.trim(), selectedConnectorId)
        setOptimisticStatus('Preparing')
        setFeedback({ type: 'success', message: t('chargerCard.chargeStarted', { connector: selectedConnectorId, tag: tagToSave.trim() }) })
        setTimeout(() => {
          refetchActiveTx()
          queryClient.invalidateQueries({ queryKey: ['chargers'] })
          queryClient.invalidateQueries({ queryKey: ['transactions'] })
        }, 1000)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('chargerCard.tagRegisterError')
      setFeedback({ type: 'error', message: msg })
    } finally {
      setIsSavingTag(false)
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 5000)
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
      setFeedback({ type: 'success', message: resp?.message || t('chargerCard.stopSent', { txId: resp.transaction_id ?? txId ?? '' }) })
      setTimeout(() => {
        refetchActiveTx()
        queryClient.invalidateQueries({ queryKey: ['chargers'] })
        queryClient.invalidateQueries({ queryKey: ['transactions'] })
      }, 1000)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('chargerCard.stopNoTx')
      setFeedback({ type: 'error', message: msg })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 5000)
    }
  }

  const handleReset = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoadingAction('reset')
    setFeedback(null)
    try {
      await api.reset(charger.charge_point_id, 'Soft')
      setFeedback({ type: 'success', message: t('chargerCard.resetSent') })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: t('chargerCard.resetFailed') })
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
      setFeedback({ type: 'success', message: t('chargerCard.unlockSent', { connector: selectedConnectorId }) })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: t('chargerCard.unlockFailed', { connector: selectedConnectorId }) })
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

          <div className="min-w-0 flex-1">
            {/* Editable display name */}
            {editingName ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') cancelEditName() }}
                  onBlur={commitName}
                  className="text-sm font-bold bg-white/10 border border-blue-500/40 rounded-lg px-2 py-0.5 text-gray-100 w-full focus:outline-none focus:border-blue-400"
                  maxLength={40}
                />
                <button onClick={commitName} className="shrink-0 p-0.5 text-emerald-400 hover:text-emerald-300">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={cancelEditName} className="shrink-0 p-0.5 text-gray-500 hover:text-gray-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-base font-bold text-gray-100 leading-tight truncate">
                  {displayName || cpId}
                </p>
                {isDC && (
                  <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-gradient-to-r from-violet-600 to-purple-700 text-white tracking-widest shadow-sm shadow-violet-500/30">
                    DC
                  </span>
                )}
                <button
                  onClick={startEditName}
                  className="shrink-0 p-0.5 text-gray-600 hover:text-gray-300 transition-colors"
                  title={t('dashboard.editName')}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Subtitle: OCPP ID when display name is set, else model/vendor */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {displayName ? (
                <p className="text-xs text-gray-600 truncate font-mono">{cpId}</p>
              ) : (
                <p className="text-xs text-gray-500 truncate">
                  {[charger.model, charger.vendor].filter(Boolean).join(' · ') || t('chargerCard.defaultStation')}
                </p>
              )}
            </div>

            {/* Group selector */}
            {showGroupInput ? (
              <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={groupInputRef}
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitNewGroup(); if (e.key === 'Escape') { setShowGroupInput(false); setGroupInput('') } }}
                  onBlur={commitNewGroup}
                  placeholder={t('dashboard.groupName')}
                  className="text-xs bg-white/10 border border-blue-500/40 rounded-lg px-2 py-0.5 text-gray-100 w-28 focus:outline-none focus:border-blue-400"
                  maxLength={30}
                />
                <button onClick={commitNewGroup} className="shrink-0 p-0.5 text-emerald-400">
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                <select
                  value={currentGroup}
                  onChange={(e) => commitGroup(e.target.value)}
                  className="text-[10px] bg-white/5 border border-white/10 text-gray-500 rounded-md px-1.5 py-0.5 focus:outline-none focus:border-blue-500/40 cursor-pointer hover:border-white/20 transition-colors max-w-[140px] truncate"
                >
                  <option value="">{t('dashboard.noGroup')}</option>
                  {allGroups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  <option value="__new__">{t('dashboard.newGroup')}</option>
                </select>
              </div>
            )}
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
                ? t('common.charging')
                : isPreparing
                ? t('chargerCard.preparing')
                : isFaulted
                ? t('chargerCard.fault')
                : t('common.available')}
            </span>
          </span>

          <button
            type="button"
            onClick={handleOpenSecModal}
            className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-semibold border transition-all cursor-pointer hover:scale-105 ${
              (charger.security_profile ?? 0) === 3
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
                : (charger.security_profile ?? 0) === 2
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25'
                : (charger.security_profile ?? 0) === 1
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
            }`}
            title={`Configurar Segurança (${(charger.security_profile ?? 0) === 3 ? 'Profile 3 - mTLS' : (charger.security_profile ?? 0) === 2 ? 'Profile 2 - TLS+Basic' : (charger.security_profile ?? 0) === 1 ? 'Profile 1 - Basic Auth' : 'Profile 0 - Aberto'})`}
          >
            {(charger.security_profile ?? 0) === 3 ? '🛡️ P3' : (charger.security_profile ?? 0) === 2 ? '🔒 P2' : (charger.security_profile ?? 0) === 1 ? '🔑 P1' : '🔓 P0'}
          </button>

          <Link
            to={`/chargers/${charger.charge_point_id}`}
            className="btn-ghost text-xs text-gray-400 hover:text-gray-200 py-1 px-2 rounded-lg"
          >
            {t('common.details')}
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
              <span className="text-xs font-semibold text-blue-300">
                {activeChargingConnectors.length > 1
                  ? `${activeChargingConnectors.length} Cargas Ativas em Simultâneo`
                  : t('chargerCard.chargingNow')}
              </span>
            </div>
            {livePowerKw !== null && <LiveKw watts={livePower!} />}
          </div>

          {/* Active User / Driver banner */}
          {activeTransactionForSelectedConnector && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 text-xs">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-blue-500/20 text-blue-400">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-100 text-xs block">
                    {activeTransactionForSelectedConnector.user_username ? `${t('chargerCard.driver')}: ${activeTransactionForSelectedConnector.user_username}` : `${t('chargerCard.tag')} ${activeTransactionForSelectedConnector.id_tag}`}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    TX #{activeTransactionForSelectedConnector.transaction_id} {activeTransactionForSelectedConnector.user_username ? `· ${activeTransactionForSelectedConnector.id_tag}` : ''}
                  </span>
                </div>
              </div>

              {activeTransactionForSelectedConnector.energy_kwh !== null && activeTransactionForSelectedConnector.energy_kwh !== undefined && (
                <div className="text-right font-mono">
                  <span className="text-emerald-400 font-bold text-xs">
                    {activeTransactionForSelectedConnector.energy_kwh} kWh
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTransactionForSelectedConnector && (
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                try {
                  const resp = await api.notifyMoveCar({ charge_point_id: charger.charge_point_id, connector_id: selectedConnectorId })
                  setFeedback({ type: 'success', message: `Email enviado para ${resp.username}!` })
                } catch (err: any) {
                  setFeedback({ type: 'error', message: err?.response?.data?.detail || 'Erro ao enviar aviso.' })
                }
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{t('chargerCard.askDriverToMove')}</span>
            </button>
          )}

          {/* DUAL / MULTI-BATTERY RENDERING OR SINGLE BATTERY */}
          {activeChargingConnectors.length > 1 ? (
            <div className="space-y-2 pt-2 border-t border-blue-500/10">
              <div className="flex items-center justify-between text-[11px] text-blue-300 font-semibold px-0.5">
                <span>Baterias em Carga (Clique para selecionar o conector):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeChargingConnectors.map((c) => {
                  const telemetry = getConnectorTelemetry(c.connector_id)
                  const isThisSelected = selectedConnectorId === c.connector_id
                  return (
                    <div
                      key={c.connector_id}
                      onClick={() => setSelectedConnectorId(c.connector_id)}
                      className={`cursor-pointer transition-all rounded-2xl p-1.5 ${
                        isThisSelected
                          ? 'ring-2 ring-blue-400 bg-blue-500/15 shadow-md shadow-blue-500/20'
                          : 'opacity-85 hover:opacity-100 bg-black/10'
                      }`}
                    >
                      <div className="flex items-center justify-between px-2 mb-1">
                        <span className={`text-[11px] font-bold font-mono ${isThisSelected ? 'text-blue-300' : 'text-slate-400'}`}>
                          ⚡ Tomada #{c.connector_id}
                        </span>
                        {isThisSelected && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 font-bold uppercase">
                            Selecionada
                          </span>
                        )}
                      </div>
                      <BatteryIndicator
                        soc={telemetry.soc}
                        isCharging={true}
                        powerKw={telemetry.powerKw}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            (liveSoC !== null || isSessionActive) && (
              <div className="pt-2 border-t border-blue-500/10">
                <BatteryIndicator soc={liveSoC} isCharging={isSessionActive} powerKw={livePowerKw} />
              </div>
            )
          )}
        </div>
      )}

      {/* Plugs / Connectors selector */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{t('chargerCard.selectPlug')}</span>
          <span className="text-[11px] text-blue-400 font-mono font-semibold">{t('chargerCard.activePlug', { id: selectedConnectorId })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {rawConnectors.map((c) => {
            const isSelected = selectedConnectorId === c.connector_id
            const connectorStatus = (isSelected && optimisticStatus) ? optimisticStatus : c.status
            const successRate = successRates[String(c.connector_id)]
            return (
              <button
                key={c.connector_id}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedConnectorId(c.connector_id)
                }}
                className={`transition-all rounded-xl cursor-pointer relative group ${
                  isSelected
                    ? 'ring-2 ring-blue-500 shadow-md shadow-blue-500/20 scale-105'
                    : 'opacity-70 hover:opacity-100 hover:scale-102'
                }`}
              >
                <ConnectorBadge
                  connectorId={c.connector_id}
                  status={connectorStatus}
                />
                {/* Success Rate Tooltip */}
                {successRate && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-gray-900/95 text-gray-200 px-2 py-1 rounded whitespace-nowrap border border-gray-700/50 pointer-events-none">
                    {t('chargerCard.successRateTooltip', { value: successRate.success_rate.toFixed(1) })}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Charging Success Rate Cards */}
      {Object.keys(successRates).length > 0 && (
        <div className="mb-3">
          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider block mb-1.5">{t('chargerCard.successRateByPlug')}</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(successRates).map(([connectorId, data]) => (
              <div key={connectorId} className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{t('chargerCard.plugNumber', { id: connectorId })}</span>
                  <span className={`text-sm font-bold ${data.success_rate >= 90 ? 'text-emerald-400' : data.success_rate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {data.success_rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.completed_transactions}/{data.total_transactions}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <span className="text-gray-500 text-[10px]">{t('chargerCard.tag')}</span>
              <select
                value={effectiveTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-white/5 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-emerald-600 dark:text-emerald-400 rounded-lg px-2 py-0.5 text-xs font-mono font-medium focus:outline-none focus:border-emerald-500/50"
              >
                {authorizedTags.map((tag) => (
                  <option key={tag.id} value={tag.id_tag}>
                    {tag.id_tag} {tag.description ? `(${tag.description})` : ''}
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
              <span>{t('chargerCard.registerTag')}</span>
            </button>
          )}

          {hasAuthorizedTag && (
            <button
              onClick={() => {
                setNewTagId('')
                setShowTagModal(true)
              }}
              className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5"
              title={t('chargerCard.addNewTag')}
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
            <span>{t('chargerCard.stop', { target: activeTransaction ? `TX #${activeTransaction.transaction_id}` : t('remoteStart.connectorLabel', { id: selectedConnectorId }) })}</span>
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
              {hasAuthorizedTag ? t('chargerCard.startChargePlug', { id: selectedConnectorId }) : t('chargerCard.addTagAndStart')}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={handleUnlock}
          disabled={!isOnline || loadingAction !== null}
          title={t('chargerCard.unlockPlug', { id: selectedConnectorId })}
          className="btn-secondary p-2 text-xs text-gray-300 rounded-xl hover:text-white hover:bg-white/10"
        >
          {loadingAction === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Unlock className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={!isOnline || loadingAction !== null}
          title={t('chargerCard.softReset')}
          className="btn-secondary p-2 text-xs text-gray-300 rounded-xl hover:text-amber-400 hover:bg-amber-500/10"
        >
          {loadingAction === 'reset' ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>

      {/* footer date */}
      {lastSeen && (
        <div className="flex items-center gap-1 mt-3 pt-2 text-[11px] text-gray-400 font-medium">
          <Clock className="w-3 h-3 text-gray-400" />
          <span>{t('chargerCard.seen', { time: lastSeen })}</span>
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
                  <h3 className="text-sm font-bold text-gray-100">{t('chargerCard.authorizedTagTitle')}</h3>
                  <p className="text-xs text-gray-500">{t('chargerCard.authorizedTagSubtitle')}</p>
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
              <span className="text-xs text-gray-400 font-medium">{t('chargerCard.quickSuggestions')}</span>
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
                <label className="block text-xs font-semibold text-gray-300 mb-1">{t('chargerCard.tagIdLabel')}</label>
                <input
                  type="text"
                  value={newTagId}
                  onChange={(e) => setNewTagId(e.target.value)}
                  placeholder={t('chargerCard.tagIdPlaceholder')}
                  className="input w-full font-mono text-sm uppercase"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">{t('chargerCard.descriptionLabel')}</label>
                <input
                  type="text"
                  value={newTagDesc}
                  onChange={(e) => setNewTagDesc(e.target.value)}
                  placeholder={t('chargerCard.descriptionPlaceholder')}
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
                {isSavingTag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('chargerCard.saveTag')}
              </button>

              <button
                type="button"
                onClick={() => handleSaveAndStart(newTagId, newTagDesc, true)}
                disabled={isSavingTag || !newTagId.trim()}
                className="flex-1 btn bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-md font-semibold"
              >
                {isSavingTag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
                <span>{t('chargerCard.saveAndStart')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Security & AuthorizationKey Modal */}
      {showSecModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { e.stopPropagation(); setShowSecModal(false) }}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-white/15 rounded-2xl shadow-2xl p-5 space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100">Segurança & AuthorizationKey</h3>
                  <p className="text-xs text-gray-500 font-mono">{charger.charge_point_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSecModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Alert feedback */}
            {secFeedback && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                secFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}>
                {secFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                <span>{secFeedback.message}</span>
              </div>
            )}

            {/* Profile selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">Perfil de Segurança (OCPP 1.6)</label>
              <select
                value={secProfile}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setSecProfile(val)
                  if (val >= 1) setAuthEnabled(true)
                }}
                className="select w-full text-xs py-2 bg-gray-800/90 border-white/10"
              >
                <option value={0}>Profile 0 — Aberto / Unsecure (ws:// sem password)</option>
                <option value={1}>Profile 1 — HTTP Basic Auth (ws:// com password)</option>
                <option value={2}>Profile 2 — TLS + Basic Auth (wss:// encriptado com password)</option>
                <option value={3}>Profile 3 — mTLS (TLS Mútuo com Certificados Digitais X.509)</option>
              </select>
            </div>

            {/* AuthorizationKey */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-300">AuthorizationKey (Password do Posto)</label>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={isSavingSec}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Gerar Chave Segura
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  placeholder="Introduza ou gere a password do posto"
                  className="input pr-20 text-xs font-mono bg-gray-800/90 border-white/10 w-full"
                />
                <div className="absolute right-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                    title={showKey ? 'Ocultar' : 'Mostrar'}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    disabled={!authKey}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Copiar Chave"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Header preview if key present */}
            {authKey && secProfile >= 1 && (
              <div className="p-2.5 rounded-lg bg-white/4 border border-white/8 space-y-1">
                <span className="text-[10px] text-gray-400 font-medium">Cabeçalho HTTP Basic para o Carregador:</span>
                <p className="text-[10px] font-mono text-gray-300 break-all bg-gray-950/80 p-1.5 rounded border border-white/5 select-all">
                  Authorization: Basic {btoa(`${charger.charge_point_id}:${authKey}`)}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleSyncKey}
                disabled={isSavingSec || !isOnline || !authKey}
                className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-40 transition-all"
                title={isOnline ? 'Enviar chave ao posto via OCPP' : 'Posto offline'}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Sincronizar no Posto</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSecurity}
                disabled={isSavingSec}
                className="flex-1 btn-primary text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isSavingSec ? 'A guardar...' : 'Guardar Segurança'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
