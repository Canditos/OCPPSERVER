import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Calendar, Clock, Sun, Moon, Sparkles,
  Plus, Trash2, Send, RotateCcw, AlertTriangle, CheckCircle2,
  ChevronDown, Activity, Info, BarChart3, Layers, Sliders, BatteryCharging
} from 'lucide-react'
import { api, SmartChargingPreset, SmartChargingProfile } from '../api'
import type { Charger } from '../types'
import { useChargerStore } from '../store/chargerStore'
import { useI18n } from '../i18n'

// Helper to convert seconds into HH:MM
function secondsToHHMM(seconds: number): string {
  const h = Math.floor(seconds / 3600) % 24
  const m = Math.floor((seconds % 3600) / 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// Helper to convert HH:MM to seconds
function hhmmToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return ((h || 0) * 3600) + ((m || 0) * 60)
}

export function SmartCharging() {
  const qc = useQueryClient()
  const { t } = useI18n()
  const liveState = useChargerStore((s) => s.liveState)

  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 5000,
  })

  const isChargerOnline = (c: Charger) => liveState[c.charge_point_id]?.isOnline ?? c.is_online

  const [selectedCpId, setSelectedCpId] = useState<string>('')

  // Automatically select first connected or online charger if none selected
  React.useEffect(() => {
    if (!selectedCpId && chargers.length > 0) {
      const firstOnline = chargers.find(isChargerOnline) || chargers[0]
      setSelectedCpId(firstOnline.charge_point_id)
    }
  }, [chargers, selectedCpId, liveState])

  const currentCharger = chargers.find((c) => c.charge_point_id === selectedCpId)
  const isOnline = currentCharger ? isChargerOnline(currentCharger) : false

  // Detect charger capabilities (DC Fast vs AC)
  const isDC = Boolean(
    currentCharger?.model?.toLowerCase().includes('sicharge') ||
    currentCharger?.model?.toLowerCase().includes('dc') ||
    currentCharger?.model?.toUpperCase().endsWith('-D') ||
    currentCharger?.vendor?.toLowerCase().includes('dc')
  )

  const [presetFilter, setPresetFilter] = useState<'ALL' | 'AC' | 'DC'>('ALL')

  // Fetch presets
  const { data: presets = [] } = useQuery<SmartChargingPreset[]>({
    queryKey: ['smartChargingPresets'],
    queryFn: api.getSmartChargingPresets,
  })

  // Fetch saved profiles for charger
  const { data: profiles = [], refetch: refetchProfiles } = useQuery<SmartChargingProfile[]>({
    queryKey: ['smartChargingProfiles', selectedCpId],
    queryFn: () => api.getSmartChargingProfiles(selectedCpId),
    enabled: !!selectedCpId,
  })

  // Auto-switch filter and defaults only when charger TYPE changes (DC ↔ AC)
  const prevIsDCRef = React.useRef<boolean | null>(null)
  React.useEffect(() => {
    if (prevIsDCRef.current === isDC) return  // same type, don't reset user's form
    prevIsDCRef.current = isDC
    if (isDC) {
      setPresetFilter('DC')
      setRateUnit('W')
      setPeriods([
        { startHHMM: '00:00', limit: 150000, phases: 3 },
        { startHHMM: '07:00', limit: 50000, phases: 3 },
      ])
    } else if (currentCharger) {
      setPresetFilter('AC')
      setRateUnit('A')
      setPeriods([
        { startHHMM: '00:00', limit: 32, phases: 3 },
        { startHHMM: '07:00', limit: 10, phases: 3 },
      ])
    }
  }, [isDC])

  // Action status state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Custom Profile Form State
  const [profileName, setProfileName] = useState(t('smart.initialProfileName'))
  const [purpose, setPurpose] = useState<'TxDefaultProfile' | 'ChargePointMaxProfile' | 'TxProfile'>('TxDefaultProfile')
  const [kind, setKind] = useState<'Recurring' | 'Absolute' | 'Relative'>('Recurring')
  const [recurrencyKind, setRecurrencyKind] = useState<'Daily' | 'Weekly'>('Daily')
  const [connectorId, setConnectorId] = useState<number>(0)
  const [rateUnit, setRateUnit] = useState<'A' | 'W'>('A')
  const [stackLevel, setStackLevel] = useState<number>(0)
  const [periods, setPeriods] = useState<Array<{ startHHMM: string; limit: number; phases: number }>>([
    { startHHMM: '00:00', limit: 32, phases: 3 },
    { startHHMM: '07:00', limit: 10, phases: 3 },
  ])

  const normalizePurpose = (value: string): 'TxDefaultProfile' | 'ChargePointMaxProfile' | 'TxProfile' => {
    if (value === 'ChargePointMaxProfile' || value === 'TxProfile') return value
    return 'TxDefaultProfile'
  }

  const normalizeKind = (value: string): 'Recurring' | 'Absolute' | 'Relative' => {
    if (value === 'Absolute' || value === 'Relative') return value
    return 'Recurring'
  }

  const normalizeRecurrencyKind = (value?: string | null): 'Daily' | 'Weekly' => {
    return value === 'Weekly' ? 'Weekly' : 'Daily'
  }

  const normalizeRateUnit = (value?: string | null): 'A' | 'W' => {
    return value === 'W' ? 'W' : 'A'
  }

  // Composite schedule query results
  const [compositeData, setCompositeData] = useState<any | null>(null)

  // Find currently deployed active profile
  const activeProfile = profiles.find((p) => p.is_deployed)

  // Calculate current active period limit in real-time
  const getCurrentPeriodInfo = (periods: Array<{ start_period: number; limit: number; number_phases?: number; label?: string }>, rateUnit: string = 'A') => {
    if (!periods || periods.length === 0) return null
    const now = new Date()
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    const sorted = [...periods].sort((a, b) => a.start_period - b.start_period)
    let active = sorted[0]
    let next = sorted.length > 1 ? sorted[1] : null

    for (let i = 0; i < sorted.length; i++) {
      if (currentSeconds >= sorted[i].start_period) {
        active = sorted[i]
        next = sorted[(i + 1) % sorted.length]
      }
    }

    const formattedLimit = rateUnit === 'W'
      ? (active.limit >= 1000 ? `${(active.limit / 1000).toLocaleString('pt-PT')} kW` : `${active.limit} W`)
      : `${active.limit} A`

    return {
      active,
      next,
      formattedLimit,
      currentTimeStr: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    }
  }

  const activePeriodInfo = activeProfile ? getCurrentPeriodInfo(activeProfile.periods, activeProfile.charging_rate_unit) : null

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 6000)
  }

  // Apply Preset Mutation
  const handleApplyPreset = async (preset: SmartChargingPreset) => {
    if (!selectedCpId) return
    setLoadingAction(`preset-${preset.id}`)
    try {
      const res = await api.createSmartChargingProfile({
        charge_point_id: selectedCpId,
        connector_id: preset.purpose === 'ChargePointMaxProfile' ? 0 : 1,
        name: preset.name,
        stack_level: 0,
        purpose: preset.purpose,
        kind: preset.kind,
        recurrency_kind: preset.recurrency_kind || 'Daily',
        charging_rate_unit: preset.charging_rate_unit,
        duration: preset.duration,
        periods: preset.periods,
      })

      const profileId = (res as any).id || (res as any).data?.id
      await api.applySmartChargingProfile(profileId, selectedCpId)
      showToast('success', t('smart.applyProfileSuccess', { name: preset.name, cp: selectedCpId }))
      await refetchProfiles()
    } catch (err: any) {
      showToast('error', t('smart.applyProfileError', { error: err?.response?.data?.detail || err.message }))
    } finally {
      setLoadingAction(null)
    }
  }

  // Load Preset into Builder Form
  const handleLoadPresetToForm = (preset: SmartChargingPreset) => {
    setProfileName(preset.name)
    setPurpose(preset.purpose as any)
    setKind(preset.kind as any)
    if (preset.recurrency_kind) setRecurrencyKind(preset.recurrency_kind as any)
    setRateUnit(preset.charging_rate_unit as any)
    setPeriods(
      preset.periods.map((p) => ({
        startHHMM: secondsToHHMM(p.start_period),
        limit: p.limit,
        phases: p.number_phases || 3,
      }))
    )
    showToast('success', t('smart.loadModelSuccess', { name: preset.name }))
  }

  const handleAddPeriod = () => {
    setPeriods([...periods, { startHHMM: '18:00', limit: 16, phases: 3 }])
  }

  const handleRemovePeriod = (index: number) => {
    if (periods.length <= 1) return
    setPeriods(periods.filter((_, i) => i !== index))
  }

  const handleSaveAndApplyCustom = async () => {
    if (!selectedCpId) return
    setLoadingAction('custom')
    try {
      const sortedPeriods = [...periods]
        .map((p) => ({
          start_period: hhmmToSeconds(p.startHHMM),
          limit: Number(p.limit),
          number_phases: Number(p.phases),
        }))
        .sort((a, b) => a.start_period - b.start_period)

      const res = await api.createSmartChargingProfile({
        charge_point_id: selectedCpId,
        connector_id: purpose === 'ChargePointMaxProfile' ? 0 : connectorId,
        name: profileName,
        stack_level: stackLevel,
        purpose,
        kind,
        recurrency_kind: kind === 'Recurring' ? recurrencyKind : undefined,
        duration: kind === 'Recurring' ? (recurrencyKind === 'Weekly' ? 604800 : 86400) : 86400,
        charging_rate_unit: rateUnit,
        periods: sortedPeriods,
      })

      const profileId = (res as any).id || (res as any).data?.id
      await api.applySmartChargingProfile(profileId, selectedCpId)
      showToast('success', t('smart.customProfileSuccess', { name: profileName }))
      await refetchProfiles()
    } catch (err: any) {
      showToast('error', t('smart.customProfileError', { error: err?.response?.data?.detail || err.message }))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleClearAllProfiles = async () => {
    if (!selectedCpId) return
    setLoadingAction('clear-all')
    try {
      await api.clearSmartChargingProfile({ charge_point_id: selectedCpId })
      showToast('success', t('smart.clearProfilesSuccess', { cp: selectedCpId }))
      await refetchProfiles()
    } catch (err: any) {
      showToast('error', t('smart.clearProfilesError', { error: err?.response?.data?.detail || err.message }))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleFetchCompositeSchedule = async () => {
    if (!selectedCpId) return
    setLoadingAction('composite')
    try {
      const data = await api.getCompositeSchedule({
        charge_point_id: selectedCpId,
        connector_id: connectorId || 1,
        duration: 86400,
        rate_unit: rateUnit,
      })
      setCompositeData(data)
      showToast('success', t('smart.compositeSuccess'))
    } catch (err: any) {
      showToast('error', t('smart.compositeError', { error: err?.response?.data?.detail || err.message }))
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
              <Zap className="w-6 h-6" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                Smart Charging
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  OCPP 1.6-J
                </span>
                {isDC && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    {t('smart.dcFastCharger')}
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {t('smart.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Charger Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 font-medium shrink-0">{t('smart.targetStation')}</label>
          <div className="relative min-w-[220px]">
            <select
              className="select appearance-none pr-10 text-xs py-2 bg-gray-900/80 border-white/10"
              value={selectedCpId}
              onChange={(e) => setSelectedCpId(e.target.value)}
            >
              {chargers.map((c) => (
                <option key={c.id} value={c.charge_point_id}>
                  {isChargerOnline(c) ? '🟢' : '⚫'} {c.charge_point_id} ({c.vendor || t('smart.stationFallback')})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Global Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center gap-3 font-medium animate-fade-up border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : 'bg-red-500/15 text-red-300 border-red-500/30 shadow-lg shadow-red-500/10'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ── ACTIVE DEPLOYED PROFILE LIVE STATUS HERO BANNER ─────────────────── */}
      {activeProfile && (
        <div className="card p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-gray-900/80 to-blue-950/40 border border-emerald-500/30 shadow-xl space-y-4 animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Zap className="w-6 h-6 animate-pulse" fill="currentColor" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-100">{activeProfile.name}</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    {t('smart.activeAndInEffect')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg border font-bold ${
                    activeProfile.charging_rate_unit === 'W'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {activeProfile.charging_rate_unit === 'W' ? 'DC FAST (Watts / kW)' : 'AC (Amperes)'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  ID #{activeProfile.profile_id} · {t('smart.purpose')} <span className="text-gray-200 font-mono">{activeProfile.purpose}</span> · {activeProfile.kind} {activeProfile.recurrency_kind ? `(${activeProfile.recurrency_kind})` : ''} · {activeProfile.connector_id === 0 ? t('smart.allConnectors') : t('smart.connectorN', { n: activeProfile.connector_id })}
                </p>
              </div>
            </div>

            <button
              onClick={handleClearAllProfiles}
              disabled={!isOnline || loadingAction !== null}
              className="btn bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('smart.clearProfile')}</span>
            </button>
          </div>

          {/* Real-time active window & limit metric */}
          {activePeriodInfo && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 space-y-1">
                <span className="text-[11px] text-gray-400 font-medium">{t('smart.currentLimitLabel', { time: activePeriodInfo.currentTimeStr })}</span>
                <p className="text-xl font-bold text-emerald-400 font-mono">
                  {activePeriodInfo.formattedLimit}
                </p>
                <span className="text-[10px] text-gray-500 block truncate">
                  {activePeriodInfo.active?.label || t('smart.fromTime', { time: secondsToHHMM(activePeriodInfo.active?.start_period || 0) })}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 space-y-1">
                <span className="text-[11px] text-gray-400 font-medium">{t('smart.nextWindowLabel')}</span>
                <p className="text-base font-bold text-blue-300 font-mono">
                  {activePeriodInfo.next ? t('smart.atTime', { time: secondsToHHMM(activePeriodInfo.next.start_period) }) : t('smart.continuousCycle')}
                </p>
                <span className="text-[10px] text-gray-500 block truncate">
                  {activePeriodInfo.next
                    ? `${t('smart.willChangeTo')} ${activeProfile.charging_rate_unit === 'W' && activePeriodInfo.next.limit >= 1000 ? `${(activePeriodInfo.next.limit / 1000).toLocaleString('pt-PT')} kW` : `${activePeriodInfo.next.limit} ${activeProfile.charging_rate_unit}`}`
                    : t('smart.noScheduledChanges')}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 space-y-1">
                <span className="text-[11px] text-gray-400 font-medium">{t('smart.totalWindowsLabel')}</span>
                <p className="text-base font-bold text-gray-200 font-mono">
                  {activeProfile.periods.length} {activeProfile.periods.length === 1 ? t('smart.window') : t('smart.hourlyWindows')}
                </p>
                <span className="text-[10px] text-gray-500 block">
                  Duração: {activeProfile.duration ? `${activeProfile.duration / 3600}h (${activeProfile.recurrency_kind || t('smart.daily')})` : '24h'}
                </span>
              </div>
            </div>
          )}

          {/* 24-Hour Visual Schedule Bar with current hour marker */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-400" /> {t('smart.distributionLabel')}
              </span>
              <span className="text-xs font-mono text-emerald-300 font-bold">
                {t('smart.currentTime')} {activePeriodInfo?.currentTimeStr}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {activeProfile.periods.map((p, idx) => {
                const isActiveNow = activePeriodInfo?.active?.start_period === p.start_period
                const formattedLimit = activeProfile.charging_rate_unit === 'W'
                  ? (p.limit >= 1000 ? `${(p.limit / 1000).toLocaleString('pt-PT')} kW` : `${p.limit} W`)
                  : `${p.limit} A`

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs font-mono transition-all ${
                      isActiveNow
                        ? 'bg-emerald-500/20 border-emerald-500/50 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400/50'
                        : 'bg-white/3 border-white/5 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 font-bold">
                        {secondsToHHMM(p.start_period)}
                      </span>
                      <span className={`font-bold text-sm ${isActiveNow ? 'text-emerald-300' : 'text-gray-300'}`}>
                        {formattedLimit}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate mt-1">
                      {p.label || (isActiveNow ? t('smart.activeWindowNow') : t('smart.scheduled'))}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 1: 1-CLICK PRESETS ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                {t('smart.quickPresetsTitle')}
              </h2>
              <p className="text-xs text-gray-500">
                {t('smart.quickPresetsSubtitle')}
              </p>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
            <button
              type="button"
              onClick={() => setPresetFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                presetFilter === 'ALL'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              {t('smart.allFilter', { count: presets.length })}
            </button>

            <button
              type="button"
              onClick={() => setPresetFilter('AC')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                presetFilter === 'AC'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>AC (Amperes 6A-32A)</span>
            </button>

            <button
              type="button"
              onClick={() => setPresetFilter('DC')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                presetFilter === 'DC'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
              <span>DC Fast (Potência 30-300 kW)</span>
            </button>
          </div>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets
            .filter((p) => {
              if (presetFilter === 'ALL') return true
              if (p.category) return p.category === presetFilter
              return presetFilter === 'DC' ? p.charging_rate_unit === 'W' : p.charging_rate_unit === 'A'
            })
            .map((preset) => {
              const isPresetDC = preset.category === 'DC' || preset.charging_rate_unit === 'W'
              const matchesSelectedCharger = isDC ? isPresetDC : !isPresetDC

              return (
                <div
                  key={preset.id}
                  className={`card border transition-all duration-300 flex flex-col justify-between group ${
                    isPresetDC
                      ? 'border-purple-500/20 hover:border-purple-500/50 bg-gradient-to-b from-purple-950/20 to-transparent'
                      : 'border-emerald-500/20 hover:border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-transparent'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                          isPresetDC
                            ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {isPresetDC ? '⚡ DC FAST (kW)' : '🔌 AC (Amperes)'}
                        </span>

                        <span className="text-xs font-semibold text-gray-400 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">
                          {preset.recurrency_kind || preset.kind}
                        </span>
                      </div>

                      <span className="text-[10px] text-gray-500 font-mono">
                        {preset.purpose === 'ChargePointMaxProfile' ? t('smart.generalLimit') : t('smart.perConnector')}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-gray-100 group-hover:text-amber-300 transition-colors">
                      {preset.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {preset.description}
                    </p>

                    {/* Visual Periods Mini Timeline */}
                    <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                      <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" /> {t('smart.hourlyWindowsLabel')}
                      </p>
                      <div className="space-y-1">
                        {preset.periods.map((p, idx) => {
                          const formattedLimit = isPresetDC
                            ? p.limit >= 1000
                              ? `${(p.limit / 1000).toLocaleString('pt-PT')} kW`
                              : `${p.limit} W`
                            : `${p.limit} A`

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white/3 border border-white/5 font-mono"
                            >
                              <span className="text-gray-300 truncate max-w-[70%]">
                                {p.label || t('smart.fromTime', { time: secondsToHHMM(p.start_period) })}
                              </span>
                              <span className={`font-bold ${isPresetDC ? 'text-purple-300' : 'text-emerald-400'}`}>
                                {formattedLimit}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
                    <button
                      onClick={() => handleApplyPreset(preset)}
                      disabled={!isOnline || loadingAction !== null}
                      className={`flex-1 btn text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50 ${
                        isPresetDC
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{loadingAction === `preset-${preset.id}` ? t('smart.sending') : t('smart.applyAtStation')}</span>
                    </button>

                    <button
                      onClick={() => handleLoadPresetToForm(preset)}
                      title={t('smart.editInBuilder')}
                      className="btn-secondary text-xs p-2 text-gray-400 hover:text-white rounded-xl"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* ── SECTION 2: CUSTOM PROFILE BUILDER ─────────────────────────────────── */}
      <div id="custom-profile-builder" className="card border border-white/10 bg-gray-900/60 p-6 space-y-6 scroll-mt-20">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100">
                {t('smart.builderTitle')}
              </h2>
              <p className="text-xs text-gray-500">
                {t('smart.builderSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAllProfiles}
            disabled={!isOnline || loadingAction !== null}
            className="btn bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('smart.clearAllProfiles')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Col 1: Config Parameters */}
          <div className="space-y-4">
            <div>
              <label className="label">{t('smart.profileName')}</label>
              <input
                className="input text-xs"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={t('smart.profileNamePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('smart.purposeLabel')}</label>
                <select
                  className="select text-xs"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as any)}
                >
                  <option value="TxDefaultProfile">{t('smart.txDefaultProfile')}</option>
                  <option value="ChargePointMaxProfile">{t('smart.chargePointMaxProfile')}</option>
                  <option value="TxProfile">{t('smart.txProfile')}</option>
                </select>
              </div>

              <div>
                <label className="label">{t('smart.connectorLabel')}</label>
                <select
                  className="select text-xs"
                  value={connectorId}
                  disabled={purpose === 'ChargePointMaxProfile'}
                  onChange={(e) => setConnectorId(Number(e.target.value))}
                >
                  <option value={0}>{t('smart.allConnectorsOption')}</option>
                  <option value={1}>{t('smart.connector1')}</option>
                  <option value={2}>{t('smart.connector2')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('smart.profileType')}</label>
                <select
                  className="select text-xs"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="Recurring">{t('smart.recurring')}</option>
                  <option value="Absolute">{t('smart.absolute')}</option>
                  <option value="Relative">{t('smart.relative')}</option>
                </select>
              </div>

              <div>
                <label className="label">{t('smart.recurrence')}</label>
                <select
                  className="select text-xs"
                  value={recurrencyKind}
                  disabled={kind !== 'Recurring'}
                  onChange={(e) => setRecurrencyKind(e.target.value as any)}
                >
                  <option value="Daily">{t('smart.recurrenceDaily')}</option>
                  <option value="Weekly">{t('smart.recurrenceWeekly')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('smart.rateUnit')}</label>
                <div className="flex gap-2">
                  {(['A', 'W'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setRateUnit(unit)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        rateUnit === unit
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                          : 'bg-white/4 border-white/8 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {unit === 'A' ? t('smart.amperes') : t('smart.watts')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">{t('smart.stackLevel')}</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  className="input text-xs"
                  value={stackLevel}
                  onChange={(e) => setStackLevel(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Col 2 & 3: Schedule Periods Editor & Step Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label mb-0 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {t('smart.periodsLabel')}
              </label>
              <button
                type="button"
                onClick={handleAddPeriod}
                className="btn-secondary text-xs py-1 px-2.5 rounded-lg flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <Plus className="w-3.5 h-3.5" /> {t('smart.addInterval')}
              </button>
            </div>

            {/* Periods Table */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {periods.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/6"
                >
                  <span className="text-xs font-mono text-gray-500 w-6 shrink-0">#{idx + 1}</span>

                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">{t('smart.startTime')}</span>
                      <input
                        type="time"
                        className="input py-1 text-xs font-mono"
                        value={p.startHHMM}
                        onChange={(e) => {
                          const updated = [...periods]
                          updated[idx].startHHMM = e.target.value
                          setPeriods(updated)
                        }}
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">
                        {rateUnit === 'A' ? t('smart.limitAmperes') : t('smart.limitWatts')}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={rateUnit === 'A' ? 1 : 100}
                        className="input py-1 text-xs font-mono font-bold text-amber-400"
                        value={p.limit}
                        onChange={(e) => {
                          const updated = [...periods]
                          updated[idx].limit = Number(e.target.value)
                          setPeriods(updated)
                        }}
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">{t('smart.phases')}</span>
                      <select
                        className="select py-1 text-xs"
                        value={p.phases}
                        onChange={(e) => {
                          const updated = [...periods]
                          updated[idx].phases = Number(e.target.value)
                          setPeriods(updated)
                        }}
                      >
                        <option value={1}>{t('smart.mono')}</option>
                        <option value={3}>{t('smart.threePhase')}</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemovePeriod(idx)}
                    disabled={periods.length <= 1}
                    className="btn-ghost p-2 text-gray-500 hover:text-red-400 disabled:opacity-20 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Visual 24-hour Preview Bar */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-gray-950/60 border border-slate-200 dark:border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-slate-700 dark:text-gray-300 font-semibold">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  {t('smart.previewLabel')}
                </span>
                <span className="text-slate-500 dark:text-gray-400 font-mono font-medium">00:00 → 24:00</span>
              </div>
              <div className="h-6 w-full rounded-lg bg-slate-200 dark:bg-gray-900 flex overflow-hidden border border-slate-300 dark:border-white/10">
                {periods.map((p, idx) => {
                  const widthPercent = Math.max(10, 100 / periods.length)
                  return (
                    <div
                      key={idx}
                      style={{ width: `${widthPercent}%` }}
                      className={`h-full flex items-center justify-center text-[10px] font-mono font-bold text-white transition-all ${
                        p.limit >= 25
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-500'
                          : p.limit >= 16
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
                          : 'bg-gradient-to-r from-amber-600 to-orange-500'
                      }`}
                      title={`${p.startHHMM}: ${p.limit} ${rateUnit}`}
                    >
                      {p.startHHMM} · {p.limit}{rateUnit}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Submit Action */}
            <button
              onClick={handleSaveAndApplyCustom}
              disabled={!isOnline || loadingAction !== null}
              className="w-full btn bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-500/20"
            >
              <Send className="w-4 h-4" />
              <span>{loadingAction === 'custom' ? t('smart.sendingOcpp') : t('smart.saveActivate')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: DEPLOYED PROFILES & COMPOSITE SCHEDULE ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saved Profiles List */}
        <div className="card border border-white/8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-gray-200">{t('smart.savedProfiles')}</h3>
            </div>
            <span className="text-xs text-gray-500 font-mono">{t('smart.profilesCount', { count: profiles.length })}</span>
          </div>

          {profiles.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-white/5 rounded-xl">
              {t('smart.noSavedProfiles')}
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {profiles.map((prof) => (
                <div
                  key={prof.id}
                  className={`p-4 rounded-xl border transition-all ${
                    prof.is_deployed
                      ? 'bg-emerald-950/20 border-emerald-500/30 shadow-md shadow-emerald-950/40'
                      : 'bg-white/3 border-white/6 hover:border-white/15'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-100">{prof.name}</span>
                        {prof.is_deployed && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            {t('smart.deployedBadge')}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${
                          prof.charging_rate_unit === 'W'
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        }`}>
                          {prof.charging_rate_unit === 'W' ? 'DC (kW/W)' : 'AC (A)'}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-400 font-mono">
                        ID #{prof.profile_id} · {t('smart.purposeMeta')} <strong className="text-gray-300">{prof.purpose}</strong> · {prof.kind} {prof.recurrency_kind ? `(${prof.recurrency_kind})` : ''} · {prof.connector_id === 0 ? t('smart.generalStation') : t('smart.connectorN', { n: prof.connector_id })}
                      </p>

                      {/* Scheduled Periods Breakdown */}
                      {prof.periods && prof.periods.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[10px] text-gray-500 font-medium block mb-1">{t('smart.schedulesLabel')}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {prof.periods.map((per: any, pIdx: number) => {
                              const isKw = prof.charging_rate_unit === 'W' && per.limit >= 1000
                              const displayLimit = isKw
                                ? `${(per.limit / 1000).toLocaleString('pt-PT')} kW`
                                : `${per.limit} ${prof.charging_rate_unit || 'A'}`

                              return (
                                <span
                                  key={pIdx}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-800 dark:text-gray-300"
                                >
                                  <Clock className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                                  <span className="text-slate-600 dark:text-gray-400">{secondsToHHMM(per.start_period || 0)}:</span>
                                  <strong className="text-emerald-600 dark:text-emerald-300">{displayLimit}</strong>
                                  {per.number_phases && (
                                    <span className="text-slate-500 dark:text-gray-500">({per.number_phases === 3 ? t('smart.threePhaseShort') : t('smart.onePhaseShort')})</span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-start">
                      <button
                        onClick={() => {
                          setProfileName(prof.name + ' (Edição)')
                          setPurpose(normalizePurpose(prof.purpose))
                          setKind(normalizeKind(prof.kind))
                          setRecurrencyKind(normalizeRecurrencyKind(prof.recurrency_kind))
                          setRateUnit(normalizeRateUnit(prof.charging_rate_unit))
                          setConnectorId(prof.connector_id)
                          if (prof.periods && prof.periods.length > 0) {
                            setPeriods(
                              prof.periods.map((per: any) => ({
                                startHHMM: secondsToHHMM(per.start_period || 0),
                                limit: per.limit,
                                phases: per.number_phases || 3,
                              }))
                            )
                          }
                          document.getElementById('custom-profile-builder')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          showToast('success', t('smart.loadedToBuilder', { name: prof.name }))
                        }}
                        title={t('smart.loadToEdit')}
                        className="btn-ghost p-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => api.applySmartChargingProfile(prof.id, selectedCpId).then(() => {
                          showToast('success', t('smart.profileRedeployed', { id: prof.profile_id }))
                          refetchProfiles()
                        })}
                        disabled={!isOnline}
                        title="Reenviar e Ativar este perfil no posto"
                        className="btn-secondary p-2 text-xs text-blue-400 hover:text-white rounded-lg"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => api.deleteSmartChargingProfile(prof.id).then(() => {
                          showToast('success', t('smart.profileDeleted'))
                          refetchProfiles()
                        })}
                        title={t('smart.deleteProfile')}
                        className="btn-ghost p-2 text-xs text-red-400 hover:text-red-300 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Composite Schedule Query */}
        <div className="card border border-white/8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-gray-200">{t('smart.compositeTitle')}</h3>
            </div>
            <button
              onClick={handleFetchCompositeSchedule}
              disabled={!isOnline || loadingAction !== null}
              className="btn-secondary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-cyan-300 hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{loadingAction === 'composite' ? t('smart.querying') : t('smart.queryStation')}</span>
            </button>
          </div>

          <p className="text-xs text-gray-500">
            {t('smart.compositeDesc')}
          </p>

          {compositeData ? (
            <div className="p-3 rounded-xl bg-gray-950/80 border border-white/10 font-mono text-xs text-gray-300 space-y-2 overflow-x-auto max-h-56">
              <div className="flex justify-between border-b border-white/5 pb-1 text-gray-500 text-[11px]">
                <span>Status: <strong className="text-emerald-400">{compositeData.status}</strong></span>
                <span>Tomada: #{compositeData.connector_id}</span>
              </div>
              <pre className="text-[11px] text-cyan-300 whitespace-pre-wrap">
                {JSON.stringify(compositeData.charging_schedule || compositeData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-white/5 rounded-xl flex flex-col items-center gap-2">
              <Info className="w-5 h-5 text-gray-600" />
              {t('smart.compositeEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default SmartCharging
