import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../api'
import type { Charger } from '../types'
import { useI18n } from '../i18n'

interface RemoteStartModalProps {
  isOpen: boolean
  onClose: () => void
  rfidTag: string
  username?: string
}

export function RemoteStartModal({ isOpen, onClose, rfidTag, username }: RemoteStartModalProps) {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [selectedCharger, setSelectedCharger] = useState('')
  const [selectedConnector, setSelectedConnector] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers-available'],
    queryFn: api.getChargers,
    enabled: isOpen,
  })

  const availableChargers = useMemo(
    () => chargers
      .map((charger) => ({
        ...charger,
        freeConnectors: (charger.connectors || []).filter((connector) => connector.status === 'Available'),
      }))
      .filter((charger) => charger.is_online && charger.freeConnectors.length > 0),
    [chargers]
  )

  const selectedChargerData = availableChargers.find((charger) => charger.charge_point_id === selectedCharger)
  const availableConnectors = selectedChargerData?.freeConnectors || []

  useEffect(() => {
    if (!isOpen) {
      setFeedback(null)
      return
    }

    if (!selectedCharger && availableChargers.length > 0) {
      const firstCharger = availableChargers[0]
      setSelectedCharger(firstCharger.charge_point_id)
      setSelectedConnector(String(firstCharger.freeConnectors[0].connector_id))
      return
    }

    if (selectedChargerData && availableConnectors.length > 0) {
      const hasSelectedConnector = availableConnectors.some(
        (connector) => String(connector.connector_id) === selectedConnector
      )
      if (!hasSelectedConnector) {
        setSelectedConnector(String(availableConnectors[0].connector_id))
      }
    }
  }, [isOpen, availableChargers, selectedCharger, selectedChargerData, availableConnectors, selectedConnector])

  const { mutate: performRemoteStart, isPending } = useMutation({
    mutationFn: () => api.remoteStart(selectedCharger, rfidTag, Number(selectedConnector)),
    onSuccess: () => {
      setFeedback({ type: 'success', message: t('remoteStart.startSuccess') })
      queryClient.invalidateQueries({ queryKey: ['chargers'] })
      queryClient.invalidateQueries({ queryKey: ['my-active-charge'] })
      setTimeout(() => {
        setFeedback(null)
        onClose()
      }, 1200)
    },
    onError: (error: any) => {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.detail || t('remoteStart.startError'),
      })
    },
  })

  if (!isOpen) return null

  const modal = (
    <div className="fixed inset-0 z-50 bg-black/60 p-3 sm:p-4" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/20 p-1.5 text-blue-400">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">{t('remoteStart.title')}</h2>
                <p className="text-[11px] text-slate-400">{t('remoteStart.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{t('remoteStart.card')}</div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-400">{rfidTag}</div>
              {username && <div className="mt-1 text-[11px] text-slate-400">{username}</div>}
            </div>

            {availableChargers.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{t('remoteStart.noChargers')}</span>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">{t('remoteStart.charger')}</label>
                  <div className="space-y-2">
                    {availableChargers.map((charger) => {
                      const isSelected = charger.charge_point_id === selectedCharger
                      return (
                        <button
                          key={charger.charge_point_id}
                          type="button"
                          onClick={() => {
                            setSelectedCharger(charger.charge_point_id)
                            setSelectedConnector(String(charger.freeConnectors[0].connector_id))
                          }}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500/15 text-white'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'
                          }`}
                        >
                          <div className="text-sm font-medium">{charger.charge_point_id}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {charger.vendor || t('remoteStart.charger')} · {t(charger.freeConnectors.length > 1 ? 'remoteStart.freeCountPlural' : 'remoteStart.freeCount', { count: charger.freeConnectors.length })}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">{t('remoteStart.connector')}</label>
                  <div className="flex gap-2">
                    {availableConnectors.map((connector) => {
                      const connectorValue = String(connector.connector_id)
                      const isSelected = connectorValue === selectedConnector
                      return (
                        <button
                          key={connector.connector_id}
                          type="button"
                          onClick={() => setSelectedConnector(connectorValue)}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'
                          }`}
                        >
                          {t('remoteStart.connectorLabel', { id: connector.connector_id })}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {feedback && (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                  feedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-slate-600 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => performRemoteStart()}
              disabled={!selectedCharger || !selectedConnector || isPending || availableChargers.length === 0}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-1.5">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {t('common.start')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
