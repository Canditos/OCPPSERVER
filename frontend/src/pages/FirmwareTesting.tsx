import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FlaskConical, Play, Square, CheckCircle2, XCircle, Clock,
  Loader2, Wifi, ChevronDown, Terminal, AlertTriangle, Copy, Check, Download,
} from 'lucide-react'
import { api } from '../api'
import type { Charger } from '../types'
import { useI18n } from '../i18n'

interface StepData {
  id: number
  name: string
  description: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  detail: string
  duration_s: number | null
}

interface XpecdStatus {
  state: string
  charge_point_id: string | null
  steps: StepData[]
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  pending:  <Clock className="w-4 h-4 text-gray-500" />,
  running:  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
  passed:   <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  failed:   <XCircle className="w-4 h-4 text-red-400" />,
  skipped:  <Clock className="w-4 h-4 text-amber-400" />,
}

const STEP_COLORS: Record<string, string> = {
  pending:  'border-white/5 bg-white/2',
  running:  'border-blue-500/30 bg-blue-500/5',
  passed:   'border-emerald-500/20 bg-emerald-500/5',
  failed:   'border-red-500/20 bg-red-500/5',
  skipped:  'border-amber-500/20 bg-amber-500/5',
}

const STATE_BADGES: Record<string, { label: string; cls: string }> = {
  idle:                 { label: 'firmware.stateIdle',              cls: 'bg-gray-700/30 border-gray-600/30 text-gray-400' },
  running:              { label: 'firmware.stateRunning',           cls: 'bg-blue-500/15 border-blue-500/30 text-blue-400' },
  phase1_complete:      { label: 'firmware.statePhase1Complete',    cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  waiting_for_charger:  { label: 'firmware.stateWaiting',          cls: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
  running_pingpong:     { label: 'firmware.stateRunningPingpong',  cls: 'bg-blue-500/15 border-blue-500/30 text-blue-400' },
  completed:            { label: 'firmware.stateCompleted',        cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  phase2_complete:      { label: 'firmware.statePhase2Complete',   cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  failed:               { label: 'firmware.stateFailed',           cls: 'bg-red-500/15 border-red-500/30 text-red-400' },
}

function ChargerSelector({
  chargers, value, onChange,
}: { chargers: Charger[]; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const online = chargers.filter((c) => c.is_online)
  const offline = chargers.filter((c) => !c.is_online)

  return (
    <div className="card border border-white/8 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-gray-700/40">
          <Terminal className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-200">{t('firmware.selectCharger')}</p>
          <p className="text-xs text-gray-600">{t('firmware.selectChargerDesc')}</p>
        </div>
      </div>
      <div className="relative">
        <select
          className="select pr-10 appearance-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('commands.selectCharger')}</option>
          {online.length > 0 && (
            <optgroup label="Online">
              {online.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
            </optgroup>
          )}
          {offline.length > 0 && (
            <optgroup label="Offline">
              {offline.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
            </optgroup>
          )}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
      </div>
      {online.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
          {online.map((c) => (
            <button
              key={c.id}
              onClick={() => onChange(c.charge_point_id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                value === c.charge_point_id
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-white/4 border-white/8 text-gray-400 hover:border-white/20 hover:text-gray-200'
              }`}
            >
              <Wifi className="w-3 h-3" />
              {c.charge_point_id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ step }: { step: StepData }) {
  const duration = step.duration_s != null
    ? `${step.duration_s}s`
    : step.status === 'running'
      ? '...'
      : ''

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${STEP_COLORS[step.status] || STEP_COLORS.pending}`}>
      <div className="pt-0.5 shrink-0">{STEP_ICONS[step.status] || STEP_ICONS.pending}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500">#{step.id}</span>
          <span className="text-sm font-medium text-gray-200">{step.name}</span>
          {duration && (
            <span className="ml-auto text-xs font-mono text-gray-500">{duration}</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 break-words">{step.description}</p>
        {step.detail && (
          <p className="text-xs text-amber-400/80 mt-0.5 break-words">{step.detail}</p>
        )}
      </div>
    </div>
  )
}

export function FirmwareTesting() {
  const { t } = useI18n()
  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 5000,
  })

  const [cpId, setCpId] = useState('')
  const [phase1Loading, setPhase1Loading] = useState(false)
  const [phase2Loading, setPhase2Loading] = useState(false)
  const [stopLoading, setStopLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: status } = useQuery<XpecdStatus>({
    queryKey: ['xpecd-status'],
    queryFn: api.xpecdStatus,
    refetchInterval: 2000,
  })

  const state = status?.state || 'idle'
  const steps = status?.steps || []
  const badge = STATE_BADGES[state] || STATE_BADGES.idle

  const isRunning = ['running', 'waiting_for_charger', 'running_pingpong'].includes(state)
  const showTestUrl = ['waiting_for_charger', 'running_pingpong'].includes(state)
  const testUrl = 'wss://ocpp.gatoescondido.com/test-ocpp'

  const runPhase1 = async () => {
    if (!cpId) return
    setPhase1Loading(true)
    setError('')
    try {
      await api.xpecdRun(cpId)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Erro')
    } finally {
      setPhase1Loading(false)
    }
  }

  const runPhase2 = async () => {
    if (!cpId) return
    setPhase2Loading(true)
    setError('')
    try {
      await api.xpecdPingpongStart(cpId)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Erro')
    } finally {
      setPhase2Loading(false)
    }
  }

  const stopTest = async () => {
    setStopLoading(true)
    setError('')
    try {
      await api.xpecdPingpongStop()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Erro')
    } finally {
      setStopLoading(false)
    }
  }

  const downloadReport = async () => {
    try {
      const html = await api.xpecdReport()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `XPECD-5262_${cpId}_${date}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Error downloading report')
    }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(testUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const PHASE1_IDS = new Set([1, 2, 3, 4, 6])
  const phase1Steps = steps.filter(s => PHASE1_IDS.has(s.id))
  const phase2Steps = steps.filter(s => !PHASE1_IDS.has(s.id))

  const allPassed = steps.length > 0 && steps.every(s => s.status === 'passed')
  const anyFailed = steps.some(s => s.status === 'failed')

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-3">
            <FlaskConical className="w-7 h-7 text-violet-400" />
            {t('firmware.title')}
          </h1>
          <p className="text-sm text-gray-600 mt-1">{t('firmware.subtitle')}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${badge.cls}`}>
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {t(badge.label)}
        </div>
      </div>

      {/* Charger selector */}
      <ChargerSelector chargers={chargers} value={cpId} onChange={setCpId} />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm animate-fade-up">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Test URL */}
      {showTestUrl && (
        <div className="card border border-amber-500/20 bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-gray-900/40 animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">{t('firmware.testServerUrl')}</span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{t('firmware.testServerHint')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs text-emerald-400 font-mono break-all">
              {testUrl}
            </code>
            <button
              onClick={copyUrl}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
        </div>
      )}

      {!cpId && (
        <div className="card flex flex-col items-center py-14 text-center gap-4 border-dashed border-white/10">
          <div className="p-4 rounded-2xl bg-gray-800/40">
            <FlaskConical className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <p className="text-gray-400 font-medium">{t('firmware.selectChargerToContinue')}</p>
          </div>
        </div>
      )}

      {cpId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Phase 1 */}
          <div className="card border border-blue-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-400">{t('firmware.phase1Title')}</p>
                <p className="text-xs text-gray-600">{t('firmware.phase1Desc')}</p>
              </div>
            </div>

            <button
              className="btn-primary w-full justify-center mb-4"
              onClick={runPhase1}
              disabled={phase1Loading || isRunning}
            >
              {phase1Loading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('firmware.executing')}</>
                : <><Play className="w-3.5 h-3.5" /> {t('firmware.runConfig')}</>
              }
            </button>

            <div className="space-y-2">
              {phase1Steps.map(step => (
                <StepRow key={step.id} step={step} />
              ))}
            </div>
          </div>

          {/* Phase 2 */}
          <div className="card border border-violet-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-violet-500/15 text-violet-400">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-400">{t('firmware.phase2Title')}</p>
                <p className="text-xs text-gray-600">{t('firmware.phase2Desc')}</p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                className="btn-primary flex-1 justify-center"
                onClick={runPhase2}
                disabled={phase2Loading || isRunning}
              >
                {phase2Loading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('firmware.executing')}</>
                  : <><Play className="w-3.5 h-3.5" /> {t('firmware.startPingpong')}</>
                }
              </button>
              <button
                className="btn-danger justify-center"
                onClick={stopTest}
                disabled={stopLoading || !isRunning}
              >
                {stopLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Square className="w-3.5 h-3.5" />
                }
                {t('firmware.stopPingpong')}
              </button>
            </div>

            <div className="space-y-2">
              {phase2Steps.map(step => (
                <StepRow key={step.id} step={step} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {steps.length > 0 && !isRunning && (allPassed || anyFailed) && (
        <div className={`card border ${allPassed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'} animate-fade-up`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {allPassed
                ? <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                : <XCircle className="w-6 h-6 text-red-400" />
              }
              <div>
                <p className={`text-sm font-semibold ${allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {allPassed ? t('firmware.allPassed') : t('firmware.someFailed')}
                </p>
                <p className="text-xs text-gray-500">
                  {steps.filter(s => s.status === 'passed').length}/{steps.length} {t('firmware.stepsPassed')}
                </p>
              </div>
            </div>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={downloadReport}
            >
              <Download className="w-4 h-4" />
              {t('firmware.downloadReport')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
