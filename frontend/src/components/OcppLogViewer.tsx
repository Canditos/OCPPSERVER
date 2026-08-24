import React, { useState, useMemo, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Search, Filter, ChevronDown, ChevronRight, Download, Pause, Play, Trash2,
  ArrowDownLeft, ArrowUpRight, Code, Copy, Check
} from 'lucide-react'
import type { OcppMessage } from '../types'
import { safeFormatDate } from '../utils/date'

interface Props {
  messages: OcppMessage[]
  cpId?: string
  maxHeight?: string
}

export function OcppLogViewer({ messages, cpId, maxHeight = '600px' }: Props) {
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL')
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const listRef = useRef<HTMLDivElement>(null)

  // Get unique actions for filter dropdown
  const uniqueActions = useMemo(() => {
    if (!Array.isArray(messages)) return []
    const actions = new Set(messages.map((m) => m?.action).filter(Boolean))
    return Array.from(actions).sort()
  }, [messages])

  // Filter messages
  const filteredMessages = useMemo(() => {
    if (!Array.isArray(messages)) return []
    return messages.filter((m) => {
      if (!m) return false
      const dir = m.direction || ''
      const act = m.action || ''

      if (directionFilter !== 'ALL' && dir !== directionFilter) return false
      if (actionFilter !== 'ALL' && act !== actionFilter) return false
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase()
        const payloadStr = typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload || '')
        const matchAction = act.toLowerCase().includes(q)
        const matchPayload = (payloadStr || '').toLowerCase().includes(q)
        if (!matchAction && !matchPayload) return false
      }
      return true
    })
  }, [messages, directionFilter, actionFilter, searchTerm])


  // Auto scroll when not paused
  useEffect(() => {
    if (!isPaused && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [messages.length, isPaused])

  const copyPayload = (id: number, payload: unknown) => {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    navigator.clipboard.writeText(str)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const exportLogsJson = () => {
    const jsonStr = JSON.stringify(filteredMessages, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocpp-logs-${cpId || 'all'}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatJsonStr = (payload: unknown) => {
    if (typeof payload === 'string') {
      try {
        return JSON.stringify(JSON.parse(payload), null, 2)
      } catch {
        return payload
      }
    }
    return JSON.stringify(payload, null, 2)
  }

  return (
    <div className="card p-0 flex flex-col overflow-hidden border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-gray-900/80 shadow-lg">
      {/* Header & Controls Toolbar */}
      <div className="p-4 bg-slate-50 dark:bg-gray-900/90 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Pesquisar mensagens OCPP ou JSON..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-9 text-xs py-2 bg-white dark:bg-gray-950/60 border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500/50"
          />
        </div>

        {/* Filters & Actions Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Direction Filter */}
          <div className="flex bg-slate-200/70 dark:bg-gray-950/60 p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium">
            <button
              onClick={() => setDirectionFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all ${directionFilter === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200'}`}
            >
              Todas
            </button>
            <button
              onClick={() => setDirectionFilter('IN')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${directionFilter === 'IN' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-600 dark:text-emerald-400/70 hover:text-emerald-700 dark:hover:text-emerald-300'}`}
            >
              <ArrowDownLeft className="w-3 h-3" /> IN
            </button>
            <button
              onClick={() => setDirectionFilter('OUT')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${directionFilter === 'OUT' ? 'bg-violet-600 text-white shadow' : 'text-violet-600 dark:text-violet-400/70 hover:text-violet-700 dark:hover:text-violet-300'}`}
            >
              <ArrowUpRight className="w-3 h-3" /> OUT
            </button>
          </div>

          {/* Action Filter Dropdown */}
          <div className="relative min-w-[140px]">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="select text-xs py-1.5 px-3 bg-white dark:bg-gray-950/60 border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-300 cursor-pointer"
            >
              <option value="ALL">Todas as Ações</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>

          {/* Pause Feed Button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Continuar atualização live' : 'Pausar scroll live'}
            className={`btn-secondary p-2 text-xs rounded-xl ${isPaused ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30' : 'text-slate-600 dark:text-gray-400'}`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Export JSON Button */}
          <button
            onClick={exportLogsJson}
            title="Exportar logs filtrados em formato JSON"
            className="btn-secondary p-2 text-xs text-slate-700 dark:text-gray-300 rounded-xl hover:text-slate-900 dark:hover:text-white"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log Feed Table */}
      <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-white/5" style={{ maxHeight }}>
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-gray-600 gap-2">
            <Code className="w-8 h-8 opacity-40 text-slate-400 dark:text-gray-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-gray-300">Sem registos de mensagens OCPP</p>
            <p className="text-xs text-slate-400 dark:text-gray-600">Aguardar atividade no posto de carga...</p>
          </div>
        ) : (
          filteredMessages.map((m) => {
            const isExpanded = expandedId === m.id
            const isIncoming = m.direction === 'IN'

            return (
              <div key={m.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                {/* Summary Line Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none text-xs"
                >
                  <button className="text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Direction Badge */}
                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold tracking-wide border flex items-center gap-1 ${
                    isIncoming
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
                  }`}>
                    {isIncoming ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                    {m.direction}
                  </span>

                  {/* Action Name */}
                  <span className="font-mono font-bold text-slate-900 dark:text-gray-200 text-sm min-w-[140px]">
                    {m.action}
                  </span>

                  {/* Payload Summary Inline Preview */}
                  <span className="text-slate-600 dark:text-gray-400 font-mono truncate flex-1 max-w-xl text-[11px]">
                    {typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload)}
                  </span>

                  {/* Timestamp */}
                  <span className="text-slate-500 dark:text-gray-400 font-mono text-[11px] font-medium shrink-0 ml-auto">
                    {safeFormatDate(m.timestamp, 'HH:mm:ss.SSS')}
                  </span>
                </div>

                {/* Expanded Formatted JSON Drawer */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-slate-50 dark:bg-gray-950/80 border-t border-b border-slate-200 dark:border-white/5 space-y-2 animate-fade-up">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        Payload JSON OCPP
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyPayload(m.id, m.payload)
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-[11px] font-medium transition-all"
                      >
                        {copiedId === m.id ? (
                          <><Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Copiado!</>
                        ) : (
                          <><Copy className="w-3 h-3 text-slate-500 dark:text-gray-400" /> Copiar JSON</>
                        )}
                      </button>
                    </div>

                    <pre className="p-4 rounded-xl bg-slate-900 dark:bg-gray-900 border border-slate-800 dark:border-white/10 text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed shadow-inner">
                      <code>{formatJsonStr(m.payload)}</code>
                    </pre>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 bg-slate-100 dark:bg-gray-950/90 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-500">
        <span>A mostrar {filteredMessages.length} de {messages.length} mensagens</span>
        <span className="font-mono">{isPaused ? '⏸ SEGUIMENTO PAUSADO' : '● LIVE FEED ATIVO'}</span>
      </div>
    </div>
  )
}
