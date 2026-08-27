import { createPortal } from 'react-dom'
import { OcmfValidationModal } from '../components/OcmfValidationModal'
import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDuration, intervalToDuration, isToday, isWithinInterval, subDays, startOfMonth } from 'date-fns'
import {
  ChevronDown, ChevronRight, Zap, User as UserIcon,
  Shield, ShieldCheck, CreditCard, Clock, Activity, ArrowLeftRight,
  Download, Search, Filter, Calendar, Euro, BatteryCharging,
  FileText, MessageSquare, Code, Check, Copy, Eye, X
} from 'lucide-react'
import type { OcppMessage } from '../types'
import { safeFormatDate } from '../utils/date'
import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import type { Charger, Transaction } from '../types'
import { useI18n } from '../i18n'

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

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const cls = status === 'Active'
    ? 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse flex items-center gap-1.5'
    : 'px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-gray-700'

  return (
    <span className={cls}>
      {status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
      {status === 'Active' ? t('transactions.charging') : t('transactions.completed')}
    </span>
  )
}

type DatePreset = 'all' | 'today' | '7days' | 'month'

export function Transactions() {
  const { t } = useI18n()
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const [filterCp, setFilterCp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  // Transaction OCPP Log Modal States
  const [selectedTxForLogs, setSelectedTxForLogs] = useState<Transaction | null>(null)
  const [txLogActionFilter, setTxLogActionFilter] = useState<string>('all')
  const [txLogSearch, setTxLogSearch] = useState<string>('')
  const [inspectMessage, setInspectMessage] = useState<OcppMessage | null>(null)
  const [copiedPayloadId, setCopiedPayloadId] = useState<number | null>(null)
  const [selectedTxForOcmf, setSelectedTxForOcmf] = useState<number | null>(null)

  const { data: rawTxMessages = [], isLoading: isTxLogsLoading } = useQuery<OcppMessage[]>({
    queryKey: ['txOcppMessages', selectedTxForLogs?.charge_point_id],
    queryFn: () => api.getMessages(selectedTxForLogs!.charge_point_id, 1000),
    enabled: Boolean(selectedTxForLogs),
    refetchInterval: 4000,
  })

  const txLogsForSelected = useMemo(() => {
    if (!selectedTxForLogs) return []
    const txIdStr = String(selectedTxForLogs.transaction_id)
    return rawTxMessages.filter((m) => {
      const p = m.payload
      let matchTx = false
      if (typeof p === 'object' && p !== null) {
        if (String((p as any).transaction_id) === txIdStr || String((p as any).transactionId) === txIdStr) matchTx = true
      } else if (typeof p === 'string') {
        if (p.includes(`"transaction_id": ${txIdStr}`) || p.includes(`"transaction_id":${txIdStr}`) || p.includes(`"transactionId": ${txIdStr}`) || p.includes(`"transactionId":${txIdStr}`)) matchTx = true
      }
      if (!matchTx) return false

      if (txLogActionFilter !== 'all' && m.action !== txLogActionFilter) return false
      if (txLogSearch.trim()) {
        const q = txLogSearch.toLowerCase()
        const payloadStr = typeof m.payload === 'string' ? m.payload.toLowerCase() : JSON.stringify(m.payload).toLowerCase()
        if (!m.action.toLowerCase().includes(q) && !payloadStr.includes(q)) return false
      }
      return true
    })
  }, [rawTxMessages, selectedTxForLogs, txLogActionFilter, txLogSearch])

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

  const { data: txs = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', filterCp, filterStatus],
    queryFn: () => api.getTransactions(filterCp || undefined, filterStatus || undefined),
    refetchInterval: 5000,
  })

  // Filter by Date Preset and Search Query
  const filteredTxs = useMemo(() => {
    const now = new Date()
    return txs.filter((tx) => {
      // Date filter
      if (datePreset !== 'all') {
        const txDate = new Date(tx.start_time)
        if (datePreset === 'today') {
          if (!isToday(txDate)) return false
        } else if (datePreset === '7days') {
          const sevenDaysAgo = subDays(now, 7)
          if (txDate < sevenDaysAgo) return false
        } else if (datePreset === 'month') {
          const monthStart = startOfMonth(now)
          if (txDate < monthStart) return false
        }
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchId = String(tx.transaction_id).includes(q)
        const matchCp = tx.charge_point_id.toLowerCase().includes(q)
        const matchTag = tx.id_tag?.toLowerCase().includes(q) ?? false
        const matchUser = tx.user_username?.toLowerCase().includes(q) ?? false
        if (!matchId && !matchCp && !matchTag && !matchUser) return false
      }

      return true
    })
  }, [txs, datePreset, searchQuery])

  // Summary KPIs
  const totalKwh = useMemo(() => {
    return filteredTxs.reduce((sum, tx) => sum + (tx.energy_kwh || ((tx.meter_stop ? tx.meter_stop - tx.meter_start : 0) / 1000)), 0)
  }, [filteredTxs])

  const activeCount = useMemo(() => {
    return filteredTxs.filter((tx) => tx.status === 'Active').length
  }, [filteredTxs])

  const estimatedCost = useMemo(() => {
    return totalKwh * 0.22 // standard 0.22 € / kWh estimate
  }, [totalKwh])

  const toggle = (id: number) => setExpanded(expanded === id ? null : id)

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredTxs.length === 0) return
    const headers = ['ID', 'Posto', 'Tomada', 'Utilizador', 'Tag RFID/eMAID', 'Inicio', 'Fim', 'Estado', 'Energia (kWh)', 'Custo Est. (EUR)']
    const rows = filteredTxs.map((tx) => {
      const kwh = tx.energy_kwh || ((tx.meter_stop ? tx.meter_stop - tx.meter_start : 0) / 1000)
      const cost = (kwh * 0.22).toFixed(2)
      return [
        tx.transaction_id,
        tx.charge_point_id,
        tx.connector_id,
        tx.user_username || 'Anonimo',
        tx.id_tag || 'N/A',
        tx.start_time,
        tx.stop_time || 'Em curso',
        tx.status,
        kwh.toFixed(2),
        cost,
      ].map((cell) => `"${cell}"`).join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `transacoes_ocpp_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('transactions.title')}
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            {t('transactions.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredTxs.length === 0}
            className="btn-secondary text-xs py-2 px-3.5 rounded-xl flex items-center gap-2 font-bold cursor-pointer disabled:opacity-50"
            title="Exportar transações filtradas para ficheiro CSV"
          >
            <Download className="w-4 h-4 text-blue-500" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3.5 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-blue-500/20">
          <div className="p-3 rounded-xl bg-blue-500/20 text-blue-500 dark:text-blue-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Total Carregado</span>
            <div className="text-lg font-bold text-slate-900 dark:text-white font-mono">{totalKwh.toFixed(1)} kWh</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
          <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-500 dark:text-emerald-400">
            <BatteryCharging className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Sessões Ativas</span>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">{activeCount} em curso</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-500 dark:text-amber-400">
            <Euro className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Custo Estimado</span>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">{estimatedCost.toFixed(2)} €</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5 bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-500/20">
          <div className="p-3 rounded-xl bg-purple-500/20 text-purple-500 dark:text-purple-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Total Transações</span>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400 font-mono">{filteredTxs.length}</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 dark:bg-gray-900/60 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-md">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 dark:text-gray-400 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Período:
          </span>
          {[
            { id: 'all', label: 'Todas' },
            { id: 'today', label: 'Hoje' },
            { id: '7days', label: 'Últimos 7 Dias' },
            { id: 'month', label: 'Este Mês' },
          ].map((dp) => (
            <button
              key={dp.id}
              type="button"
              onClick={() => setDatePreset(dp.id as DatePreset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === dp.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {dp.label}
            </button>
          ))}
        </div>

        {/* Dropdowns & Search Box */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            className="select max-w-[180px] text-xs py-1.5"
            value={filterCp}
            onChange={(e) => setFilterCp(e.target.value)}
          >
            <option value="">{t('transactions.allStations')}</option>
            {chargers.map((c) => (
              <option key={c.id} value={c.charge_point_id}>
                {c.charge_point_id}
              </option>
            ))}
          </select>

          <select
            className="select max-w-[150px] text-xs py-1.5"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">{t('transactions.allStatuses')}</option>
            <option value="Active">{t('transactions.activeOnly')}</option>
            <option value="Completed">{t('transactions.completedOnly')}</option>
          </select>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar ID, tag, user..."
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2.5">
        {filteredTxs.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-slate-400 dark:text-gray-500 text-sm border border-slate-200 dark:border-white/5 space-y-2">
            <Clock className="w-8 h-8 opacity-40" />
            <p>{t('transactions.noneFound')}</p>
          </div>
        )}

        {filteredTxs.map((tx) => {
          const duration = tx.stop_time
            ? formatDuration(intervalToDuration({ start: new Date(tx.start_time), end: new Date(tx.stop_time) }), { format: ['hours', 'minutes', 'seconds'] })
            : tx.status === 'Active' ? t('transactions.inProgress') : null

          const isOpen = expanded === tx.id

          return (
            <div
              key={tx.id}
              className={`card p-0 overflow-hidden border transition-all duration-150 ${
                tx.status === 'Active'
                  ? 'border-emerald-500/40 shadow-md shadow-emerald-500/5 bg-emerald-500/[0.02]'
                  : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <button
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                onClick={() => toggle(tx.id)}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}

                <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3 items-center text-xs">
                  {/* Transaction ID & Charger */}
                  <div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm block">
                      #{tx.transaction_id}
                    </span>
                    <span className="text-slate-500 dark:text-gray-400 font-medium text-[11px]">
                      {tx.charge_point_id} · T#{tx.connector_id}
                    </span>
                  </div>

                  {/* Driver / User */}
                  <div className="md:col-span-2">
                    {tx.user_username ? (
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                          <UserIcon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-xs block">
                            {tx.user_username}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                            Tag: {tx.id_tag}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700 dark:text-gray-300 text-xs">
                          {tx.id_tag || t('transactions.noTag')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Energy Consumed */}
                  <div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {tx.energy_kwh !== null && tx.energy_kwh !== undefined
                          ? `${tx.energy_kwh.toFixed(2)} kWh`
                          : tx.meter_stop !== null && tx.meter_stop !== undefined
                          ? `${((tx.meter_stop - tx.meter_start) / 1000).toFixed(2)} kWh`
                          : '-'}
                      </span>
                    </div>
                    {duration && (
                      <span className="text-slate-400 dark:text-gray-500 text-[11px] block mt-0.5">
                        {duration}
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div>
                    <span className="text-slate-700 dark:text-gray-300 font-medium block">
                      {safeFormatDate(tx.start_time)}
                    </span>
                    {tx.stop_reason && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-gray-500 uppercase">
                        {tx.stop_reason}
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="flex justify-end">
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              </button>

              {/* Collapsible Telemetry & Meter Chart */}
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 p-5 space-y-4 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-200/60 dark:border-white/5">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      Telemetria & Curva de Carga da Transação #{tx.transaction_id}
                    </h4>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTxForOcmf(tx.transaction_id)
                        }}
                        className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/25 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        title="Auditoria Legal Eichrecht & Certificação OCMF"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Auditoria OCMF (Eichrecht)</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTxLogActionFilter('all')
                          setTxLogSearch('')
                          setSelectedTxForLogs(tx)
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Ver Logs OCPP da TX #{tx.transaction_id}</span>
                      </button>
                    </div>
                  </div>
                  <MeterChart cpId={tx.charge_point_id} transactionId={tx.id} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* Dedicated Transaction OCPP Logs Modal */}
      {selectedTxForLogs && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
          onClick={() => setSelectedTxForLogs(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Histórico de Mensagens OCPP · <span className="font-mono text-blue-600 dark:text-blue-400">TX #{selectedTxForLogs.transaction_id}</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {txLogsForSelected.length} msgs
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-0.5">
                    Posto: {selectedTxForLogs.charge_point_id} · Tomada #{selectedTxForLogs.connector_id} · {selectedTxForLogs.user_username ? `Condutor: ${selectedTxForLogs.user_username}` : `Tag: ${selectedTxForLogs.id_tag}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={txLogSearch}
                    onChange={(e) => setTxLogSearch(e.target.value)}
                    placeholder="Pesquisar ação ou payload..."
                    className="text-xs pl-8 pr-6 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
                  />
                  {txLogSearch && (
                    <button
                      onClick={() => setTxLogSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Download CSV/JSON button */}
                <button
                  type="button"
                  onClick={() => {
                    const jsonStr = JSON.stringify(txLogsForSelected, null, 2)
                    const blob = new Blob([jsonStr], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `logs-tx-${selectedTxForLogs.transaction_id}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  disabled={txLogsForSelected.length === 0}
                  className="btn bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" /> Descarregar Logs (.json)
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTxForLogs(null)}
                  className="btn-ghost p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Action Pills */}
            <div className="flex items-center gap-1.5 p-3 border-b border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-gray-950/40 flex-wrap">
              {['all', 'StartTransaction', 'MeterValues', 'StopTransaction'].map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setTxLogActionFilter(act)}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                    txLogActionFilter === act
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:border-white/5'
                  }`}
                >
                  {act === 'all' ? 'Todas as Mensagens' : act}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-gray-950">
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-24">Dir</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-48">Ação OCPP</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-36">Hora</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">Conteúdo do Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {txLogsForSelected.map((m) => (
                    <tr key={m.id} className="hover:bg-blue-50/80 dark:hover:bg-blue-500/15 transition-colors group">
                      <td className="px-4 py-2.5 whitespace-nowrap"><DirectionBadge direction={m.direction} /></td>
                      <td className="px-4 py-2.5 font-mono text-slate-900 dark:text-white font-bold whitespace-nowrap">{m.action}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-gray-300 font-mono font-semibold whitespace-nowrap">
                        {safeFormatDate(m.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-800 dark:text-gray-200 text-xs">
                        <div className="flex items-center gap-2 max-w-2xl">
                          <span
                            className="flex-1 truncate bg-slate-100 hover:bg-slate-200 dark:bg-black/60 dark:hover:bg-black/80 px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 transition-colors select-all"
                            title="Clique para ver o payload completo"
                          >
                            {typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInspectMessage(m)}
                            className="shrink-0 p-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-bold flex items-center gap-1 px-2 transition-all cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Total</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {txLogsForSelected.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-500 dark:text-gray-400">
                        {isTxLogsLoading ? 'A carregar mensagens OCPP da transação…' : 'Nenhuma mensagem OCPP encontrada para esta transação.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-3 px-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-gray-950 text-xs text-slate-500 dark:text-gray-400">
              <span>{txLogsForSelected.length} mensagem(ns) OCPP registadas para a TX #{selectedTxForLogs.transaction_id}</span>
              <button
                type="button"
                onClick={() => setSelectedTxForLogs(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dedicated OCMF Eichrecht Validation Modal */}
      {selectedTxForOcmf && (
        <OcmfValidationModal
          transactionId={selectedTxForOcmf}
          onClose={() => setSelectedTxForOcmf(null)}
        />
      )}

      {/* Dedicated Payload JSON Inspector Modal */}
      {inspectMessage && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-sm animate-fade-in overflow-y-auto"
          onClick={() => setInspectMessage(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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
                    {safeFormatDate(inspectMessage.timestamp)} · ID #{inspectMessage.id}
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
                  onClick={() => setInspectMessage(null)}
                  className="btn-ghost p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-950">
              <pre className="font-mono text-xs text-cyan-300 leading-relaxed whitespace-pre-wrap select-all">
                <code>{formatPayloadJson(inspectMessage.payload)}</code>
              </pre>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-3 px-4 border-t border-slate-800 bg-slate-900 text-xs text-gray-400">
              <span>Formato: JSON Formatado</span>
              <button
                type="button"
                onClick={() => setInspectMessage(null)}
                className="px-4 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
