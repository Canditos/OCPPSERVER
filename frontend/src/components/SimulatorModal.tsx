import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Play, Square, RefreshCw, Sparkles, CheckCircle2,
  Cpu, Layers, AlertCircle, X, ShieldCheck, Activity
} from 'lucide-react'
import { api } from '../api'
import { useI18n } from '../i18n'

interface SimulatorModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SimulatorModal({ isOpen, onClose }: SimulatorModalProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [ocppVersion, setOcppVersion] = useState<'1.6' | '2.0.1'>('2.0.1')
  const [stationId, setStationId] = useState('chargerPT_v201')
  const [duration, setDuration] = useState(20)
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data: status, refetch } = useQuery({
    queryKey: ['simulatorStatus'],
    queryFn: api.getSimulatorStatus,
    refetchInterval: isOpen ? 2000 : false,
  })

  const launchMutation = useMutation({
    mutationFn: () =>
      api.launchSimulator({
        station_id: ocppVersion === '2.0.1' ? 'chargerPT_v201' : 'versicharge_01',
        ocpp_version: ocppVersion,
        duration_seconds: duration,
      }),
    onSuccess: (res) => {
      setFeedback(res.message)
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['simulatorStatus'] })
      // Auto close modal smoothly so the user can watch the live charger on the Dashboard
      setTimeout(() => {
        onClose()
      }, 500)
    },
    onError: (err: any) => {
      setFeedback(`Erro: ${err?.response?.data?.detail || err.message}`)
    },
  })

  const stopMutation = useMutation({
    mutationFn: api.stopSimulator,
    onSuccess: () => {
      setFeedback('Simulação terminada.')
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
      refetch()
    },
  })

  if (!isOpen) return null

  const isRunning = status?.is_running ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-500 dark:text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Simulador Virtual Dual-Stack</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">Teste carregamentos virtuais em tempo real</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5">
          {/* Feedback alert */}
          {feedback && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> {feedback}
              </span>
              <button onClick={() => setFeedback(null)} className="text-slate-400 dark:text-gray-400 text-xs">✕</button>
            </div>
          )}

          {/* Active status indicator */}
          {isRunning && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Simulação em Curso: {status?.station_id} ({status?.ocpp_version})
                </span>
              </div>
              <button
                type="button"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3 h-3" /> Parar
              </button>
            </div>
          )}

          {/* Protocol & Profile Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300">Escolha o Posto Virtual:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: OCPP 2.0.1 */}
              <div
                onClick={() => {
                  setOcppVersion('2.0.1')
                  setStationId('chargerPT_v201')
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  ocppVersion === '2.0.1'
                    ? 'bg-purple-500/10 border-purple-500 shadow-md shadow-purple-500/10'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-purple-400/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">OCPP 2.0.1</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300">
                    PnC 300kW
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  Siemens SICHARGE D com ISO 15118 Plug & Charge e Device Model.
                </p>
              </div>

              {/* Option 2: OCPP 1.6-J */}
              <div
                onClick={() => {
                  setOcppVersion('1.6')
                  setStationId('versicharge_01')
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  ocppVersion === '1.6'
                    ? 'bg-blue-500/10 border-blue-500 shadow-md shadow-blue-500/10'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-blue-400/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">OCPP 1.6-J</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
                    AC 22kW
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  Siemens VersiCharge Gen 3 com cartão RFID e leituras periódicas.
                </p>
              </div>
            </div>
          </div>

          {/* Duration Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 flex justify-between">
              <span>Duração da Sessão de Carregamento:</span>
              <span className="text-blue-500 font-mono font-bold">{duration} segundos</span>
            </label>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-white/2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2 rounded-xl"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => launchMutation.mutate()}
            disabled={launchMutation.isPending || isRunning}
            className={`btn text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-white shadow-lg transition-all ${
              ocppVersion === '2.0.1'
                ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
            }`}
          >
            {launchMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{launchMutation.isPending ? 'A Iniciar...' : 'Arrancar Simulação'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
