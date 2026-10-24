import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Activity, MessageSquare, Search, Maximize2, Minimize2, X,
  ChevronDown, ChevronRight, Eye, Copy, Check, Code, Download
} from 'lucide-react'
import { EventLog } from '../../EventLog'
import { useI18n } from '../../../i18n'
import type { OcppMessage } from '../../../types'

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

interface OcppLogsTabProps {
  cpId: string
  messages: OcppMessage[]
}

export function OcppLogsTab({ cpId, messages }: OcppLogsTabProps) {
  const { t } = useI18n()

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

  const availableTransactions = useMemo(() => {
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

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (msgFilterAction !== 'all') {
        if (msgFilterAction === 'security') {
          const secActions = [
            'InstallCertificate', 'GetInstalledCertificateIds', 'DeleteCertificate',
            'ExtendedTriggerMessage', 'CertificateSigned', 'SignCertificate'
          ]
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
          if (
            p.includes(`"transaction_id": ${msgFilterTx}`) ||
            p.includes(`"transaction_id":${msgFilterTx}`) ||
            p.includes(`"transactionId": ${msgFilterTx}`) ||
            p.includes(`"transactionId":${msgFilterTx}`)
          ) {
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
  }, [messages, msgFilterAction, msgFilterTx, msgSearch])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Station Events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            {t('chargerDetail.recentEvents')}
          </h3>
        </div>
        <EventLog cpId={cpId} maxHeight="300px" />
      </div>

      {/* OCPP Message Log */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-gray-200 uppercase tracking-wider">
                {t('chargerDetail.ocppLogTitle')}
              </h3>
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
                    <option value="all">{t('chargerDetail.logsAllTx')}</option>
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
                  placeholder={t('chargerDetail.filterPlaceholder')}
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
                title={t('chargerDetail.zenModeTooltip')}
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
                    Posto: {cpId}
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
                      <option value="all">{t('chargerDetail.logsAllTx')}</option>
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
                    placeholder={t('chargerDetail.filterPlaceholder')}
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
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-24">{t('chargerDetail.colDir')}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-48">{t('chargerDetail.colAction')}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px] w-36">{t('chargerDetail.colTime')}</th>
                    <th className="text-left px-4 py-3 text-slate-900 dark:text-gray-200 font-bold uppercase tracking-wider text-[11px]">{t('chargerDetail.colPayload')}</th>
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
                        <span
                          className="inline-block w-full break-all bg-slate-100 dark:bg-black/60 p-2 rounded-lg border border-slate-200 dark:border-white/10 select-all"
                          title={typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload, null, 2)}
                        >
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
                  <Download className="w-3.5 h-3.5" /> {t('chargerDetail.downloadJsonBtn')}
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
              <span>{t('chargerDetail.jsonFormat')}</span>
              <button
                type="button"
                onClick={() => setInspectMessage(null)}
                className="px-4 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
