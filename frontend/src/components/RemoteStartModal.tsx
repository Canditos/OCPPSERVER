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

  // Fetch all chargers
  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers-available'],
    queryFn: api.getChargers,
    enabled: isOpen,
  })

  // Filter only available chargers
  const availableChargers = chargers.filter((c) => c.status === 'Available')

  // Get selected charger details
  const selectedChargerObj = selectedCharger ? availableChargers.find((c) => c.charge_point_id === selectedCharger) : null

  // Get available connectors for selected charger
  const availableConnectors = selectedChargerObj?.connectors
    ?.filter((c) => c.status === 'Available')
    .map((c) => c.connector_id) || []

  // Remote start mutation
  const { mutate: performRemoteStart, isPending } = useMutation({
    mutationFn: () => api.remoteStart(selectedCharger!, rfidTag, selectedConnector),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Carga iniciada com sucesso! ⚡' })
      setTimeout(() => {
        onClose()
        setFeedback(null)
        setSelectedCharger(null)
        setSelectedConnector(1)
        queryClient.invalidateQueries({ queryKey: ['chargers'] })
      }, 2000)
    },
    onError: (error: any) => {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.detail || 'Erro ao iniciar a carga. Tente novamente.',
      })
    },
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-up">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Iniciar Carga Remota</h2>
              <p className="text-xs text-slate-400 mt-0.5">Simule o seu cartão para começar a carregar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Card Simulation Display */}
          <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-slate-800 via-indigo-900 to-blue-900 text-white shadow-xl border border-blue-500/20">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
            <div className="relative z-10">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">ID do Cartão</div>
              <div className="font-mono text-xl font-bold tracking-wider text-emerald-400 mb-3">{rfidTag}</div>
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {username ? `Utilizador: ${username}` : 'Pronto para usar'}
              </div>
            </div>
          </div>

          {/* Charger Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-3">
              Selecione um Carregador Disponível
            </label>
            {availableChargers.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-300 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Nenhum carregador disponível no momento
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableChargers.map((charger) => (
                  <button
                    key={charger.charge_point_id}
                    onClick={() => {
                      setSelectedCharger(charger.charge_point_id)
                      setSelectedConnector(charger.connectors?.[0]?.connector_id || 1)
                    }}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedCharger === charger.charge_point_id
                        ? 'bg-blue-500/20 border-blue-500 text-white'
                        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    <div className="font-semibold text-sm">{charger.charge_point_id}</div>
                    <div className="text-xs mt-1 opacity-70">
                      {charger.vendor} · {charger.model}
                    </div>
                    <div className="text-[10px] mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {charger.connectors?.filter((c) => c.status === 'Available').length || 0} tomadas livres
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Connector Selection */}
          {selectedCharger && availableConnectors.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-3">
                Selecione um Conector
              </label>
              <div className="grid grid-cols-auto gap-2">
                {availableConnectors.map((connectorId) => (
                  <button
                    key={connectorId}
                    onClick={() => setSelectedConnector(connectorId)}
                    className={`px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                      selectedConnector === connectorId
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    Tomada #{connectorId}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feedback Message */}
          {feedback && (
            <div
              className={`p-4 rounded-lg border flex items-center gap-3 text-sm font-medium animate-fade-up ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              {feedback.message}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 flex gap-3 p-6 border-t border-white/10 bg-slate-900/95">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => performRemoteStart()}
            disabled={!selectedCharger || isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Iniciar Carga
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
