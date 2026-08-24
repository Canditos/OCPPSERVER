import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../api'
import type { Charger } from '../types'

interface RemoteStartModalProps {
  isOpen: boolean
  onClose: () => void
  rfidTag: string
  username?: string
}

export function RemoteStartModal({ isOpen, onClose, rfidTag, username }: RemoteStartModalProps) {
  const queryClient = useQueryClient()
  const [selectedCharger, setSelectedCharger] = useState<string | null>(null)
  const [selectedConnector, setSelectedConnector] = useState<number>(1)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers-available'],
    queryFn: api.getChargers,
    enabled: isOpen,
  })

  const availableChargers = chargers.filter((c) => c.status === 'Available')
  const selectedChargerObj = selectedCharger ? availableChargers.find((c) => c.charge_point_id === selectedCharger) : null
  const availableConnectors = selectedChargerObj?.connectors?.filter((c) => c.status === 'Available').map((c) => c.connector_id) || []

  const { mutate: performRemoteStart, isPending } = useMutation({
    mutationFn: () => api.remoteStart(selectedCharger!, rfidTag, selectedConnector),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Sucesso! ⚡' })
      setTimeout(() => {
        onClose()
        setFeedback(null)
        setSelectedCharger(null)
        setSelectedConnector(1)
        queryClient.invalidateQueries({ queryKey: ['chargers'] })
      }, 1500)
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: error?.response?.data?.detail || 'Erro!' })
    },
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Iniciar Carga
          </h2>
          <button onClick={onClose} disabled={isPending} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          
          {/* Card */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-slate-800 to-blue-900 border border-blue-500/20 text-white">
            <div className="text-xs text-slate-400 mb-1">CARTÃO</div>
            <div className="font-mono text-sm font-bold text-emerald-400 truncate">{rfidTag}</div>
            {username && <div className="text-xs text-slate-400 mt-2">{username}</div>}
          </div>

          {/* Charger List */}
          {availableChargers.length > 0 ? (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">Carregador</label>
              <select
                value={selectedCharger || ''}
                onChange={(e) => {
                  setSelectedCharger(e.target.value)
                  const charger = availableChargers.find((c) => c.charge_point_id === e.target.value)
                  setSelectedConnector(charger?.connectors?.[0]?.connector_id || 1)
                }}
                className="w-full p-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="">Escolha um carregador...</option>
                {availableChargers.map((c) => (
                  <option key={c.charge_point_id} value={c.charge_point_id}>
                    {c.charge_point_id} - {c.vendor}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Sem carregadores disponíveis
            </div>
          )}

          {/* Connector Selector */}
          {selectedCharger && availableConnectors.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">Tomada</label>
              <div className="flex gap-2">
                {availableConnectors.map((id) => (
                  <button
                    key={id}
                    onClick={() => setSelectedConnector(id)}
                    className={`flex-1 px-2 py-2 rounded text-xs font-medium transition-all border ${
                      selectedConnector === id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    #{id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`p-2.5 rounded text-xs flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
              {feedback.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-slate-900/50">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => performRemoteStart()}
            disabled={!selectedCharger || isPending}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-opacity"
          >
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Iniciar
          </button>
        </div>
      </div>
    </div>
  )
}
