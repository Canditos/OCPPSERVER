import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'
import { safeFormatDate, safeFormatDistance } from '../utils/date'
import {
  ArrowLeft, Cpu, Wifi, WifiOff, Activity, MessageSquare, Zap, CheckCircle2,
  Shield, Key, Lock, Unlock, Copy, Eye, EyeOff, Sparkles, RefreshCw, Send, AlertTriangle, Check
} from 'lucide-react'

import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import { EventLog } from '../components/EventLog'
import { ConnectorBadge } from '../components/ConnectorBadge'
import { AvailabilityMonitor } from '../components/AvailabilityMonitor'
import { useChargerStore } from '../store/chargerStore'
import type { Charger, OcppMessage } from '../types'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-600 font-medium">{label}</span>
      <span className="text-xs text-gray-300 font-mono text-right max-w-[60%] break-all">{value}</span>
    </div>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  return direction === 'IN' ? (
    <span className="badge bg-blue-500/15 text-blue-400 border border-blue-500/20">↓ IN</span>
  ) : (
    <span className="badge bg-violet-500/15 text-violet-400 border border-violet-500/20">↑ OUT</span>
  )
}

export function ChargerDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const live    = useChargerStore((s) => s.liveState[id ?? ''])
  
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(1)

  const { data: charger } = useQuery<Charger>({
    queryKey: ['charger', id],
    queryFn:  () => api.getCharger(id!),
    enabled:  !!id,
    refetchInterval: 10000,
  })

  // Security Management State
  const [secProfile, setSecProfile] = useState<number>(0)
  const [authKey, setAuthKey] = useState<string>('')
  const [authEnabled, setAuthEnabled] = useState<boolean>(false)
  const [showKey, setShowKey] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<boolean>(false)
  const [secFeedback, setSecFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [savingSec, setSavingSec] = useState<boolean>(false)

  useEffect(() => {
    if (charger) {
      setSecProfile(charger.security_profile ?? 0)
      setAuthKey(charger.auth_password || '')
      setAuthEnabled(charger.auth_enabled ?? false)
    }
  }, [charger])

  const handleSaveSecurity = async () => {
    if (!charger) return
    setSavingSec(true)
    setSecFeedback(null)
    try {
      await api.updateChargerSecurity(charger.charge_point_id, {
        security_profile: secProfile,
        auth_password: authKey,
        auth_enabled: authEnabled || secProfile >= 1,
      })
      setSecFeedback({ type: 'success', message: 'Configurações de segurança guardadas com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['charger', id] })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao guardar: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 4000)
    }
  }

  const handleGenerateKey = async () => {
    if (!charger) return
    setSavingSec(true)
    try {
      const res = await api.generateChargerKey(charger.charge_point_id)
      setAuthKey(res.authorization_key)
      setSecFeedback({ type: 'success', message: 'Nova AuthorizationKey gerada e associada!' })
      queryClient.invalidateQueries({ queryKey: ['charger', id] })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao gerar chave: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 4000)
    }
  }

  const handleSyncKey = async () => {
    if (!charger) return
    setSavingSec(true)
    try {
      const res = await api.syncChargerKey(charger.charge_point_id)
      setSecFeedback({ type: 'success', message: `Comando ChangeConfiguration(AuthorizationKey) aceite pelo posto: ${res.status}` })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Falha ao sincronizar com o posto: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setSavingSec(false)
      setTimeout(() => setSecFeedback(null), 5000)
    }
  }

  const handleCopyKey = () => {
    if (!authKey) return
    navigator.clipboard.writeText(authKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const { data: messages = [] } = useQuery<OcppMessage[]>({
    queryKey: ['messages', id],
    queryFn:  () => api.getMessages(id!),
    enabled:  !!id,
    refetchInterval: 5000,
  })

  const { data: successRates = {} } = useQuery({
    queryKey: ['successRate', id],
    queryFn:  () => api.getChargingSuccessRate(id!),
    enabled:  !!id,
    refetchInterval: 30000,
  })

  const isOnline   = live?.isOnline ?? charger?.is_online ?? false
  const connectors = (() => {
    const connectorMap = new Map<number, {
      connector_id: number
      status: string
      error_code?: string | null
      updated_at?: string | null
    }>()

    for (const connector of charger?.connectors || []) {
      connectorMap.set(connector.connector_id, {
        connector_id: connector.connector_id,
        status: connector.status,
        error_code: connector.error_code ?? null,
        updated_at: connector.updated_at ?? null,
      })
    }

    for (const [cid, connector] of Object.entries(live?.connectors || {})) {
      connectorMap.set(Number(cid), {
        connector_id: Number(cid),
        status: connector.status,
        error_code: connector.errorCode ?? null,
        updated_at: null,
      })
    }

    if (connectorMap.size === 0) {
      return [{ connector_id: 1, status: isOnline ? (charger?.status || 'Available') : 'Offline', error_code: null, updated_at: null }]
    }

    return Array.from(connectorMap.values()).sort((a, b) => a.connector_id - b.connector_id)
  })()

  const isCharging = connectors.some((c) => c.status === 'Charging')

  const FRIENDLY_MEASURANDS: Record<string, string> = {
    'Voltage': 'Tensão',
    'Power.Active.Import': 'Potência Ativa',
    'Power.Offered': 'Potência Oferecida',
    'Current.Import': 'Corrente',
    'Current.Offered': 'Corrente Oferecida',
    'Energy.Active.Import.Register': 'Energia Total',
    'SoC': 'Bateria (SoC)',
    'Temperature': 'Temperatura',
  }

  const liveMeters = live?.meters
    ? Object.entries(live.meters).map(([measurand, data]) => ({
        key: measurand,
        label: FRIENDLY_MEASURANDS[measurand] || measurand,
        value: typeof data.value === 'number' ? data.value.toLocaleString('pt-PT', { maximumFractionDigits: 2 }) : data.value,
        unit: data.unit || '',
        timestamp: data.timestamp,
      }))
    : []
  
  // Filter liveMeters to only show when selected connector is actively charging
  const selectedConnector = connectors.find((c) => c.connector_id === selectedConnectorId)
  const isSelectedConnectorActive = selectedConnector && (selectedConnector.status === 'Charging' || selectedConnector.status === 'SuspendedEV' || selectedConnector.status === 'SuspendedEVSE')
  const displayedLiveMeters = isSelectedConnectorActive ? liveMeters : []

  if (!charger) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 text-gray-700 animate-pulse-slow" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* back + header */}
      <div className="flex items-start gap-4">
        <Link to="/" className="btn-ghost p-2 mt-0.5 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`relative p-2.5 rounded-xl ${
              isCharging ? 'bg-blue-500/20 animate-glow-blue'
              : isOnline ? 'bg-emerald-500/15'
              : 'bg-gray-800'
            }`}>
              <Zap className={`w-5 h-5 ${isCharging ? 'text-blue-400 animate-charge-bolt' : isOnline ? 'text-emerald-400' : 'text-gray-600'}`}
                fill={isCharging ? 'currentColor' : 'none'} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">{charger.charge_point_id}</h1>
              <p className="text-sm text-gray-600">{charger.vendor} · {charger.model}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                (charger.security_profile ?? 0) === 2
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : (charger.security_profile ?? 0) === 1
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                <Shield className="w-3.5 h-3.5" />
                {(charger.security_profile ?? 0) === 2 ? 'Profile 2 (TLS+Basic)' : (charger.security_profile ?? 0) === 1 ? 'Profile 1 (Basic Auth)' : 'Profile 0 (Aberto)'}
              </span>

              {isOnline ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-gray-500 text-xs font-medium border border-gray-700/40">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* left column */}
        <div className="space-y-5">
          {/* device info */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dispositivo</h3>
            </div>
            <InfoRow label="Charge Point ID" value={charger.charge_point_id} />
            <InfoRow label="Fabricante"  value={charger.vendor} />
            <InfoRow label="Modelo"      value={charger.model} />
            <InfoRow label="Firmware"    value={charger.firmware_version} />
            <InfoRow label="Nº Série"    value={charger.serial_number} />
            <InfoRow label="ICCID"       value={charger.iccid} />
            <InfoRow label="IMSI"        value={charger.imsi} />
            <InfoRow label="IP"          value={charger.client_ip} />
            <InfoRow label="Fuso Horário" value={charger.timezone || "Europe/Lisbon"} />
            <InfoRow label="Registado"   value={safeFormatDate(charger.registered_at)} />
            <InfoRow label="Último sinal" value={safeFormatDistance(charger.last_seen)} />
          </div>

          {/* Security Management Card */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Segurança & Autenticação</h3>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                secProfile === 2 ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : secProfile === 1 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {secProfile === 2 ? 'Profile 2 (TLS)' : secProfile === 1 ? 'Profile 1 (Basic)' : 'Profile 0 (Aberto)'}
              </span>
            </div>

            {/* Feedback alert */}
            {secFeedback && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                secFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}>
                {secFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                <span>{secFeedback.message}</span>
              </div>
            )}

            {/* Profile Selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Perfil de Segurança (OCPP 1.6)</label>
              <select
                value={secProfile}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setSecProfile(val)
                  if (val >= 1) setAuthEnabled(true)
                }}
                className="select w-full text-xs py-2 bg-gray-900/90 border-white/10"
              >
                <option value={0}>Profile 0 — Não seguro / Aberto (ws:// sem password)</option>
                <option value={1}>Profile 1 — HTTP Basic Auth (ws:// com password)</option>
                <option value={2}>Profile 2 — TLS + Basic Auth (wss:// encriptado com password)</option>
              </select>
            </div>

            {/* AuthorizationKey (Password) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 font-medium">AuthorizationKey (Password)</label>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={savingSec}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                >
                  <Sparkles className="w-3 h-3" /> Gerar Chave Segura
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  placeholder="Introduza ou gere a password do posto"
                  className="input pr-20 text-xs font-mono bg-gray-900/90 border-white/10 w-full"
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

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveSecurity}
                disabled={savingSec}
                className="btn-primary flex-1 text-xs py-2 rounded-lg flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{savingSec ? 'A guardar...' : 'Guardar Segurança'}</span>
              </button>

              <button
                type="button"
                onClick={handleSyncKey}
                disabled={savingSec || !isOnline || !authKey}
                className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all"
                title={isOnline ? 'Enviar chave ao posto via OCPP ChangeConfiguration' : 'Posto offline'}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Sincronizar no Posto</span>
              </button>
            </div>

            {/* Connection instructions preview */}
            {authKey && secProfile >= 1 && (
              <div className="p-2.5 rounded-lg bg-white/4 border border-white/8 space-y-1">
                <span className="text-[10px] text-gray-400 font-medium">Cabeçalho HTTP Basic para o Carregador:</span>
                <p className="text-[10px] font-mono text-gray-300 break-all bg-gray-900/80 p-1.5 rounded border border-white/5 select-all">
                  Authorization: Basic {btoa(`${charger.charge_point_id}:${authKey}`)}
                </p>
              </div>
            )}
          </div>

          {/* connectors */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conectores</h3>
            </div>
            {connectors.length === 0 ? (
              <p className="text-xs text-gray-700">Sem dados de conector</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectors.map((c) => (
                  <button
                    key={c.connector_id}
                    onClick={() => setSelectedConnectorId(c.connector_id)}
                    className={`cursor-pointer transition-all relative group ${
                      selectedConnectorId === c.connector_id
                        ? 'ring-2 ring-blue-400 shadow-md shadow-blue-500/30 scale-105'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ConnectorBadge connectorId={c.connector_id} status={c.status} errorCode={(c as { error_code?: string }).error_code} />
                    {successRates[String(c.connector_id)] && (
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-gray-900/95 text-gray-200 px-2 py-1 rounded whitespace-nowrap border border-gray-700/50 pointer-events-none">
                        {successRates[String(c.connector_id)].success_rate.toFixed(1)}% sucesso
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Charging Success Rate Cards */}
          {Object.keys(successRates).length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa de Sucesso por Tomada</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(successRates).map(([connectorId, data]) => (
                  <div key={connectorId} className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Tomada {connectorId}</span>
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
          {displayedLiveMeters.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Leituras live</h3>
                <span className="live-pill ml-auto">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  LIVE
                </span>
              </div>
              <div className="space-y-2">
                {displayedLiveMeters.map((m) => (
                  <div key={m.key} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-gray-400 font-medium truncate max-w-[55%]">{m.label}</span>
                    <span className="text-xs font-mono text-amber-300 font-bold">{m.value} {m.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right columns */}
        <div className="xl:col-span-2 space-y-5">
          {/* availability monitor */}
          <AvailabilityMonitor chargePointId={charger.charge_point_id} />

          {/* meter chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">MeterValues</h3>
              <span className="text-xs text-gray-600 font-mono">Conector #{selectedConnectorId}</span>
            </div>
            <MeterChart key={`${charger.charge_point_id}-${selectedConnectorId}`} cpId={charger.charge_point_id} connectorId={selectedConnectorId} />
          </div>

          {/* events */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Eventos</h3>
            </div>
            <EventLog cpId={charger.charge_point_id} maxHeight="280px" />
          </div>

          {/* message log */}
          {messages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-gray-600" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Log OCPP</h3>
                <span className="text-xs text-gray-700 ml-auto">{messages.length} msgs</span>
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="border-b border-white/6" style={{ background: 'rgba(10,14,26,0.95)' }}>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Dir</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Action</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Timestamp</th>
                        <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.slice(0, 50).map((m) => (
                        <tr key={m.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                          <td className="px-4 py-2"><DirectionBadge direction={m.direction} /></td>
                          <td className="px-4 py-2 font-mono text-gray-300">{m.action}</td>
                          <td className="px-4 py-2 text-gray-600 font-mono whitespace-nowrap">
                            {format(new Date(m.timestamp), 'HH:mm:ss')}
                          </td>
                          <td className="px-4 py-2 text-gray-700 font-mono truncate max-w-xs">
                            {typeof m.payload === 'string' ? m.payload.substring(0, 80) : JSON.stringify(m.payload).substring(0, 80)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
