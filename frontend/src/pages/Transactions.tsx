import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDuration, intervalToDuration } from 'date-fns'
import {
  ChevronDown, ChevronRight, Zap, User as UserIcon,
  Shield, CreditCard, Clock, Activity, ArrowLeftRight,
  ShieldCheck, ShieldAlert, RefreshCw, Download
} from 'lucide-react'
import { safeFormatDate } from '../utils/date'
import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import { OcmfAuditModal } from '../components/OcmfAuditModal'
import type { Charger, Transaction } from '../types'

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Active'
    ? 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse flex items-center gap-1.5'
    : 'px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-gray-700'

  return (
    <span className={cls}>
      {status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
      {status === 'Active' ? 'A Carregar' : 'Concluído'}
    </span>
  )
}

export function Transactions() {
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const [filterCp, setFilterCp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [selectedOcmfTx, setSelectedOcmfTx] = useState<number | null>(null)
  const [isRevalidating, setIsRevalidating] = useState(false)

  const { data: txs = [], refetch } = useQuery<Transaction[]>({
    queryKey: ['transactions', filterCp, filterStatus],
    queryFn: () => api.getTransactions(filterCp || undefined, filterStatus || undefined),
    refetchInterval: 5000,
  })

  const toggle = (id: number) => setExpanded(expanded === id ? null : id)

  const handleReverifyOcmf = async () => {
    try {
      setIsRevalidating(true)
      await api.reverifyOcmfTransactions()
      await refetch()
    } catch (e) {
      console.error(e)
    } finally {
      setIsRevalidating(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Transações e Consumos
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            Histórico completo com conformidade metrológica legal (Eichrecht / OCMF)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReverifyOcmf}
            disabled={isRevalidating}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Revalidar assinaturas dos medidores LEM DCBM"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isRevalidating ? 'animate-spin' : ''}`} />
            <span>Revalidar OCMF</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-gray-800/80 border border-slate-200 dark:border-gray-700 text-xs font-mono text-slate-700 dark:text-gray-300">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>{txs.length} registadas</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className="select max-w-[220px] text-xs" value={filterCp} onChange={(e) => setFilterCp(e.target.value)}>
          <option value="">Todos os Postos</option>
          {chargers.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
        </select>
        <select className="select max-w-[180px] text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os Estados</option>
          <option value="Active">Apenas Ativas (A carregar)</option>
          <option value="Completed">Apenas Concluídas</option>
        </select>
      </div>

      {/* Transactions List */}
      <div className="space-y-2.5">
        {txs.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-slate-400 dark:text-gray-500 text-sm border border-slate-200 dark:border-white/5 space-y-2">
            <Clock className="w-8 h-8 opacity-40" />
            <p>Nenhuma transação encontrada com os filtros selecionados.</p>
          </div>
        )}

        {txs.map((tx) => {
          const duration = tx.stop_time
            ? formatDuration(intervalToDuration({ start: new Date(tx.start_time), end: new Date(tx.stop_time) }), { format: ['hours', 'minutes', 'seconds'] })
            : tx.status === 'Active' ? 'Em curso…' : null

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
                          {tx.id_tag || 'Sem Tag'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Start Time */}
                  <div>
                    <span className="text-slate-800 dark:text-gray-200 font-mono text-xs block">
                      {safeFormatDate(tx.start_time, 'dd/MM HH:mm')}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">
                      {tx.stop_time ? safeFormatDate(tx.stop_time, 'dd/MM HH:mm') : 'Em curso…'}
                    </span>
                  </div>

                  {/* Energy Consumed */}
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm block">
                        {tx.energy_kwh ?? 0} kWh
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {duration || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Status & Metrology Badge */}
                  <div className="flex flex-col md:flex-row items-end md:items-center justify-end gap-1.5">
                    <StatusBadge status={tx.status} />
                    {tx.ocmf_verified ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOcmfTx(tx.transaction_id)
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 hover:bg-emerald-500/25 transition-colors"
                        title="Assinatura Legal Eichrecht / OCMF Válida"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span>OCMF Válido</span>
                      </button>
                    ) : tx.ocmf_stop_raw ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOcmfTx(tx.transaction_id)
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/25 transition-colors"
                        title="Clique para inspecionar OCMF"
                      >
                        <ShieldAlert className="w-3 h-3 text-amber-500" />
                        <span>OCMF</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isOpen && (
                <div className="px-5 pb-5 pt-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01]">
                  {/* Detailed summary pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs mb-3">
                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">Utilizador</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {tx.user_username ? `${tx.user_username} (${tx.user_role || 'user'})` : 'Não registado'}
                      </span>
                      {tx.user_email && <span className="text-[10px] text-slate-400 block">{tx.user_email}</span>}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">Início / Fim</span>
                      <span className="font-mono text-slate-800 dark:text-gray-200 text-[11px] block">
                        Início: {safeFormatDate(tx.start_time, 'dd/MM/yyyy HH:mm:ss')}
                      </span>
                      {tx.stop_time && (
                        <span className="font-mono text-slate-500 text-[11px] block">
                          Fim: {safeFormatDate(tx.stop_time, 'dd/MM/yyyy HH:mm:ss')}
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">Leitura Contadores</span>
                      <span className="font-mono text-slate-800 dark:text-gray-200 text-[11px] block">
                        Start: {tx.meter_start} Wh
                      </span>
                      {tx.meter_stop !== null && tx.meter_stop !== undefined && (
                        <span className="font-mono text-slate-500 text-[11px] block">
                          Stop: {tx.meter_stop} Wh
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 dark:text-gray-400 text-[10px] uppercase font-semibold block mb-0.5">Metrologia Legal (OCMF)</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-bold text-xs flex items-center gap-1">
                          {tx.ocmf_verified ? (
                            <span className="text-emerald-500 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Assinado & Válido
                            </span>
                          ) : tx.ocmf_stop_raw ? (
                            <span className="text-amber-500 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> Registado
                            </span>
                          ) : (
                            <span className="text-slate-400">Padrão</span>
                          )}
                        </span>
                        {tx.ocmf_stop_raw && (
                          <button
                            onClick={() => setSelectedOcmfTx(tx.transaction_id)}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            Auditar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MeterValues Chart */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                    <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-2 block">
                      Curva de Telemetria e Potência da Sessão
                    </span>
                    <MeterChart cpId={tx.charge_point_id} transactionId={tx.id} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* OCMF Audit Modal */}
      {selectedOcmfTx && (
        <OcmfAuditModal
          transactionId={selectedOcmfTx}
          onClose={() => setSelectedOcmfTx(null)}
        />
      )}
    </div>
  )
}
