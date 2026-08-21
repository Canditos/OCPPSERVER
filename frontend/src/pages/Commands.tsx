import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, Square, RotateCcw, Unlock, ToggleLeft, Bell,
  Trash2, Settings, FileSearch, CheckCircle, XCircle,
  ChevronDown, AlertTriangle, Wifi, Loader, Terminal,
} from 'lucide-react'
import { api } from '../api'
import type { Charger, Transaction } from '../types'

// ── types ──────────────────────────────────────────────────
type Result = { ok: boolean; status: string } | null

interface CmdCardProps {
  icon: React.ReactNode
  title: string
  description: string
  color: 'blue' | 'red' | 'amber' | 'emerald' | 'violet' | 'gray'
  disabled?: boolean
  result?: Result
  onClear?: () => void
  children: React.ReactNode
}

// ── color tokens ────────────────────────────────────────────
const C = {
  blue:    { ring: 'border-blue-500/20',   icon: 'bg-blue-500/15 text-blue-400',    title: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/20' },
  red:     { ring: 'border-red-500/20',    icon: 'bg-red-500/15 text-red-400',      title: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/20' },
  amber:   { ring: 'border-amber-500/20',  icon: 'bg-amber-500/15 text-amber-400',  title: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/20' },
  emerald: { ring: 'border-emerald-500/20',icon: 'bg-emerald-500/15 text-emerald-400', title: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20' },
  violet:  { ring: 'border-violet-500/20', icon: 'bg-violet-500/15 text-violet-400', title: 'text-violet-400',  badge: 'bg-violet-500/10 border-violet-500/20' },
  gray:    { ring: 'border-white/8',       icon: 'bg-gray-700/50 text-gray-400',    title: 'text-gray-400',    badge: 'bg-gray-700/20 border-gray-700/30' },
}

function ResultBadge({ result }: { result: Result | undefined }) {
  if (!result) return null
  return (
    <div className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-xs font-medium border animate-fade-up ${
      result.ok
        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
        : 'bg-red-500/10 border-red-500/25 text-red-400'
    }`}>
      {result.ok
        ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      <span>{result.status}</span>
    </div>
  )
}

function CmdCard({ icon, title, description, color, disabled, result, children }: CmdCardProps) {
  const c = C[color]
  return (
    <div className={`card border transition-all duration-300 ${disabled ? 'opacity-40 pointer-events-none' : ''} ${result?.ok ? 'card-glow-emerald' : result && !result.ok ? 'card-glow-red' : c.ring}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2.5 rounded-xl shrink-0 ${c.icon}`}>{icon}</div>
        <div>
          <p className={`text-sm font-semibold ${c.title}`}>{title}</p>
          <p className="text-xs text-gray-600 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-3">
        {children}
        <ResultBadge result={result} />
      </div>
    </div>
  )
}

// ── useCmd hook ─────────────────────────────────────────────
function useCmd(fn: () => Promise<{ status: string }>) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await fn()
      setResult({ ok: r.status === 'Accepted', status: r.status })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro de rede'
      setResult({ ok: false, status: msg })
    } finally {
      setLoading(false)
    }
  }

  return { loading, result, run, clear: () => setResult(null) }
}

// ── charger selector ────────────────────────────────────────
function ChargerSelector({
  chargers, value, onChange,
}: { chargers: Charger[]; value: string; onChange: (v: string) => void }) {
  const online = chargers.filter((c) => c.is_online)
  const offline = chargers.filter((c) => !c.is_online)

  return (
    <div className="card border border-white/8 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-gray-700/40">
          <Terminal className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-200">Charger alvo</p>
          <p className="text-xs text-gray-600">Selecciona o charger onde executar os comandos</p>
        </div>
        {value && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-xs text-emerald-400 font-medium">{value}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <select
          className="select pr-10 appearance-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— seleccionar charger —</option>
          {online.length > 0 && (
            <optgroup label="🟢 Online">
              {online.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
            </optgroup>
          )}
          {offline.length > 0 && (
            <optgroup label="⚫ Offline">
              {offline.map((c) => <option key={c.id} value={c.charge_point_id} disabled>{c.charge_point_id} (offline)</option>)}
            </optgroup>
          )}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
      </div>

      {/* online pills */}
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

// ── run button ──────────────────────────────────────────────
function RunBtn({
  label, onClick, loading, variant = 'primary', disabled,
}: { label: string; onClick: () => void; loading: boolean; variant?: 'primary' | 'danger' | 'secondary'; disabled?: boolean }) {
  const cls = variant === 'danger' ? 'btn-danger' : variant === 'secondary' ? 'btn-secondary' : 'btn-primary'
  return (
    <button className={`${cls} w-full justify-center`} onClick={onClick} disabled={loading || disabled}>
      {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
      {loading ? 'A executar…' : label}
    </button>
  )
}

// ── main ────────────────────────────────────────────────────
export function Commands() {
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers, refetchInterval: 5000 })
  const [cpId, setCpId] = useState('')

  const { data: activeTxs = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', cpId, 'Active'],
    queryFn: () => api.getTransactions(cpId, 'Active'),
    enabled: !!cpId,
    refetchInterval: 5000,
  })

  const offline = !chargers.find((c) => c.charge_point_id === cpId && c.is_online) && !!cpId

  // form state
  const [idTag, setIdTag]           = useState('VERSICHARGE_TAG')
  const [connector, setConnector]   = useState('1')
  const [txId, setTxId]             = useState('')
  const [resetType, setResetType]   = useState('Soft')
  const [unlockConn, setUnlockConn] = useState('1')
  const [availConn, setAvailConn]   = useState('1')
  const [availType, setAvailType]   = useState('Operative')
  const [triggerMsg, setTriggerMsg] = useState('StatusNotification')
  const [cfgKey, setCfgKey]         = useState('')
  const [cfgVal, setCfgVal]         = useState('')

  // commands
  const start  = useCmd(() => api.remoteStart(cpId, idTag, Number(connector)))
  const stop   = useCmd(() => api.remoteStop(cpId, Number(txId)))
  const reset  = useCmd(() => api.reset(cpId, resetType))
  const unlock = useCmd(() => api.unlockConnector(cpId, Number(unlockConn)))
  const avail  = useCmd(() => api.changeAvailability(cpId, Number(availConn), availType))
  const trig   = useCmd(() => api.triggerMessage(cpId, triggerMsg))
  const cache  = useCmd(() => api.clearCache(cpId))
  const cfg    = useCmd(() => api.changeConfiguration(cpId, cfgKey, cfgVal))
  const getcfg = useCmd(async () => { await api.getConfigurationRemote(cpId); return { status: 'Accepted' } })

  const noTarget = !cpId || offline

  return (
    <div className="space-y-6 animate-fade-up">
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Comandos Remotos</h1>
          <p className="text-sm text-gray-600 mt-1">OCPP 1.6 — Central System → Charge Point</p>
        </div>
        {offline && cpId && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-medium animate-fade-up">
            <AlertTriangle className="w-3.5 h-3.5" />
            Charger offline — comandos indisponíveis
          </div>
        )}
      </div>

      {/* charger selector */}
      <ChargerSelector chargers={chargers} value={cpId} onChange={setCpId} />

      {/* Siemens VersiCharge Presets Toolbar */}
      {cpId && !offline && (
        <div className="card border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-gray-900/40 p-4 mb-6 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider">Atalhos Siemens VersiCharge</h3>
            </div>
            <span className="text-[11px] text-gray-500 font-mono">Preset rápido 1-clique</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => {
                setIdTag('VERSICHARGE_TAG')
                setConnector('1')
                start.run()
              }}
              disabled={start.loading}
              className="btn bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" fill="currentColor" />
              <span>Carga Rápida</span>
            </button>

            <button
              onClick={() => {
                setResetType('Soft')
                reset.run()
              }}
              disabled={reset.loading}
              className="btn bg-gray-800 hover:bg-gray-700 text-amber-300 border border-amber-500/30 text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Soft Reset</span>
            </button>

            <button
              onClick={() => {
                setUnlockConn('1')
                unlock.run()
              }}
              disabled={unlock.loading}
              className="btn bg-gray-800 hover:bg-gray-700 text-violet-300 border border-violet-500/30 text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2"
            >
              <Unlock className="w-3.5 h-3.5 text-violet-400" />
              <span>Desbloquear Cabo</span>
            </button>

            <button
              onClick={() => {
                setTriggerMsg('StatusNotification')
                trig.run()
              }}
              disabled={trig.loading}
              className="btn bg-gray-800 hover:bg-gray-700 text-emerald-300 border border-emerald-500/30 text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pedir Estado</span>
            </button>
          </div>
        </div>
      )}


      {!cpId && (
        <div className="card flex flex-col items-center py-14 text-center gap-4 border-dashed border-white/10">
          <div className="p-4 rounded-2xl bg-gray-800/40">
            <Terminal className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <p className="text-gray-400 font-medium">Selecciona um charger para continuar</p>
            <p className="text-gray-600 text-sm mt-1">Os comandos ficam disponíveis assim que um charger estiver online</p>
          </div>
        </div>
      )}

      {cpId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* remote start */}
          <CmdCard icon={<Zap className="w-5 h-5" fill="currentColor" />} title="Remote Start" description="Inicia uma sessão de carregamento remotamente" color="blue" disabled={noTarget} result={start.result}>
            <div>
              <label className="label">ID Tag</label>
              <input className="input" value={idTag} onChange={(e) => setIdTag(e.target.value)} placeholder="ex: VERSICHARGE_TAG" />
            </div>
            <div>
              <label className="label">Conector</label>
              <input className="input" type="number" min={1} value={connector} onChange={(e) => setConnector(e.target.value)} />
            </div>
            <RunBtn label="Remote Start" onClick={start.run} loading={start.loading} />
          </CmdCard>

          {/* remote stop */}
          <CmdCard icon={<Square className="w-5 h-5" />} title="Remote Stop" description="Para uma sessão de carregamento activa" color="red" disabled={noTarget} result={stop.result}>
            <div>
              <label className="label">Transação activa</label>
              {activeTxs.length > 0 ? (
                <div className="relative">
                  <select className="select appearance-none pr-10" value={txId} onChange={(e) => setTxId(e.target.value)}>
                    <option value="">— seleccionar —</option>
                    {activeTxs.map((tx) => (
                      <option key={tx.id} value={tx.transaction_id}>
                        #{tx.transaction_id} · Conector {tx.connector_id} · {tx.id_tag}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-800/40 border border-white/6 text-xs text-gray-600">
                  <Square className="w-3.5 h-3.5" />
                  Sem transações activas
                </div>
              )}
            </div>
            <RunBtn label="Remote Stop" onClick={stop.run} loading={stop.loading} variant="danger" disabled={!txId} />
          </CmdCard>

          {/* reset */}
          <CmdCard icon={<RotateCcw className="w-5 h-5" />} title="Reset" description="Reinicia o charger (Soft não interrompe sessões activas)" color="amber" disabled={noTarget} result={reset.result}>
            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {['Soft', 'Hard'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setResetType(t)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      resetType === t
                        ? t === 'Hard'
                          ? 'bg-red-500/20 border-red-500/40 text-red-400'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-white/4 border-white/8 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {t === 'Soft' ? '↻ Soft' : '⚡ Hard'}
                  </button>
                ))}
              </div>
            </div>
            <RunBtn label={`Reset ${resetType}`} onClick={reset.run} loading={reset.loading} variant={resetType === 'Hard' ? 'danger' : 'secondary'} />
          </CmdCard>

          {/* unlock connector */}
          <CmdCard icon={<Unlock className="w-5 h-5" />} title="Unlock Connector" description="Desbloqueia mecanicamente o conector do veículo" color="violet" disabled={noTarget} result={unlock.result}>
            <div>
              <label className="label">Conector ID</label>
              <input className="input" type="number" min={1} value={unlockConn} onChange={(e) => setUnlockConn(e.target.value)} />
            </div>
            <RunBtn label="Unlock Connector" onClick={unlock.run} loading={unlock.loading} variant="secondary" />
          </CmdCard>

          {/* change availability */}
          <CmdCard icon={<ToggleLeft className="w-5 h-5" />} title="Change Availability" description="Coloca um conector Operative ou Inoperative" color="emerald" disabled={noTarget} result={avail.result}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Conector (0 = todos)</label>
                <input className="input" type="number" min={0} value={availConn} onChange={(e) => setAvailConn(e.target.value)} />
              </div>
              <div>
                <label className="label">Tipo</label>
                <div className="grid grid-cols-1 gap-2">
                  {['Operative', 'Inoperative'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setAvailType(t)}
                      className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                        availType === t
                          ? t === 'Operative'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-red-500/20 border-red-500/40 text-red-400'
                          : 'bg-white/4 border-white/8 text-gray-500 hover:text-gray-300'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <RunBtn label={`Set ${availType}`} onClick={avail.run} loading={avail.loading} variant={availType === 'Operative' ? 'primary' : 'danger'} />
          </CmdCard>

          {/* trigger message */}
          <CmdCard icon={<Bell className="w-5 h-5" />} title="Trigger Message" description="Força o charger a enviar uma mensagem específica" color="violet" disabled={noTarget} result={trig.result}>
            <div>
              <label className="label">Mensagem</label>
              <div className="relative">
                <select className="select appearance-none pr-10" value={triggerMsg} onChange={(e) => setTriggerMsg(e.target.value)}>
                  {['BootNotification','DiagnosticsStatusNotification','FirmwareStatusNotification','Heartbeat','MeterValues','StatusNotification'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>
            <RunBtn label="Trigger" onClick={trig.run} loading={trig.loading} variant="secondary" />
          </CmdCard>

          {/* clear cache */}
          <CmdCard icon={<Trash2 className="w-5 h-5" />} title="Clear Cache" description="Limpa a cache de autorização local do charger" color="red" disabled={noTarget} result={cache.result}>
            <p className="text-xs text-gray-600 bg-red-500/6 border border-red-500/15 rounded-xl p-3">
              ⚠️ O charger vai apagar todos os idTags em cache. Sessões activas não são interrompidas.
            </p>
            <RunBtn label="Clear Cache" onClick={cache.run} loading={cache.loading} variant="danger" />
          </CmdCard>

          {/* change configuration */}
          <CmdCard icon={<Settings className="w-5 h-5" />} title="Change Configuration" description="Altera um parâmetro de configuração OCPP" color="gray" disabled={noTarget} result={cfg.result}>
            <div>
              <label className="label">Chave</label>
              <input className="input" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} placeholder="ex: HeartbeatInterval" />
            </div>
            <div>
              <label className="label">Valor</label>
              <input className="input" value={cfgVal} onChange={(e) => setCfgVal(e.target.value)} placeholder="ex: 60" />
            </div>
            <RunBtn label="Change Configuration" onClick={cfg.run} loading={cfg.loading} disabled={!cfgKey} />
          </CmdCard>

          {/* get configuration */}
          <CmdCard icon={<FileSearch className="w-5 h-5" />} title="Get Configuration" description="Lê e guarda toda a configuração na base de dados" color="gray" disabled={noTarget} result={getcfg.result}>
            <p className="text-xs text-gray-600 bg-gray-700/20 border border-white/6 rounded-xl p-3">
              Faz GetConfiguration ao charger e actualiza a página de Configuração com os valores reais.
            </p>
            <RunBtn label="Get Configuration" onClick={getcfg.run} loading={getcfg.loading} variant="secondary" />
          </CmdCard>

        </div>
      )}
    </div>
  )
}
