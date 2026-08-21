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

interface Preset {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  limit_amps: number
  purpose: string
  schedule_periods?: { start_period: number; limit: number }[]
  badge?: string
}

// ── Constants ────────────────────────────────────────────────────────────

const VOLTAGE = 230  // V — single phase

function ampsToKw(amps: number) {
  return ((amps * VOLTAGE) / 1000).toFixed(1)
}

const PRESETS: Preset[] = [
  {
    id: 'full',
    label: 'Carga Máxima',
    description: 'Carrega o mais rápido possível. Usa toda a capacidade disponível.',
    icon: <Zap className="w-5 h-5" fill="currentColor" />,
    color: 'from-blue-600 to-cyan-500',
    limit_amps: 32,
    purpose: 'TxDefaultProfile',
    badge: '7.4 kW',
  },
  {
    id: 'eco',
    label: 'Economia',
    description: 'Reduz para 6A para evitar sobrecarregar o quadro elétrico.',
    icon: <Leaf className="w-5 h-5" />,
    color: 'from-emerald-600 to-green-500',
    limit_amps: 6,
    purpose: 'ChargePointMaxProfile',
    badge: '1.4 kW',
  },
  {
    id: 'half',
    label: 'Meia Potência',
    description: 'Equilíbrio entre velocidade e consumo. Ideal para carga noturna.',
    icon: <BatteryCharging className="w-5 h-5" />,
    color: 'from-violet-600 to-purple-500',
    limit_amps: 16,
    purpose: 'TxDefaultProfile',
    badge: '3.7 kW',
  },
  {
    id: 'night',
    label: 'Noturno Inteligente',
    description: 'Carrega devagar durante o dia, máximo das 22h às 6h (preço baixo).',
    icon: <Clock className="w-5 h-5" />,
    color: 'from-indigo-600 to-blue-800',
    limit_amps: 6,
    purpose: 'TxDefaultProfile',
    // Relative schedule: first 8h slow, then next 8h fast (approximation)
    schedule_periods: [
      { start_period: 0, limit: 6 },       // 0-8h slow
      { start_period: 28800, limit: 32 },   // 8h+ fast (e.g. overnight recharge)
    ],
    badge: '1.4→7.4 kW',
  },
]

// ── Sub-components ────────────────────────────────────────────────────────

function PowerSlider({
  value, onChange, min = 6, max = 32,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const pct = ((value - min) / (max - min)) * 100
  const color = value <= 8 ? '#10b981' : value <= 16 ? '#8b5cf6' : '#3b82f6'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">Potência de Carga</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black" style={{ color }}>{value}</span>
          <span className="text-gray-400 font-semibold">A</span>
          <span className="text-gray-500 text-sm">· {ampsToKw(value)} kW</span>
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-gray-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
          style={{ width: `${pct}%`, background: color }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={2}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg transition-all duration-100 pointer-events-none"
          style={{ left: `calc(${pct}% - 10px)`, background: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>6A · 1.4 kW</span>
        <span>16A · 3.7 kW</span>
        <span>32A · 7.4 kW</span>
      </div>
    </div>
  )
}

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
          <p className="text-xs text-gray-400">{profile.limit_amps}A · {ampsToKw(profile.limit_amps)} kW · {profile.purpose}</p>
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
  const [chargers, setChargers] = useState<{ charge_point_id: string; model: string | null }[]>([])
  const [selectedCp, setSelectedCp] = useState<string>('')
  const [profiles, setProfiles] = useState<ChargingProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Custom slider mode
  const [showCustom, setShowCustom] = useState(false)
  const [customAmps, setCustomAmps] = useState(16)
  const [customPurpose, setCustomPurpose] = useState('TxDefaultProfile')

  const flashFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const loadChargers = async () => {
    try {
      const data = await api.getChargers()
      setChargers(data)
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

  const applyPreset = async (preset: Preset) => {
    if (!selectedCp) return
    setLoading(true)
    try {
      await api.setChargingProfile({
        charge_point_id: selectedCp,
        connector_id: 0,
        limit_amps: preset.limit_amps,
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
      await api.setChargingProfile({
        charge_point_id: selectedCp,
        connector_id: 0,
        limit_amps: customAmps,
        purpose: customPurpose,
        label: `Custom ${customAmps}A`,
      })
      flashFeedback('success', `✓ Limite de ${customAmps}A aplicado`)
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

  const selectedLive = selectedCp ? liveState[selectedCp] : null
  const isOnline = selectedLive?.isOnline ?? false
  const isCharging = selectedLive?.status === 'Charging'
  const livePowerKw = selectedLive?.meters
    ? Object.entries(selectedLive.meters)
        .filter(([k]) => k.toLowerCase().includes('power'))
        .map(([, m]) => Number(m.value ?? 0) / 1000)
        .reduce((a, b) => a + b, 0)
    : null

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
            {chargers.map(c => (
              <option key={c.charge_point_id} value={c.charge_point_id}>
                {c.charge_point_id} {c.model ? `— ${c.model}` : ''}
              </option>
            ))}
          </select>
          {/* Live status pill */}
          {selectedCp && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${
              isCharging ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
              isOnline   ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                           'bg-gray-800 text-gray-500 border border-gray-700/30'
            }`}>
              <span className={`relative flex h-2 w-2`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isCharging ? 'bg-blue-400' : isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isCharging ? 'bg-blue-400' : isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                }`} />
              </span>
              {isCharging ? `A carregar · ${livePowerKw ? livePowerKw.toFixed(1) + ' kW' : '...'}` :
               isOnline ? 'Online' : 'Offline'}
            </div>
          )}
        </div>

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
              {/* Gradient top strip */}
              <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${preset.color}`} />

              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${preset.color} text-white shadow-sm`}>
                {preset.icon}
              </div>

              <div className="min-w-0 w-full">
                <p className="font-bold text-gray-100 text-sm leading-tight">{preset.label}</p>
                {preset.badge && (
                  <span className={`inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r ${preset.color} text-white`}>
                    {preset.badge}
                  </span>
                )}
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
            <PowerSlider value={customAmps} onChange={setCustomAmps} />

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
              Aplicar {customAmps}A · {ampsToKw(customAmps)} kW
            </button>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-gray-800/40 border border-white/5 text-xs text-gray-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div>
          <p className="font-semibold text-gray-300 mb-1">Como funciona o Smart Charging?</p>
          <p>Os perfis são enviados via OCPP 1.6 <code className="bg-gray-700 px-1 rounded">SetChargingProfile</code> diretamente ao posto. 
          O posto respeita o limite em Amperes definido. <strong>TxDefaultProfile</strong> aplica-se a todas as sessões. 
          <strong> ChargePointMaxProfile</strong> limita a potência máxima do posto independentemente da sessão.</p>
        </div>
      </div>
    </div>
  )
}
