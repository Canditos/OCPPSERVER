import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'
import { safeFormatDate, safeFormatDistance } from '../utils/date'
import {
  ArrowLeft, Cpu, Wifi, WifiOff, Activity, MessageSquare, Zap, CheckCircle2,
  Shield, Key, Lock, Unlock, Copy, Eye, EyeOff, Sparkles, RefreshCw, Send, AlertTriangle, Check,
  FileText, Download, Trash2, ShieldAlert, Award, X
} from 'lucide-react'

import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import { EventLog } from '../components/EventLog'
import { ConnectorBadge } from '../components/ConnectorBadge'
import { AvailabilityMonitor } from '../components/AvailabilityMonitor'
import { useChargerStore } from '../store/chargerStore'
import type { Charger, OcppMessage, Certificate, IssueClientCertResponse } from '../types'

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

  // Certificate Management State
  const { data: certs = [], refetch: refetchCerts } = useQuery<Certificate[]>({
    queryKey: ['certificates', id],
    queryFn: () => api.getChargerCertificates(id!),
    enabled: !!id,
    refetchInterval: 15000,
  })

  const [certFeedback, setCertFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [certLoading, setCertLoading] = useState<boolean>(false)
  const [inspectCert, setInspectCert] = useState<Certificate | null>(null)
  const [newClientCert, setNewClientCert] = useState<IssueClientCertResponse | null>(null)

  const handleInstallRootCa = async () => {
    if (!charger) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.installCertificate(charger.charge_point_id, {
        certificate_type: 'CentralSystemRootCertificate',
      })
      setCertFeedback({ type: 'success', message: `Root CA enviada ao posto via InstallCertificate (${res.status})` })
      refetchCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao instalar CA no posto: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 5000)
    }
  }

  const handleQueryDeviceCerts = async () => {
    if (!charger) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.queryInstalledCertificates(charger.charge_point_id)
      const count = res.certificate_hash_data ? res.certificate_hash_data.length : 0
      setCertFeedback({ type: 'success', message: `Consulta concluída: ${count} certificado(s) reportados pelo posto (${res.status})` })
      refetchCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao consultar certificados no posto: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 5000)
    }
  }

  const handleIssueClientCert = async () => {
    if (!charger) return
    setCertLoading(true)
    setCertFeedback(null)
    try {
      const res = await api.issueClientCert(charger.charge_point_id, { validity_days: 365 })
      setNewClientCert(res)
      setCertFeedback({ type: 'success', message: 'Novo Certificado de Cliente X.509 emitido com sucesso!' })
      refetchCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao emitir certificado: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
    }
  }

  const handleDeleteCert = async (certId: number) => {
    if (!charger || !confirm('Tem a certeza que deseja remover este registo de certificado?')) return
    setCertLoading(true)
    try {
      await api.deleteCertificate(charger.charge_point_id, certId)
      setCertFeedback({ type: 'success', message: 'Certificado removido do sistema!' })
      refetchCerts()
    } catch (err: any) {
      setCertFeedback({ type: 'error', message: `Erro ao remover: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setCertLoading(false)
      setTimeout(() => setCertFeedback(null), 4000)
    }
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
                    <div className="ml-auto flex items-center gap-2">
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                (charger.security_profile ?? 0) === 3
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : (charger.security_profile ?? 0) === 2
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : (charger.security_profile ?? 0) === 1
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                <Shield className="w-3.5 h-3.5" />
                {(charger.security_profile ?? 0) === 3
                  ? 'Profile 3 (mTLS)'
                  : (charger.security_profile ?? 0) === 2
                  ? 'Profile 2 (TLS+Basic)'
                  : (charger.security_profile ?? 0) === 1
                  ? 'Profile 1 (Basic Auth)'
                  : 'Profile 0 (Aberto)'}
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
                secProfile === 3 ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                : secProfile === 2 ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : secProfile === 1 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {secProfile === 3 ? 'Profile 3 (mTLS)' : secProfile === 2 ? 'Profile 2 (TLS)' : secProfile === 1 ? 'Profile 1 (Basic)' : 'Profile 0 (Open)'}
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
                <option value={3}>Profile 3 — mTLS (TLS Mútuo com Certificados Digitais X.509)</option>
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
          {/* Certificate Management Card (Security Profile 3) */}
          <div className="card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/25">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    Certificados Digitais X.509 & mTLS
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono">
                      Profile 3
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Infraestrutura de Chaves Públicas (PKI), Root CA do CSMS e certificados de hardware
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={api.getRootCaUrl()}
                  download="csms_root_ca.crt"
                  className="btn bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 transition-all"
                  title="Descarregar certificado Root CA (.crt) para importar no posto ou browser"
                >
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  <span>Baixar Root CA</span>
                </a>

                <button
                  type="button"
                  onClick={handleInstallRootCa}
                  disabled={certLoading || !isOnline}
                  className="btn bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
                  title={isOnline ? 'Enviar Root CA do CSMS ao posto via OCPP InstallCertificate' : 'Posto offline'}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Instalar CA no Posto</span>
                </button>

                <button
                  type="button"
                  onClick={handleQueryDeviceCerts}
                  disabled={certLoading || !isOnline}
                  className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-all"
                  title={isOnline ? 'Consultar certificados no posto via OCPP GetInstalledCertificateIds' : 'Posto offline'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${certLoading ? 'animate-spin' : ''}`} />
                  <span>Consultar no Posto</span>
                </button>

                <button
                  type="button"
                  onClick={handleIssueClientCert}
                  disabled={certLoading}
                  className="btn-primary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Emitir Certificado de Cliente</span>
                </button>
              </div>
            </div>

            {/* Feedback alert */}
            {certFeedback && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                certFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}>
                {certFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                <span>{certFeedback.message}</span>
              </div>
            )}

            {/* Certificates Table */}
            {certs.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/2 border border-white/5 text-center">
                <FileText className="w-5 h-5 text-gray-500 mx-auto mb-1 opacity-70" />
                <p className="text-xs text-gray-400 font-medium">Nenhum certificado registado para este carregador.</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Clica em "Emitir Certificado de Cliente" para gerar um par de chaves X.509 ou "Instalar CA no Posto".</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-950/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 border-b border-white/10 text-[11px] text-gray-400 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Tipo / Função</th>
                      <th className="py-2.5 px-3">Common Name (CN)</th>
                      <th className="py-2.5 px-3">Emissor</th>
                      <th className="py-2.5 px-3">Nº Série</th>
                      <th className="py-2.5 px-3">Validade</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {certs.map((c) => {
                      const isRootCa = c.certificate_type === 'CentralSystemRootCertificate'
                      return (
                        <tr key={c.id} className="transition-colors hover:bg-white/5">
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isRootCa ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {isRootCa ? '🏛️ CSMS Root CA' : '⚡ Client (EVSE)'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-200 font-sans font-medium whitespace-nowrap">
                            {c.subject_cn || (isRootCa ? 'Canditos Root CA' : charger.charge_point_id)}
                          </td>
                          <td className="py-2 px-3 text-gray-400 font-sans text-[11px] whitespace-nowrap">
                            {c.issuer_cn || 'Canditos CSMS Root CA'}
                          </td>
                          <td className="py-2 px-3 text-gray-400 text-[11px] truncate max-w-[120px]" title={c.serial_number}>
                            {c.serial_number.slice(0, 12)}…
                          </td>
                          <td className="py-2 px-3 text-gray-400 text-[11px] whitespace-nowrap">
                            {c.valid_to ? safeFormatDate(c.valid_to) : '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              c.status === 'InstalledOnDevice'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : c.status === 'Active'
                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/25'
                                : 'bg-red-500/15 text-red-300 border-red-500/25'
                            }`}>
                              {c.status === 'InstalledOnDevice' ? 'Instalado no Posto' : c.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap space-x-1 font-sans">
                            <button
                              type="button"
                              onClick={() => setInspectCert(c)}
                              className="btn-ghost p-1 text-gray-400 hover:text-white rounded"
                              title="Ver Detalhes do Certificado (PEM)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {!isRootCa && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCert(c.id)}
                                className="btn-ghost p-1 text-red-400 hover:text-red-300 rounded"
                                title="Remover Certificado"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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

      {/* Inspect Certificate Modal */}
      {inspectCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setInspectCert(null)}
        >
          <div
            className="w-full max-w-2xl bg-gray-900 border border-white/15 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">{inspectCert.subject_cn || 'Certificado X.509'}</h3>
                  <p className="text-xs text-gray-400">{inspectCert.certificate_type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Emissor (Issuer)</span>
                <span className="font-semibold text-gray-200">{inspectCert.issuer_cn || 'Canditos CSMS Root CA'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Número de Série</span>
                <span className="font-mono text-gray-200 truncate block" title={inspectCert.serial_number}>{inspectCert.serial_number}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Válido De</span>
                <span className="font-mono text-gray-200">{inspectCert.valid_from ? safeFormatDate(inspectCert.valid_from) : '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/6 space-y-1">
                <span className="text-gray-500 block text-[10px]">Válido Até</span>
                <span className="font-mono text-emerald-400">{inspectCert.valid_to ? safeFormatDate(inspectCert.valid_to) : '—'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">Conteúdo do Certificado (PEM Format)</label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inspectCert.certificate_pem)
                    alert('Certificado copiado para a área de transferência!')
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar PEM
                </button>
              </div>
              <textarea
                readOnly
                value={inspectCert.certificate_pem}
                rows={8}
                className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-gray-300 select-all focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([inspectCert.certificate_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${(inspectCert.subject_cn || 'cert').toLowerCase().replace(/\s+/g, '_')}.crt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Descarregar Ficheiro .crt
              </button>
              <button
                type="button"
                onClick={() => setInspectCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freshly Issued Client Certificate Modal */}
      {newClientCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setNewClientCert(null)}
        >
          <div
            className="w-full max-w-2xl bg-gray-900 border border-emerald-500/30 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">Certificado de Cliente X.509 Emitido!</h3>
                  <p className="text-xs text-gray-400 font-mono">{newClientCert.charge_point_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Atenção:</strong> Guarda a Chave Privada (<code className="font-mono text-amber-200">.key</code>) num local seguro agora. Por motivos de segurança estrita, o par de chaves privadas não é guardado em texto simples no servidor.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Certificado X.509 (.crt / .pem)</label>
                <textarea
                  readOnly
                  value={newClientCert.certificate_pem}
                  rows={6}
                  className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-gray-300 select-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Chave Privada (.key / .pem)</label>
                <textarea
                  readOnly
                  value={newClientCert.private_key_pem}
                  rows={6}
                  className="w-full bg-gray-950/90 border border-white/10 rounded-xl p-2.5 font-mono text-[10px] text-amber-300 select-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-white/10 justify-end">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([newClientCert.certificate_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${newClientCert.charge_point_id}_client.crt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descarregar Certificado (.crt)
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([newClientCert.private_key_pem], { type: 'application/x-pem-file' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${newClientCert.charge_point_id}_client.key`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="btn bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descarregar Chave Privada (.key)
              </button>

              <button
                type="button"
                onClick={() => setNewClientCert(null)}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
