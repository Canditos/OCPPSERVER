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
import { EvseBay } from './dashboard/EvseBay'
import { api } from '../api'
import type { Charger } from '../types'
import { useI18n } from '../i18n'
import { ChargerTagModal } from './charger-card/ChargerTagModal'
import { ChargerSecurityModal } from './charger-card/ChargerSecurityModal'

const ACTIVE_STATUSES = ['Charging', 'Preparing', 'SuspendedEVSE', 'SuspendedEV', 'Finishing']

export function ChargerCard({ charger }: { charger: Charger }) {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const live = useChargerStore((s) => s.liveState[charger.charge_point_id])
  const { displayNames, groups, setDisplayName, setGroup } = useChargerUiStore()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  // Display name editing state
  const cpId = charger.charge_point_id
  const displayName = displayNames[cpId] || ''
  const [isSelfHealing, setIsSelfHealing] = useState(false)

  const handleSelfHeal = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsSelfHealing(true)
    setFeedback({ type: 'info', message: t('chargerCard.selfHealRunning') })
    try {
      const resp = await api.selfHealCharger(charger.charge_point_id)
      const actionMsg = resp.actions_taken && resp.actions_taken.length > 0
        ? resp.actions_taken.join(' · ')
        : t('chargerCard.selfHealSuccessDefault')
      setFeedback({ type: 'success', message: `✅ ${actionMsg}` })
      refetchActiveTx()
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
      queryClient.invalidateQueries({ queryKey: ['activeTransactions', charger.charge_point_id] })
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('chargerCard.selfHealError')
      setFeedback({ type: 'error', message: `⚠️ ${msg}` })
    } finally {
      setIsSelfHealing(false)
      setTimeout(() => setFeedback(null), 7000)
    }
  }

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
  const handleOpenSecModal = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowSecModal(true)
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

  // Plug selection state - initialize to active charging connector if present, otherwise first plug
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(() => {
    const active = rawConnectors.find((c: any) => ACTIVE_STATUSES.includes(c.status))
    return active ? active.connector_id : (rawConnectors.length > 0 ? rawConnectors[0].connector_id : 1)
  })

  // Fetch active transactions for ALL connectors of this charger
  const { data: allActiveTransactions = {}, refetch: refetchActiveTx } = useQuery({
    queryKey: ['activeTransactions', charger.charge_point_id],
    queryFn: () => api.getAllActiveTransactions(charger.charge_point_id),
    refetchInterval: 5000,
  })

  // Fetch charging success rate per connector
  const { data: successRates = {} } = useQuery({
    queryKey: ['successRate', charger.charge_point_id],
    queryFn: () => api.getChargingSuccessRate(charger.charge_point_id),
    refetchInterval: 30000,
  })

  // An active transaction is authoritative even if the charger reported a
  // stale Available status during reconnect/startup.
  const restSelectedConn = (charger.connectors || []).find((c) => c.connector_id === selectedConnectorId)

  const rawActiveTx: any = (allActiveTransactions as any)[selectedConnectorId] ||
    (restSelectedConn?.active_transaction_id ? {
      transaction_id: restSelectedConn.active_transaction_id,
      id_tag: restSelectedConn.active_id_tag || '',
      user_username: restSelectedConn.active_username,
      user_role: restSelectedConn.active_user_role,
      energy_kwh: restSelectedConn.active_energy_kwh,
      start_time: restSelectedConn.active_start_time,
      connector_id: selectedConnectorId,
    } : null)

  const activeTransactionForSelectedConnector = rawActiveTx

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

  // Active charging connectors list
  const activeChargingConnectors = rawConnectors.filter((c: any) => ACTIVE_STATUSES.includes(c.status))

  // Ensure selected connector exists in rawConnectors without overriding user selection
  useEffect(() => {
    if (rawConnectors.length > 0 && !rawConnectors.some((c) => c.connector_id === selectedConnectorId)) {
      setSelectedConnectorId(rawConnectors[0].connector_id)
    }
  }, [rawConnectors, selectedConnectorId])

  // Check if ANY or SELECTED connector is in active session
  const selectedConnectorStatus = rawConnectors.find((c) => c.connector_id === selectedConnectorId)?.status
  const isSelectedConnectorActive = isOnline && selectedConnectorStatus && ACTIVE_STATUSES.includes(selectedConnectorStatus)
  const isAnySessionActive = isOnline && (
    activeChargingConnectors.length > 0 ||
    isSelectedConnectorActive ||
    Boolean(activeTransactionForSelectedConnector)
  )
  const isSessionActive = isSelectedConnectorActive || Boolean(activeTransactionForSelectedConnector)
  const isPreparing = isOnline && (computedStatus === 'Preparing' || rawConnectors.some((c) => c.status === 'Preparing'))
  const isFaulted = isOnline && (computedStatus === 'Faulted' || rawConnectors.some((c) => c.status === 'Faulted'))

  const effectiveTag = selectedTag || (authorizedTags.length > 0 ? authorizedTags[0].id_tag : 'ADMIN_TAG')
  const hasAuthorizedTag = authorizedTags.length > 0

  // DC detection: SICHARGE D or any model/vendor containing "DC" or ending in "D"
  const isDC = Boolean(
    charger.model?.toUpperCase().includes('SICHARGE D') ||
    charger.model?.toUpperCase().includes(' DC') ||
    charger.model?.toUpperCase().endsWith('-D') ||
    charger.vendor?.toUpperCase().includes('DC')
  )

  // Helper to extract isolated Power and SoC for any connector (with immediate REST hydration)
  const getConnectorTelemetry = (connId: number) => {
    const connMeters = live?.connectorMeters?.[connId]
    const restConn = (charger.connectors || []).find((c) => c.connector_id === connId)
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

    // Fallback to global live meters ONLY if this is the only active connector
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

    // Immediate REST Hydration fallback (displays instantly on page load without waiting for WebSocket packet)
    if (rawPower === null && restConn?.active_power_kw !== undefined && restConn?.active_power_kw !== null) {
      rawPower = restConn.active_power_kw * 1000
    }
    if (rawSoC === null && restConn?.active_soc !== undefined && restConn?.active_soc !== null) {
      rawSoC = Math.min(100, Math.max(0, Number(restConn.active_soc)))
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
      setNewTagId('ADMIN_TAG')
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
      const txId = activeTransactionForSelectedConnector?.transaction_id ?? null
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

  const handleUnlock = async (eOrConnId?: React.MouseEvent | number) => {
    let connId = selectedConnectorId
    if (typeof eOrConnId === 'number') {
      connId = eOrConnId
    } else if (eOrConnId && 'preventDefault' in eOrConnId) {
      eOrConnId.preventDefault()
      eOrConnId.stopPropagation()
    }
    setLoadingAction('unlock')
    setFeedback(null)
    try {
      await api.unlockConnector(charger.charge_point_id, connId)
      setFeedback({ type: 'success', message: t('chargerCard.unlockSent', { connector: connId }) })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: t('chargerCard.unlockFailed', { connector: connId }) })
    } finally {
      setLoadingAction(null)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const handleNotifyDriver = async (connectorId: number) => {
    try {
      const resp = await api.notifyMoveCar({ charge_point_id: charger.charge_point_id, connector_id: connectorId })
      setFeedback({ type: 'success', message: `Email enviado para ${resp.username}!` })
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.response?.data?.detail || 'Erro ao enviar aviso.' })
    } finally {
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

      {/* Responsive Mobile-Optimized Header */}
      <div className="mb-3.5 space-y-2">
        {/* Row 1: Station Icon + Name + Operational Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-2xl transition-all shrink-0 ${
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
                  <button onClick={commitName} className="shrink-0 p-1 text-emerald-400">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={cancelEditName} className="shrink-0 p-1 text-gray-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-gray-100 leading-tight truncate">
                    {displayName || cpId}
                  </p>
                  <button
                    onClick={startEditName}
                    className="shrink-0 p-1 text-slate-400 hover:text-slate-200 transition-colors"
                    title={t('dashboard.editName')}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate font-mono mt-0.5">
                {displayName ? cpId : [charger.model, charger.vendor].filter(Boolean).join(' · ') || t('chargerCard.defaultStation')}
              </p>
            </div>
          </div>

          {/* Operational Status Pill */}
          <span className={`status-pill shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border transition-all ${
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
        </div>

        {/* Row 2: Badges & Quick Action Chips (DC, ERK, Profile, Group, Auto-Heal, Details) */}
        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 dark:border-white/5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isDC && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-gradient-to-r from-violet-600 to-purple-700 text-white tracking-widest shadow-sm">
                DC
              </span>
            )}
            {(Boolean(charger.is_eichrecht_compliant) || (charger.model && /\b(erk|eichrecht|dcbm)\b/i.test(charger.model))) && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-0.5 font-mono"
                title="Certificado ERK / Eichrecht"
              >
                <ShieldCheck className="w-2.5 h-2.5 text-purple-400" />
                <span>ERK</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleOpenSecModal}
              className="text-[9px] px-1.5 py-0.5 rounded-md font-mono font-semibold border bg-slate-800/80 text-slate-300 border-white/10 hover:border-blue-400 cursor-pointer"
              title={t('chargerCard.securityProfileTooltip')}
            >
              {(charger.security_profile ?? 0) === 3 ? '🛡️ P3' : (charger.security_profile ?? 0) === 2 ? '🔒 P2' : (charger.security_profile ?? 0) === 1 ? '🔑 P1' : '🔓 P0'}
            </button>

            {/* Group selector */}
            <select
              value={currentGroup}
              onChange={(e) => commitGroup(e.target.value)}
              className="text-[9px] bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 rounded-md px-1.5 py-0.5 max-w-[110px] truncate cursor-pointer"
            >
              <option value="">{t('dashboard.noGroup')}</option>
              {allGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="__new__">{t('dashboard.newGroup')}</option>
            </select>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button
              type="button"
              onClick={handleSelfHeal}
              disabled={isSelfHealing}
              className="p-1 rounded-lg text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
              title={t('chargerCard.selfHealTooltip')}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSelfHealing ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <Link
              to={`/chargers/${charger.charge_point_id}`}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded-lg flex items-center gap-0.5"
            >
              <span>{t('common.details')}</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* EVSE Bays (Bay Layout) */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">
            {t('chargerCard.chargingBays', { count: rawConnectors.length })}
          </span>
          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono font-semibold">
            {t('chargerCard.activePlug', { id: selectedConnectorId })}
          </span>
        </div>

        <div className={`grid gap-2.5 ${rawConnectors.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {rawConnectors.map((c) => {
            const isSelected = selectedConnectorId === c.connector_id
            const connectorStatus = !isOnline
              ? 'Offline'
              : (isSelected && optimisticStatus)
              ? optimisticStatus
              : c.status
            const telemetry = getConnectorTelemetry(c.connector_id)
            const finalSoc = (isSelected && liveSoC !== null) ? liveSoC : telemetry.soc
            const finalPowerKw = (isSelected && livePowerKw !== null) ? livePowerKw : telemetry.powerKw
            const activeTx = (allActiveTransactions as any)?.[c.connector_id] || (isSelected ? activeTransactionForSelectedConnector : null)

            return (
              <EvseBay
                key={c.connector_id}
                connectorId={c.connector_id}
                status={connectorStatus}
                powerKw={finalPowerKw}
                soc={finalSoc}
                energyKwh={activeTx?.energy_kwh}
                activeTx={activeTx}
                isSelected={isSelected}
                isDC={isDC}
                onSelect={() => setSelectedConnectorId(c.connector_id)}
                onUnlock={() => handleUnlock(c.connector_id)}
                onNotifyDriver={activeTx ? () => handleNotifyDriver(c.connector_id) : undefined}
              />
            )
          })}
        </div>
      </div>

      {/* Charging Success Rate Cards */}
      {Object.keys(successRates).length > 0 && (
        <div className="mb-3">
          <span className="text-[11px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider block mb-1.5">{t('chargerCard.successRateByPlug')}</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(successRates).map(([connectorId, data]) => (
              <div key={connectorId} className="p-2.5 rounded-xl bg-slate-50 dark:bg-gray-800/40 border border-slate-200 dark:border-gray-700/50 shadow-sm hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">{t('chargerCard.plugNumber', { id: connectorId })}</span>
                  <span className={`text-sm font-bold ${data.success_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : data.success_rate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                    {data.success_rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-gray-400 mt-1 font-mono">
                  {t('chargerCard.completedCount', { completed: data.completed_transactions, total: data.total_transactions })}
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
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {hasAuthorizedTag ? (
            <div className="flex items-center gap-1 min-w-0 flex-1 sm:flex-none">
              <span className="text-slate-500 dark:text-gray-400 text-[10px] shrink-0">{t('chargerCard.tag')}</span>
              <select
                value={effectiveTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-emerald-600 dark:text-emerald-400 rounded-xl px-2.5 py-1.5 text-xs font-mono font-medium focus:outline-none focus:border-emerald-500/50 min-h-[36px] w-full sm:w-auto cursor-pointer truncate"
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
                setNewTagId('ADMIN_TAG')
                setShowTagModal(true)
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-500 dark:text-amber-300 border border-amber-500/30 font-medium hover:bg-amber-500/25 transition-colors min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('chargerCard.registerTag')}</span>
            </button>
          )}

          {hasAuthorizedTag && (
            <button
              onClick={() => {
                setNewTagId('')
                setShowTagModal(true)
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title={t('chargerCard.addNewTag')}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {activeTransactionForSelectedConnector && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono font-medium text-[11px] shrink-0">
            TX #{activeTransactionForSelectedConnector.transaction_id} (T#{selectedConnectorId})
          </span>
        )}
      </div>

      {/* Quick Controls Toolbar - Touch Friendly for Mobile (min 44px) */}
      <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        {Boolean(activeTransactionForSelectedConnector) || isSelectedConnectorActive ? (
          <button
            type="button"
            onClick={handleRemoteStop}
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer min-h-[44px] font-bold"
          >
            {loadingAction === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" fill="currentColor" />}
            <span>{t('chargerCard.stop', { target: activeTransactionForSelectedConnector ? `TX #${activeTransactionForSelectedConnector.transaction_id}` : `Tomada #${selectedConnectorId}` })}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRemoteStart}
            disabled={!isOnline || loadingAction !== null}
            className="flex-1 btn bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer min-h-[44px] font-bold"
          >
            {loadingAction === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" fill="currentColor" />}
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
          className="btn-secondary p-2.5 text-xs text-slate-700 dark:text-gray-300 rounded-xl hover:text-blue-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
        >
          {loadingAction === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Unlock className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={!isOnline || loadingAction !== null}
          title={t('chargerCard.softReset')}
          className="btn-secondary p-2.5 text-xs text-slate-700 dark:text-gray-300 rounded-xl hover:text-amber-500 hover:bg-amber-500/10 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
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
      <ChargerTagModal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        onSaveAndStart={handleSaveAndStart}
        isSaving={isSavingTag}
        initialTagId={newTagId}
      />

      {/* Quick Security & AuthorizationKey Modal */}
      <ChargerSecurityModal
        isOpen={showSecModal}
        onClose={() => setShowSecModal(false)}
        charger={charger}
        isOnline={Boolean(isOnline)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['chargers'] })}
      />
    </div>
  )
}
