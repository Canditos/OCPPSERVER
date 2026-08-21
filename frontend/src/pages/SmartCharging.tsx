import React, { useState, useEffect, useCallback } from 'react'
import {
  Zap, BatteryCharging, Clock, Leaf, Gauge, Trash2,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import { api } from '../api'
import { useChargerStore } from '../store/chargerStore'

// ── Types ────────────────────────────────────────────────────────────────

interface ChargingProfile {
  id: number
  charge_point_id: string
  connector_id: number
  profile_id: number
  stack_level: number
  limit_amps: number
  label: string
  purpose: string
  active: boolean
  created_at: string
  schedule: { start_period: number; limit: number }[] | null
}

interface ChargerInfo {
  charge_point_id: string
  model: string | null
  vendor: string | null
  is_online: boolean
}

// ── Charger capability detection ─────────────────────────────────────────

type ChargerType = 'dc' | 'ac3' | 'ac1'

interface ChargerCapability {
  type: ChargerType
  maxKw: number       // physical max of the charger
  label: string       // "DC 400 kW", "AC 22 kW", "AC 7.4 kW"
  rateUnit: 'W' | 'A'
  // For AC: amps range; for DC: kW range
  minVal: number
  maxVal: number
  stepVal: number
}

function detectCharger(model: string | null, vendor: string | null): ChargerCapability {
  const m = (model ?? '').toUpperCase()
  const v = (vendor ?? '').toUpperCase()

  // ── DC chargers ──────────────────────────────────────────────────────
  if (
    m.includes('SICHARGE D') || m.includes('VEEFIL') ||
    m.includes('TERRA') || m.includes('ALPITRONIC') ||
    m.endsWith('-D') || m.includes(' DC') ||
    v.includes('ABB') && m.includes('DC') ||
    v.includes('ALPITRONIC') || v.includes('EFACEC') ||
    v.includes('TRITIUM')
  ) {
    // Try to infer max power from model name numbers e.g. "HPC400" → 400kW
    const kw = Number(m.match(/(\d{2,3})\s*KW/)?.[1] ?? m.match(/HPC\s*(\d+)/)?.[1] ?? '150')
    const maxKw = kw >= 10 && kw <= 1000 ? kw : 150
    return {
      type: 'dc',
      maxKw,
      label: `DC ${maxKw} kW`,
      rateUnit: 'W',
      minVal: 10,      // kW
      maxVal: maxKw,
      stepVal: maxKw >= 200 ? 20 : maxKw >= 100 ? 10 : 5,
    }
  }

  // ── AC 3-phase ────────────────────────────────────────────────────────
  if (
    m.includes('22KW') || m.includes('22 KW') || m.includes('3P') ||
    m.includes('3-PHASE') || m.includes('TRIO') ||
    v.includes('MENNEKES') || v.includes('SCHNEIDER') ||
    v.includes('WALLBOX') && m.includes('22')
  ) {
    return {
      type: 'ac3',
      maxKw: 22,
      label: 'AC 22 kW (3×)',
      rateUnit: 'A',
      minVal: 6,    // A
      maxVal: 32,
      stepVal: 1,
    }
  }

  // ── Default: AC single-phase 7.4 kW ──────────────────────────────────
  return {
    type: 'ac1',
    maxKw: 7.4,
    label: 'AC 7.4 kW',
    rateUnit: 'A',
    minVal: 6,
    maxVal: 32,
    stepVal: 1,
  }
}

// ── Preset builder ────────────────────────────────────────────────────────

interface Preset {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  purpose: string
  badge: string
  // What to send
  limit_amps?: number
  limit_watts?: number
  rate_unit: 'A' | 'W'
  schedule_periods?: { start_period: number; limit: number }[]
}

function buildPresets(cap: ChargerCapability): Preset[] {
  if (cap.type === 'dc') {
    const max = cap.maxKw
    const half = Math.round(max / 2 / 10) * 10 || 50
    const eco  = Math.round(max * 0.15 / 5) * 5 || 30
    return [
      {
        id: 'full',
        label: 'Potência Máxima',
        description: `Carrega à velocidade máxima do posto (${max} kW).`,
        icon: <Zap className="w-5 h-5" fill="currentColor" />,
        color: 'from-blue-600 to-cyan-500',
        limit_watts: max * 1000,
        rate_unit: 'W',
        purpose: 'TxDefaultProfile',
        badge: `${max} kW`,
      },
      {
        id: 'eco',
        label: 'Poupança',
        description: `Limita a ${eco} kW para reduzir stress na bateria e rede.`,
        icon: <Leaf className="w-5 h-5" />,
        color: 'from-emerald-600 to-green-500',
        limit_watts: eco * 1000,
        rate_unit: 'W',
        purpose: 'ChargePointMaxProfile',
        badge: `${eco} kW`,
      },
      {
        id: 'half',
        label: 'Meia Potência',
        description: `${half} kW — equilibra velocidade e desgaste da bateria.`,
        icon: <BatteryCharging className="w-5 h-5" />,
        color: 'from-violet-600 to-purple-500',
        limit_watts: half * 1000,
        rate_unit: 'W',
        purpose: 'TxDefaultProfile',
        badge: `${half} kW`,
      },
      {
        id: 'boost',
        label: 'Boost 80%',
        description: 'Carga rápida até ~80% SoC depois reduz para preservar bateria.',
        icon: <Clock className="w-5 h-5" />,
        color: 'from-orange-600 to-amber-500',
        limit_watts: max * 1000,
        rate_unit: 'W',
        purpose: 'TxDefaultProfile',
        badge: `${max}→${eco} kW`,
        schedule_periods: [
          { start_period: 0,    limit: max * 1000 },   // fast until ~80% (≈20min)
          { start_period: 1200, limit: eco * 1000 },   // slow finish
        ],
      },
    ]
  }

  // AC — same as before but correct kW display
  const phases = cap.type === 'ac3' ? 3 : 1
  const toKw = (a: number) => ((a * 230 * phases) / 1000).toFixed(1)
  return [
    {
      id: 'full',
      label: 'Carga Máxima',
      description: `Carrega o mais rápido possível (${toKw(32)} kW).`,
      icon: <Zap className="w-5 h-5" fill="currentColor" />,
      color: 'from-blue-600 to-cyan-500',
      limit_amps: 32,
      rate_unit: 'A',
      purpose: 'TxDefaultProfile',
      badge: `${toKw(32)} kW`,
    },
    {
      id: 'eco',
      label: 'Economia',
      description: 'Reduz para 6A para evitar sobrecarregar o quadro elétrico.',
      icon: <Leaf className="w-5 h-5" />,
      color: 'from-emerald-600 to-green-500',
      limit_amps: 6,
      rate_unit: 'A',
      purpose: 'ChargePointMaxProfile',
      badge: `${toKw(6)} kW`,
    },
    {
      id: 'half',
      label: 'Meia Potência',
      description: `${toKw(16)} kW — equilíbrio entre velocidade e consumo.`,
      icon: <BatteryCharging className="w-5 h-5" />,
      color: 'from-violet-600 to-purple-500',
      limit_amps: 16,
      rate_unit: 'A',
      purpose: 'TxDefaultProfile',
      badge: `${toKw(16)} kW`,
    },
    {
      id: 'night',
      label: 'Noturno Inteligente',
      description: 'Lento de dia, máximo das 22h–6h (tarifa baixa).',
      icon: <Clock className="w-5 h-5" />,
      color: 'from-indigo-600 to-blue-800',
      limit_amps: 6,
      rate_unit: 'A',
      purpose: 'TxDefaultProfile',
      badge: `${toKw(6)}→${toKw(32)} kW`,
      schedule_periods: [
        { start_period: 0,     limit: 6  },
        { start_period: 28800, limit: 32 },
      ],
    },
  ]
}

// ── Slider ────────────────────────────────────────────────────────────────

function PowerSlider({
  value, onChange, cap,
}: { value: number; onChange: (v: number) => void; cap: ChargerCapability }) {
  const { minVal, maxVal } = cap
  const pct = ((value - minVal) / (maxVal - minVal)) * 100

  const isDC = cap.type === 'dc'
  // Color: green=low, amber=mid, blue=full
  const color = pct < 30 ? '#10b981' : pct < 65 ? '#f59e0b' : '#3b82f6'

  const displayLabel = isDC
    ? `${value} kW`
    : `${value}A · ${((value * 230 * (cap.type === 'ac3' ? 3 : 1)) / 1000).toFixed(1)} kW`

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
          {isDC ? 'Potência DC' : 'Corrente AC'}
        </span>
        <span className="font-black text-lg tabular-nums" style={{ color }}>
          {displayLabel}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-2 rounded-full bg-gray-700" />
        <div
          className="absolute left-0 h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, #10b981, ${color})` }}
        />
        <input
          type="range"
          min={minVal}
          max={maxVal}
          step={cap.stepVal}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-x-0 w-full h-2 opacity-0 cursor-pointer z-10"
          style={{ height: '24px', margin: 0 }}
        />
        <div
          className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
          style={{
            left: `calc(${pct}% - 10px)`,
            background: color,
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        {isDC ? (
          <>
            <span>{minVal} kW</span>
            <span>{Math.round((minVal + maxVal) / 2)} kW</span>
            <span>{maxVal} kW</span>
          </>
        ) : (
          <>
            <span>{minVal}A</span>
            <span>{Math.round((minVal + maxVal) / 2)}A</span>
            <span>{maxVal}A</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Active profile badge ──────────────────────────────────────────────────

function ActiveProfileBadge({
  profile, onClear, clearing,
}: { profile: ChargingProfile; onClear: () => void; clearing: boolean }) {
  const isLimit = profile.limit_amps <= 8
  const isFull = profile.limit_amps >= 32

  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${
      isLimit ? 'bg-emerald-500/10 border-emerald-500/30' :
      isFull  ? 'bg-blue-500/10 border-blue-500/30' :
                'bg-violet-500/10 border-violet-500/30'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          isLimit ? 'bg-emerald-500/20 text-emerald-400' :
          isFull  ? 'bg-blue-500/20 text-blue-400' :
                    'bg-violet-500/20 text-violet-400'
        }`}>
          <Zap className="w-4 h-4" fill="currentColor" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-100 truncate">{profile.label}</p>
          <p className="text-xs text-gray-400">{profile.purpose}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={clearing}
        className="shrink-0 p-2 rounded-xl hover:bg-red-500/15 text-gray-500 hover:text-red-400 transition-colors"
        title="Remover perfil"
      >
        {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function SmartCharging() {
  const liveState = useChargerStore(s => s.liveState)
  const [chargers, setChargers] = useState<ChargerInfo[]>([])
  const [selectedCp, setSelectedCp] = useState<string>('')
  const [profiles, setProfiles] = useState<ChargingProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customPurpose, setCustomPurpose] = useState('TxDefaultProfile')

  const flashFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const loadChargers = async () => {
    try {
      const data = await api.getChargers()
      setChargers(data.map(c => ({
        charge_point_id: c.charge_point_id,
        model: c.model,
        vendor: c.vendor,
        is_online: c.is_online,
      })))
      if (data.length > 0 && !selectedCp) setSelectedCp(data[0].charge_point_id)
    } catch {}
  }

  const loadProfiles = useCallback(async () => {
    if (!selectedCp) return
    try {
      const data = await api.getChargingProfiles(selectedCp)
      setProfiles(data)
    } catch {}
  }, [selectedCp])

  useEffect(() => { loadChargers() }, [])
  useEffect(() => { loadProfiles() }, [loadProfiles])

  // Compute charger capability for the selected charger
  const selectedCharger = chargers.find(c => c.charge_point_id === selectedCp) ?? null
  const cap = selectedCharger
    ? detectCharger(selectedCharger.model, selectedCharger.vendor)
    : detectCharger(null, null)

  const PRESETS = buildPresets(cap)

  // Custom value state — initialize to mid range when charger changes
  const [customVal, setCustomVal] = useState<number>(cap.minVal)
  useEffect(() => {
    setCustomVal(Math.round((cap.minVal + cap.maxVal) / 2))
  }, [selectedCp, cap.minVal, cap.maxVal])

  const selectedLive = selectedCp ? liveState[selectedCp] : null
  const isOnline = selectedLive?.isOnline ?? selectedCharger?.is_online ?? false
  const isCharging = selectedLive?.status === 'Charging'
  const livePowerKw = selectedLive?.meters
    ? Object.entries(selectedLive.meters)
        .filter(([k]) => k.toLowerCase().includes('power'))
        .map(([, m]) => Number(m.value ?? 0) / 1000)
        .reduce((a, b) => a + b, 0)
    : null

  const applyPreset = async (preset: Preset) => {
    if (!selectedCp) return
    setLoading(true)
    try {
      await api.setChargingProfile({
        charge_point_id: selectedCp,
        connector_id: 0,
        limit_amps: preset.limit_amps,
        limit_watts: preset.limit_watts,
        rate_unit: preset.rate_unit,
        purpose: preset.purpose,
        label: preset.label,
        schedule_periods: preset.schedule_periods,
      })
      flashFeedback('success', `✓ "${preset.label}" aplicado a ${selectedCp}`)
      loadProfiles()
    } catch (e: any) {
      flashFeedback('error', e?.response?.data?.detail || 'Erro ao aplicar perfil')
    } finally {
      setLoading(false)
    }
  }

  const applyCustom = async () => {
    if (!selectedCp) return
    setLoading(true)
    try {
      const isDC = cap.type === 'dc'
      await api.setChargingProfile({
        charge_point_id: selectedCp,
        connector_id: 0,
        limit_amps: isDC ? undefined : customVal,
        limit_watts: isDC ? customVal * 1000 : undefined,
        rate_unit: cap.rateUnit,
        purpose: customPurpose,
        label: isDC ? `Custom ${customVal} kW` : `Custom ${customVal}A`,
      })
      const label = isDC
        ? `${customVal} kW`
        : `${customVal}A · ${((customVal * 230 * (cap.type === 'ac3' ? 3 : 1)) / 1000).toFixed(1)} kW`
      flashFeedback('success', `✓ Limite de ${label} aplicado`)
      loadProfiles()
    } catch (e: any) {
      flashFeedback('error', e?.response?.data?.detail || 'Erro ao aplicar')
    } finally {
      setLoading(false)
    }
  }

  const clearAll = async () => {
    if (!selectedCp) return
    setClearing(true)
    try {
      await api.clearChargingProfile({ charge_point_id: selectedCp })
      flashFeedback('success', `✓ Perfis removidos de ${selectedCp}`)
      loadProfiles()
    } catch (e: any) {
      flashFeedback('error', e?.response?.data?.detail || 'Erro ao remover perfis')
    } finally {
      setClearing(false)
    }
  }

  const clearOne = async (p: ChargingProfile) => {
    setClearing(true)
    try {
      await api.clearChargingProfile({
        charge_point_id: p.charge_point_id,
        purpose: p.purpose,
        stack_level: p.stack_level,
      })
      flashFeedback('success', `✓ Perfil "${p.label}" removido`)
      loadProfiles()
    } catch (e: any) {
      flashFeedback('error', e?.response?.data?.detail || 'Erro ao remover')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-violet-400" />
            Smart Charging
          </h1>
          <p className="text-gray-400 text-sm mt-1">Gestão inteligente de potência por posto</p>
        </div>
      </div>

      {/* Charger selector */}
      <div className="card">
        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2 block">
          Posto de Carga
        </label>
        <div className="flex items-center gap-3">
          <select
            value={selectedCp}
            onChange={e => setSelectedCp(e.target.value)}
            className="select flex-1"
          >
            <option value="">Selecionar posto...</option>
            {chargers.map(c => {
              const info = detectCharger(c.model, c.vendor)
              return (
                <option key={c.charge_point_id} value={c.charge_point_id}>
                  {c.charge_point_id}
                  {c.model ? ` — ${c.model}` : ''}
                  {` (${info.label})`}
                </option>
              )
            })}
          </select>
          {selectedCp && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${
              isCharging ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
              isOnline   ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                           'bg-gray-800 text-gray-500 border border-gray-700/30'
            }`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isCharging ? 'bg-blue-400' : isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isCharging ? 'bg-blue-400' : isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                }`} />
              </span>
              {isCharging
                ? `A carregar · ${livePowerKw ? livePowerKw.toFixed(1) + ' kW' : '...'}`
                : isOnline ? 'Online' : 'Offline'}
            </div>
          )}
        </div>

        {/* Charger type badge */}
        {selectedCp && (
          <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
            cap.type === 'dc'  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' :
            cap.type === 'ac3' ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' :
                                  'bg-blue-500/15 text-blue-400 border border-blue-500/20'
          }`}>
            <Zap className="w-3 h-3" fill="currentColor" />
            {cap.label}
            {cap.type === 'dc' && ' · Limite em kW'}
            {cap.type !== 'dc' && ` · Limite em Amperes`}
          </div>
        )}

        {/* Active profiles */}
        {profiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                Perfis Ativos ({profiles.length})
              </span>
              <button
                type="button"
                onClick={clearAll}
                disabled={clearing || !isOnline}
                className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Limpar todos
              </button>
            </div>
            {profiles.map(p => (
              <ActiveProfileBadge
                key={p.id}
                profile={p}
                onClear={() => clearOne(p)}
                clearing={clearing}
              />
            ))}
          </div>
        )}

        {!isOnline && selectedCp && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            <Info className="w-4 h-4 shrink-0" />
            Posto offline — não é possível enviar perfis de carga
          </div>
        )}
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold border ${
          feedback.type === 'success'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : 'bg-red-500/15 text-red-300 border-red-500/30'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {feedback.message}
        </div>
      )}

      {/* Presets grid */}
      <div>
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Perfis Rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              disabled={!isOnline || loading}
              onClick={() => applyPreset(preset)}
              className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border border-white/10
                text-left transition-all duration-150 active:scale-95
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:border-white/20 hover:shadow-lg bg-gray-900/60`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${preset.color}`} />
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${preset.color} text-white shadow-sm`}>
                {preset.icon}
              </div>
              <div className="min-w-0 w-full">
                <p className="font-bold text-gray-100 text-sm leading-tight">{preset.label}</p>
                <span className={`inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r ${preset.color} text-white`}>
                  {preset.badge}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{preset.description}</p>
              {loading && (
                <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom power slider */}
      <div className="card">
        <button
          type="button"
          onClick={() => setShowCustom(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-violet-400" />
            <span className="font-bold text-gray-200">Personalizado</span>
          </div>
          {showCustom ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showCustom && (
          <div className="mt-5 space-y-5">
            <PowerSlider value={customVal} onChange={setCustomVal} cap={cap} />

            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2 block">
                Tipo de Perfil
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'TxDefaultProfile', label: 'Por Transação', desc: 'Aplica a todas as sessões futuras' },
                  { value: 'ChargePointMaxProfile', label: 'Limite Máximo', desc: 'Limita a potência do posto' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCustomPurpose(opt.value)}
                    className={`flex-1 p-3 rounded-xl text-left border transition-all ${
                      customPurpose === opt.value
                        ? 'border-violet-500/60 bg-violet-500/15 text-violet-300'
                        : 'border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!isOnline || loading}
              onClick={applyCustom}
              className="w-full btn bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" fill="currentColor" />}
              {cap.type === 'dc'
                ? `Aplicar ${customVal} kW`
                : `Aplicar ${customVal}A · ${((customVal * 230 * (cap.type === 'ac3' ? 3 : 1)) / 1000).toFixed(1)} kW`
              }
            </button>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-gray-800/40 border border-white/5 text-xs text-gray-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div>
          <p className="font-semibold text-gray-300 mb-1">Como funciona o Smart Charging?</p>
          <p>
            Os perfis são enviados via OCPP 1.6 <code className="bg-gray-700 px-1 rounded">SetChargingProfile</code> ao posto.{' '}
            Postos <strong>DC</strong> usam limites em <strong>Watts</strong>.{' '}
            Postos <strong>AC</strong> usam <strong>Amperes</strong>.{' '}
            <strong>TxDefaultProfile</strong> aplica-se a sessões futuras.{' '}
            <strong>ChargePointMaxProfile</strong> limita a potência máxima do posto.
          </p>
        </div>
      </div>
    </div>
  )
}
