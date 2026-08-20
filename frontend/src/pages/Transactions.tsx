import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDuration, intervalToDuration } from 'date-fns'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { safeFormatDate } from '../utils/date'
import { api } from '../api'
import { MeterChart } from '../components/MeterChart'
import type { Charger, Transaction } from '../types'

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Active'
    ? 'badge bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : 'badge bg-gray-700/40 text-gray-500 border border-gray-700/30'
  return <span className={cls}>{status === 'Active' ? '● ' : ''}{status}</span>
}

export function Transactions() {
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const [filterCp, setFilterCp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: txs = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', filterCp, filterStatus],
    queryFn: () => api.getTransactions(filterCp || undefined, filterStatus || undefined),
    refetchInterval: 5000,
  })

  const toggle = (id: number) => setExpanded(expanded === id ? null : id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Transações</h1>
        <p className="text-sm text-gray-500 mt-0.5">{txs.length} transações</p>
      </div>

      <div className="flex gap-3">
        <select className="select max-w-[200px]" value={filterCp} onChange={(e) => setFilterCp(e.target.value)}>
          <option value="">Todos os chargers</option>
          {chargers.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
        </select>
        <select className="select max-w-[160px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="Active">Active</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      <div className="space-y-2">
        {txs.length === 0 && (
          <div className="card flex items-center justify-center py-12 text-gray-600 text-sm">
            Sem transações
          </div>
        )}
        {txs.map((tx) => {
          const duration = tx.stop_time
            ? formatDuration(intervalToDuration({ start: new Date(tx.start_time), end: new Date(tx.stop_time) }), { format: ['hours', 'minutes', 'seconds'] })
            : null
          const isOpen = expanded === tx.id

          return (
            <div key={tx.id} className="card p-0 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-800/50 transition-colors text-left"
                onClick={() => toggle(tx.id)}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}

                <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-xs">
                  <div>
                    <p className="text-gray-400 font-mono">#{tx.transaction_id}</p>
                    <p className="text-gray-600">{tx.charge_point_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-300">{tx.id_tag}</p>
                    <p className="text-gray-600">Conector {tx.connector_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-300">{safeFormatDate(tx.start_time, 'dd/MM HH:mm')}</p>
                    {tx.stop_time && <p className="text-gray-600">{safeFormatDate(tx.stop_time, 'dd/MM HH:mm')}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {tx.energy_kwh !== null && tx.energy_kwh !== undefined && (
                      <><Zap className="w-3 h-3 text-blue-400" /><span className="text-blue-400 font-mono">{tx.energy_kwh} kWh</span></>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-800">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 text-xs">
                    <div>
                      <p className="text-gray-500 mb-0.5">Início</p>
                      <p className="text-gray-200 font-mono">{safeFormatDate(tx.start_time, 'dd/MM/yyyy HH:mm:ss')}</p>
                    </div>
                    {tx.stop_time && (
                      <div>
                        <p className="text-gray-500 mb-0.5">Fim</p>
                        <p className="text-gray-200 font-mono">{safeFormatDate(tx.stop_time, 'dd/MM/yyyy HH:mm:ss')}</p>
                      </div>
                    )}

                    {duration && (
                      <div>
                        <p className="text-gray-500 mb-0.5">Duração</p>
                        <p className="text-gray-200">{duration}</p>
                      </div>
                    )}
                    {tx.stop_reason && (
                      <div>
                        <p className="text-gray-500 mb-0.5">Motivo paragem</p>
                        <p className="text-gray-200">{tx.stop_reason}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-500 mb-0.5">Meter start</p>
                      <p className="text-gray-200 font-mono">{tx.meter_start} Wh</p>
                    </div>
                    {tx.meter_stop !== null && tx.meter_stop !== undefined && (
                      <div>
                        <p className="text-gray-500 mb-0.5">Meter stop</p>
                        <p className="text-gray-200 font-mono">{tx.meter_stop} Wh</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-2">MeterValues da transação</p>
                    <MeterChart cpId={tx.charge_point_id} transactionId={tx.id} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
