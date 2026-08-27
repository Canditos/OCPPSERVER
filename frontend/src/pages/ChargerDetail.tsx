import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import React, { useState, useEffect } from 'react'
import { safeFormatDate, safeFormatDistance } from '../utils/date'
import {
  ArrowLeft, Cpu, Wifi, WifiOff, Activity, MessageSquare, Zap, CheckCircle2,
  Shield, ShieldCheck, Key, Lock, Unlock, Copy, Eye, EyeOff, Sparkles, RefreshCw, Send, AlertTriangle, Check,
  FileText, Download, Trash2, ShieldAlert, Award, X, ChevronDown, ChevronUp, BarChart3, Layers,
  Maximize2, Minimize2, Search, Filter, Code, ChevronRight
} from 'lucide-react'

import { api, MeterKeyData } from '../api'
import { MeterChart } from '../components/MeterChart'
import { EventLog } from '../components/EventLog'
import { ConnectorBadge } from '../components/ConnectorBadge'
import { AvailabilityMonitor } from '../components/AvailabilityMonitor'
import { DeviceModelTab } from '../components/DeviceModelTab'
import { useChargerStore } from '../store/chargerStore'
import { useI18n } from '../i18n'
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
    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-500/25 text-blue-300 border border-blue-400/50">
      ↓ IN
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/25 text-purple-300 border border-purple-400/50">
      ↑ OUT
    </span>
  )
}

export function ChargerDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const live    = useChargerStore((s) => s.liveState[id ?? ''])
  
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(1)

  // LEM DCBM Meter Keys (Eichrecht / OCMF)
  const { data: meterKeys = [], refetch: refetchMeterKeys } = useQuery<MeterKeyData[]>({
    queryKey: ['meterKeys', id],
    queryFn: () => api.getMeterKeys(id!),
    enabled: Boolean(id),
  })

  const [lemConnectorId, setLemConnectorId] = useState<number>(1)
  const [lemModel, setLemModel] = useState<string>('LEM DCBM 400')
  const [lemSerial, setLemSerial] = useState<string>('')
  const [lemPubKeyHex, setLemPubKeyHex] = useState<string>('')
  const [lemCurve, setLemCurve] = useState<string>('secp256r1')
  const [lemSaving, setLemSaving] = useState<boolean>(false)
  const [lemFeedback, setLemFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleSaveMeterKey = async () => {
    if (!id || !lemPubKeyHex.trim()) return
    setLemSaving(true)
    setLemFeedback(null)
    try {
      await api.createOrUpdateMeterKey(id, {
        connector_id: lemConnectorId,
        meter_model: lemModel,
        serial_number: lemSerial.trim() || undefined,
        public_key_hex: lemPubKeyHex.trim(),
        curve_name: lemCurve,
      })
      setLemFeedback({ type: 'success', message: `Chave pública do medidor LEM guardada com sucesso para a Tomada #${lemConnectorId}!` })
      setLemPubKeyHex('')
      setLemSerial('')
      refetchMeterKeys()
    } catch (err: any) {
      setLemFeedback({ type: 'error', message: err?.response?.data?.detail || err?.message || 'Erro ao guardar chave' })
    } finally {
      setLemSaving(false)
      setTimeout(() => setLemFeedback(null), 5000)
    }
  }

  const handleDeleteMeterKey = async (keyId: number) => {
    if (!id || !confirm('Deseja remover esta chave de medidor LEM?')) return
    try {
      await api.deleteMeterKey(id, keyId)
      refetchMeterKeys()
    } catch (err: any) {
      alert('Erro ao remover: ' + (err?.response?.data?.detail || err.message))
    }
  }
  const [activeTab, setActiveTab] = useState<'telemetry' | 'devicemodel' | 'security' | 'logs'>('telemetry')
  const [showHttpHeader, setShowHttpHeader] = useState<boolean>(false)
  const [showSecurityCard, setShowSecurityCard] = useState<boolean>(false)

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

  const [msgFilterAction, setMsgFilterAction] = useState<string>('all')
  const [msgFilterTx, setMsgFilterTx] = useState<string>('all')
  const [msgSearch, setMsgSearch] = useState<string>('')
  const [isLogExpanded, setIsLogExpanded] = useState<boolean>(false)
  const [inspectMessage, setInspectMessage] = useState<OcppMessage | null>(null)
  const [copiedPayloadId, setCopiedPayloadId] = useState<number | null>(null)
  const [expandedMsgId, setExpandedMsgId] = useState<number | null>(null)

  const formatPayloadJson = (payload: unknown) => {
    if (typeof payload === 'string') {
      try {
        return JSON.stringify(JSON.parse(payload), null, 2)
      } catch {
        return payload
      }
    }
    return JSON.stringify(payload, null, 2)
  }

  const copyPayloadText = (msg: OcppMessage) => {
    const str = formatPayloadJson(msg.payload)
    navigator.clipboard.writeText(str)
    setCopiedPayloadId(msg.id)
    setTimeout(() => setCopiedPayloadId(null), 2000)
  }

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
    queryFn:  () => api.getMessages(id!, 1000),
    enabled:  !!id,
    refetchInterval: 5000,
  })

  const availableTransactions = React.useMemo(() => {
    const txSet = new Set<string>()
    for (const m of messages) {
      if (!m.payload) continue
      const p = m.payload
      if (typeof p === 'object' && p !== null) {
        if ('transaction_id' in p && (p as any).transaction_id) txSet.add(String((p as any).transaction_id))
        if ('transactionId' in p && (p as any).transactionId) txSet.add(String((p as any).transactionId))
      } else if (typeof p === 'string') {
        const match = p.match(/"transaction_?id"\s*:\s*(\d+)/i)
        if (match) txSet.add(match[1])
      }
    }
    return Array.from(txSet).sort((a, b) => Number(b) - Number(a))
  }, [messages])

  const filteredMessages = messages.filter((m) => {
    if (msgFilterAction !== 'all') {
      if (msgFilterAction === 'security') {
        const secActions = ['InstallCertificate', 'GetInstalledCertificateIds', 'DeleteCertificate', 'ExtendedTriggerMessage', 'CertificateSigned', 'SignCertificate']
        if (!secActions.includes(m.action)) return false
      } else if (m.action !== msgFilterAction) {
        return false
      }
    }
    if (msgFilterTx !== 'all') {
      const p = m.payload
      let txMatch = false
      if (typeof p === 'object' && p !== null) {
        if (String((p as any).transaction_id) === msgFilterTx || String((p as any).transactionId) === msgFilterTx) {
          txMatch = true
        }
      } else if (typeof p === 'string') {
        if (p.includes(`"transaction_id": ${msgFilterTx}`) || p.includes(`"transaction_id":${msgFilterTx}`) || p.includes(`"transactionId": ${msgFilterTx}`) || p.includes(`"transactionId":${msgFilterTx}`)) {
          txMatch = true
        }
      }
      if (!txMatch) return false
    }
    if (msgSearch.trim()) {
      const q = msgSearch.toLowerCase()
      const payloadStr = typeof m.payload === 'string' ? m.payload.toLowerCase() : JSON.stringify(m.payload).toLowerCase()
      if (!m.action.toLowerCase().includes(q) && !payloadStr.includes(q)) {
        return false
      }
    }
    return true
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
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer hover:scale-105 transition-all ${
                  (charger.security_profile ?? 0) === 3
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                    : (charger.security_profile ?? 0) === 2
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                    : (charger.security_profile ?? 0) === 1
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                }`}
                title="Clique para abrir o separador de Certificados & Segurança"
              >
                <Shield className="w-3.5 h-3.5" />
                {(charger.security_profile ?? 0) === 3
                  ? 'Profile 3 (mTLS)'
                  : (charger.security_profile ?? 0) === 2
                  ? 'Profile 2 (TLS+Basic)'
                  : (charger.security_profile ?? 0) === 1
                  ? 'Profile 1 (Basic Auth)'
                  : 'Profile 0 (Aberto)'}
              </button>

              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${
                charger.ocpp_version === '2.0.1'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                <Cpu className="w-3.5 h-3.5" />
                {charger.ocpp_version === '2.0.1' ? 'OCPP 2.0.1 (PnC)' : 'OCPP 1.6-J'}
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

          {/* Security Management Card (Collapsible) */}
          <div className="card space-y-3">
            <div
              onClick={() => setShowSecurityCard(!showSecurityCard)}
              className="flex items-center justify-between cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Segurança & Autenticação</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                  secProfile === 3 ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : secProfile === 2 ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : secProfile === 1 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}>
                  {secProfile === 3 ? 'Profile 3 (mTLS)' : secProfile === 2 ? 'Profile 2 (TLS)' : secProfile === 1 ? 'Profile 1 (Basic)' : 'Profile 0 (Open)'}
                </span>
                <button
                  type="button"
                  className="p-1 rounded-lg bg-white/5 text-gray-400 group-hover:text-white"
                >
                  {showSecurityCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {showSecurityCard && (
              <div className="space-y-4 pt-3 border-t border-white/6 animate-fade-in">
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
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
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
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                        title={showKey ? 'Ocultar' : 'Mostrar'}
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyKey}
                        disabled={!authKey}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
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
                    className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                    title={isOnline ? 'Enviar chave ao posto via OCPP ChangeConfiguration' : 'Posto offline'}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Sincronizar no Posto</span>
                  </button>
                </div>

                {/* Connection instructions preview (collapsible) */}
                {authKey && secProfile >= 1 && (
                  <div className="rounded-lg bg-white/4 border border-white/8 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setShowHttpHeader(!showHttpHeader)}
                      className="w-full p-2.5 flex items-center justify-between text-gray-400 hover:text-gray-200 transition-colors text-[11px] font-medium cursor-pointer"
                    >
                      <span>Cabeçalho HTTP Basic</span>
                      <span className="flex items-center gap-1 text-[10px] text-blue-400">
                        {showHttpHeader ? 'Ocultar' : 'Ver cabeçalho'}
                        {showHttpHeader ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </span>
                    </button>
                    {showHttpHeader && (
                      <div className="p-2.5 pt-0 border-t border-white/5 space-y-1">
                        <p className="text-[10px] font-mono text-gray-300 break-all bg-gray-900/90 p-2 rounded border border-white/5 select-all">
                          Authorization: Basic {btoa(`${charger.charge_point_id}:${authKey}`)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LEM DCBM Meters & Eichrecht (OCMF) Configuration Card */}
          <div className="card space-y-3.5 border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/8 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-gray-200 uppercase tracking-wider">
                    Medidores LEM & Eichrecht (OCMF)
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-gray-400">
                    Chaves públicas ECDSA para validação de medições legais S.A.F.E.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                {meterKeys.length} configurados
              </span>
            </div>

            {/* List of Configured Keys */}
            {meterKeys.length > 0 && (
              <div className="space-y-2">
                {meterKeys.map((mk) => (
                  <div key={mk.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/6 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">Tomada #{mk.connector_id}</span>
                        <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-bold">{mk.meter_model}</span>
                        {mk.serial_number && (
                          <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400">S/N: {mk.serial_number}</span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-gray-400 truncate max-w-xs mt-0.5 select-all">
                        Key: {mk.public_key_hex.slice(0, 24)}… ({mk.curve_name})
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteMeterKey(mk.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Remover Chave"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Form to Add/Update Meter Key */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-700 dark:text-gray-300 block">
                Registar / Atualizar Chave Pública do Medidor
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Tomada / Conector:</label>
                  <select
                    value={lemConnectorId}
                    onChange={(e) => setLemConnectorId(Number(e.target.value))}
                    className="select text-xs py-1.5 w-full"
                  >
                    <option value={1}>Tomada #1</option>
                    <option value={2}>Tomada #2</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Modelo do Medidor:</label>
                  <select
                    value={lemModel}
                    onChange={(e) => setLemModel(e.target.value)}
                    className="select text-xs py-1.5 w-full"
                  >
                    <option value="LEM DCBM 400">LEM DCBM 400 (DC)</option>
                    <option value="LEM DCBM 600">LEM DCBM 600 (DC)</option>
                    <option value="LEM DCBM 100">LEM DCBM 100 (DC)</option>
                    <option value="Isabellenhuette">Isabellenhütte (DC)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Chave Pública ECDSA (Hex 04... ou PEM):</label>
                <input
                  type="text"
                  value={lemPubKeyHex}
                  onChange={(e) => setLemPubKeyHex(e.target.value)}
                  placeholder="04039b53..."
                  className="input text-xs font-mono py-1.5 w-full"
                />
              </div>

              {lemFeedback && (
                <div className={`p-2 rounded-lg text-xs ${
                  lemFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {lemFeedback.message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveMeterKey}
                disabled={lemSaving || !lemPubKeyHex.trim()}
                className="btn bg-purple-600 hover:bg-purple-500 text-white text-xs w-full py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{lemSaving ? 'A guardar…' : 'Guardar Chave do Medidor LEM'}</span>
              </button>
            </div>
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

        {/* right columns with Tab Navigation */}
        <div className="xl:col-span-2 space-y-5">
          {/* Tab navigation pills with High Visibility & Contrast */}
          <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-gray-900/90 border border-slate-200 dark:border-white/15 rounded-2xl shadow-md dark:shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border border-blue-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <BarChart3 className={`w-4 h-4 ${activeTab === 'telemetry' ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`} />
              <span>{t('chargerDetail.tabs.telemetry')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('devicemodel')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'devicemodel'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 border border-indigo-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <Layers className={`w-4 h-4 ${activeTab === 'devicemodel' ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
              <span>{t('chargerDetail.tabs.deviceModel')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-purple-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <Award className={`w-4 h-4 ${activeTab === 'security' ? 'text-white' : 'text-purple-500 dark:text-purple-400'}`} />
              <span>{t('chargerDetail.tabs.certificates')}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                activeTab === 'security'
                  ? 'bg-white/25 text-white'
                  : 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/25 dark:text-purple-300 dark:border-purple-500/40'
              }`}>
                {certs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${activeTab === 'logs' ? 'text-white' : 'text-emerald-500 dark:text-emerald-400'}`} />
              <span>{t('chargerDetail.tabs.logs')}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                activeTab === 'logs'
                  ? 'bg-white/25 text-white'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/25 dark:text-emerald-300 dark:border-emerald-500/40'
              }`}>
                {messages.length}
              </span>
            </button>
          </div>

          {/* TAB: Device Model (OCPP 2.0.1) */}
          {activeTab === 'devicemodel' && (
            <DeviceModelTab
              chargerId={charger.charge_point_id}
              isOnline={isOnline}
              ocppVersion={charger.ocpp_version}
            />
          )}

          {/* TAB 1: Telemetry & Monitoring */}
          {activeTab === 'telemetry' && (
            <div className="space-y-5 animate-fade-in">
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
            </div>
          )}

          {/* TAB 2: X.509 Certificates & mTLS */}
          {activeTab === 'security' && (
            <div className="space-y-5 animate-fade-in">
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
                  <div className="overflow-x-auto rounded-xl border border-white/15 bg-gray-950/80 shadow-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-950 border-b border-white/15 text-[11px] text-gray-200 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-3">Tipo / Função</th>
                          <th className="py-3 px-3">Common Name (CN)</th>
                          <th className="py-3 px-3">Emissor</th>
                          <th className="py-3 px-3">Nº Série</th>
                          <th className="py-3 px-3">Validade</th>
                          <th className="py-3 px-3">Estado</th>
                          <th className="py-3 px-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 font-mono">
                        {certs.map((c) => {
                          const isRootCa = c.certificate_type === 'CentralSystemRootCertificate'
                          return (
                            <tr key={c.id} className="transition-colors hover:bg-white/8">
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isRootCa ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40' : 'bg-blue-500/25 text-blue-300 border border-blue-500/40'
                                }`}>
                                  {isRootCa ? '🏛️ CSMS Root CA' : '⚡ Client (EVSE)'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-white font-sans font-bold whitespace-nowrap">
                                {c.subject_cn || (isRootCa ? 'Canditos Root CA' : charger.charge_point_id)}
                              </td>
                              <td className="py-2.5 px-3 text-gray-300 font-sans text-xs whitespace-nowrap">
                                {c.issuer_cn || 'Canditos CSMS Root CA'}
                              </td>
                              <td className="py-2.5 px-3 text-gray-300 font-mono text-xs truncate max-w-[120px]" title={c.serial_number}>
                                {c.serial_number.slice(0, 12)}…
                              </td>
                              <td className="py-2.5 px-3 text-gray-300 font-mono text-xs whitespace-nowrap">
                                {c.valid_to ? safeFormatDate(c.valid_to) : '—'}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  c.status === 'InstalledOnDevice'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : c.status === 'Active'
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                    : 'bg-red-500/20 text-red-300 border-red-500/40'
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
            </div>
          )}

          {/* TAB 3: Logs & Events */}
          {activeTab === 'logs' && (
            <div className="space-y-5 animate-fade-in">
              {/* events */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    {t('chargerDetail.recentEvents')}
                  </h3>
                </div>
                <EventLog cpId={charger.charge_point_id} maxHeight="300px" />
              </div>

              {/* message log */}
              {messages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <h3 className="text-xs font-bold text-slate-900 dark:text-gray-200 uppercase tracking-wider">{t('chargerDetail.ocppLogTitle')}</h3>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-white/10">
                        {filteredMessages.length}/{messages.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Transaction Filter Dropdown */}
                      {availableTransactions.length > 0 && (
                        <div className="relative">
                          <select
                            value={msgFilterTx}
                            onChange={(e) => setMsgFilterTx(e.target.value)}
                            className="text-xs py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-blue-600 dark:text-blue-400 font-mono font-bold cursor-pointer focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">⚡ Todas as TX</option>
                            {availableTransactions.map((tx) => (
                              <option key={tx} value={tx}>TX #{tx}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Search box */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                        <input
                          type="text"
                          value={msgSearch}
                          onChange={(e) => setMsgSearch(e.target.value)}
                          placeholder={t("chargerDetail.filterPlaceholder")}
                          className="text-xs pl-8 pr-6 py-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
                        />
                        {msgSearch && (
                          <button
                            onClick={() => setMsgSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Expand / Maximize button */}
                      <button
                        type="button"
                        onClick={() => setIsLogExpanded(true)}
                        className="btn-ghost p-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                        title="Modo Zen / Expandir Log em Ecrã Inteiro"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Filter Action Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { id: 'all', label: t('chargerDetail.filterAll') },
                      { id: 'MeterValues', label: 'MeterValues' },
                      { id: 'Heartbeat', label: 'Heartbeat' },
                      { id: 'StatusNotification', label: 'Status' },
                      { id: 'Authorize', label: 'Authorize' },
                      { id: 'security', label: t('chargerDetail.filterSecurity') },
                    ].map((f) => {
                      const active = msgFilterAction === f.id
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setMsgFilterAction(f.id)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:border-white/5'
                          }`}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="card p-0 bg-white dark:bg-gray-900/90 border border-slate-200 dark:border-white/15 shadow-md dark:shadow-xl rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-gray-950">
                            <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">Dir</th>
                            <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">Action</th>
                            <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">Timestamp</th>
                            <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">Payload</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                          {filteredMessages.slice(0, 100).map((m) => {
                            const isExpanded = expandedMsgId === m.id
                            return (
                              <React.Fragment key={m.id}>
                                <tr
                                  onClick={() => setExpandedMsgId(isExpanded ? null : m.id)}
                                  className="hover:bg-blue-50/80 dark:hover:bg-blue-500/15 transition-colors group cursor-pointer"
                                >
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 dark:text-gray-500 group-hover:text-blue-500">
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </span>
                                      <DirectionBadge direction={m.direction} />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-slate-900 dark:text-white font-bold whitespace-nowrap">{m.action}</td>
                                  <td className="px-4 py-2.5 text-slate-600 dark:text-gray-300 font-mono font-semibold whitespace-nowrap">
                                    {format(new Date(m.timestamp), 'HH:mm:ss')}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-slate-800 dark:text-gray-200 text-xs">
                                    <div className="flex items-center gap-2 max-w-2xl">
                                      <span
                                        className="flex-1 truncate bg-slate-100 hover:bg-slate-200 dark:bg-black/60 dark:hover:bg-black/80 px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 transition-colors"
                                        title="Clique para expandir ou inspecionar o payload completo"
                                      >
                                        {typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setInspectMessage(m)
                                        }}
                                        className="shrink-0 p-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-bold flex items-center gap-1 px-2 transition-all cursor-pointer"
                                        title="Abrir Visualizador de Payload Completo"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Ver Total</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-slate-50/80 dark:bg-slate-950/60">
                                    <td colSpan={4} className="p-3 px-6">
                                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 space-y-2 shadow-inner">
                                        <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-gray-400">
                                          <span>Payload Completo ({m.action})</span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              copyPayloadText(m)
                                            }}
                                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
                                          >
                                            {copiedPayloadId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            <span>{copiedPayloadId === m.id ? 'Copiado!' : 'Copiar JSON'}</span>
                                          </button>
                                        </div>
                                        <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                                          {formatPayloadJson(m.payload)}
                                        </pre>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                          {filteredMessages.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-gray-400">
                                {t('chargerDetail.noMessagesFound')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
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

      {/* Fullscreen Zen Mode OCPP Log Modal */}
      {isLogExpanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setIsLogExpanded(false)}
        >
          <div
            className="flex-1 flex flex-col w-full max-w-7xl mx-auto bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Terminal OCPP em Tempo Real · Modo Zen
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      {filteredMessages.length} msgs
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                    Posto: {charger?.charge_point_id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Transaction Filter Dropdown */}
                {availableTransactions.length > 0 && (
                  <div className="relative">
                    <select
                      value={msgFilterTx}
                      onChange={(e) => setMsgFilterTx(e.target.value)}
                      className="text-xs py-1.5 px-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 text-blue-600 dark:text-blue-400 font-mono font-bold cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">⚡ Todas as TX</option>
                      {availableTransactions.map((tx) => (
                        <option key={tx} value={tx}>TX #{tx}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Search in modal */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    placeholder="Pesquisar payload ou ação..."
                    className="text-xs pl-8 pr-6 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 w-56 sm:w-72"
                  />
                  {msgSearch && (
                    <button
                      onClick={() => setMsgSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsLogExpanded(false)}
                  className="btn-ghost p-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  title="Fechar Modo Zen (Esc)"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Filter Pills */}
            <div className="flex items-center gap-1.5 p-3 border-b border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-gray-950/40 flex-wrap">
              {[
                { id: 'all', label: 'Todas as Ações' },
                { id: 'MeterValues', label: 'MeterValues' },
                { id: 'Heartbeat', label: 'Heartbeat' },
                { id: 'StatusNotification', label: 'StatusNotification' },
                { id: 'Authorize', label: 'Authorize' },
                { id: 'security', label: 'Segurança / Certificados' },
              ].map((f) => {
                const active = msgFilterAction === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMsgFilterAction(f.id)}
                    className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:border-white/5'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-gray-950">
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-24">{t("chargerDetail.colDir")}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-48">{t("chargerDetail.colAction")}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-36">{t("chargerDetail.colTime")}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">{t("chargerDetail.colPayload")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {filteredMessages.map((m) => (
                    <tr key={m.id} className="hover:bg-blue-50/80 dark:hover:bg-blue-500/15 transition-colors group">
                      <td className="px-4 py-2.5 whitespace-nowrap"><DirectionBadge direction={m.direction} /></td>
                      <td className="px-4 py-2.5 font-mono text-slate-900 dark:text-white font-bold whitespace-nowrap">{m.action}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-gray-300 font-mono font-semibold whitespace-nowrap">
                        {format(new Date(m.timestamp), 'HH:mm:ss')}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-800 dark:text-gray-200 text-xs">
                        <span className="inline-block w-full break-all bg-slate-100 dark:bg-black/60 p-2 rounded-lg border border-slate-200 dark:border-white/10 select-all" title={typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload, null, 2)}>
                          {typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredMessages.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-500 dark:text-gray-400">
                        {t('chargerDetail.noMessagesFound')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Dedicated Full Payload Inspector Modal */}
      {inspectMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setInspectMessage(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Payload OCPP Completo · <span className="font-mono">{inspectMessage.action}</span>
                    <DirectionBadge direction={inspectMessage.direction} />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-0.5">
                    {format(new Date(inspectMessage.timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')} · ID #{inspectMessage.id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyPayloadText(inspectMessage)}
                  className="btn-secondary text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
                >
                  {copiedPayloadId === inspectMessage.id ? (
                    <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copiado!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copiar JSON</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const str = formatPayloadJson(inspectMessage.payload)
                    const blob = new Blob([str], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `ocpp-${inspectMessage.action}-${inspectMessage.id}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="btn bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Descarregar (.json)
                </button>

                <button
                  type="button"
                  onClick={() => setInspectMessage(null)}
                  className="btn-ghost p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body - Pretty JSON */}
            <div className="flex-1 overflow-auto p-4 bg-slate-950">
              <pre className="font-mono text-xs text-cyan-300 leading-relaxed whitespace-pre-wrap select-all">
                <code>{formatPayloadJson(inspectMessage.payload)}</code>
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-3 px-4 border-t border-slate-800 bg-slate-900 text-xs text-gray-400">
              <span>Formato: JSON Formatado (Indentação de 2 espaços)</span>
              <button
                type="button"
                onClick={() => setInspectMessage(null)}
                className="px-4 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
