import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Zap } from 'lucide-react'
import { api } from '../api'
import { OcppLogViewer } from '../components/OcppLogViewer'
import { EventLog } from '../components/EventLog'
import { useChargerStore } from '../store/chargerStore'
import { useChargerUiStore } from '../store/chargerUiStore'
import type { Charger, OcppMessage } from '../types'
import { useI18n } from '../i18n'

export function Logs() {
  const { t } = useI18n()
  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
    refetchInterval: 10000,
  })

  const [selectedCpId, setSelectedCpId] = useState<string>('')
  const currentCpId = selectedCpId || chargers[0]?.charge_point_id

  React.useEffect(() => {
    if (!selectedCpId && chargers.length > 0) {
      setSelectedCpId(chargers[0].charge_point_id)
    }
  }, [chargers, selectedCpId])

  const { data: messages = [] } = useQuery<OcppMessage[]>({
    queryKey: ['messages', currentCpId],
    queryFn: () => api.getMessages(currentCpId!, 200),
    enabled: !!currentCpId,
    refetchInterval: 3000,
  })

  const liveState = useChargerStore((s) => s.liveState)
  const { displayNames } = useChargerUiStore()

  const isCharging = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    if (live?.connectors && Object.keys(live.connectors).length > 0) {
      return Object.values(live.connectors).some((cc) => cc.status === 'Charging')
    }
    return (c.connectors ?? []).some((cc) => cc.status === 'Charging') || c.status === 'Charging'
  }

  const isOnline = (c: Charger) => {
    const live = liveState[c.charge_point_id]
    return live?.isOnline ?? c.is_online
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/15">
            <ScrollText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{t('logs.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('logs.subtitle')}</p>
          </div>
        </div>

        {/* Charger selector */}
        {chargers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-gray-400 font-medium">{t('logs.selectCharger')}</span>
            {chargers.map((c) => {
              const isSelected = currentCpId === c.charge_point_id
              const charging = isCharging(c)
              const online = isOnline(c)
              const displayName = displayNames[c.charge_point_id] || c.charge_point_id

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCpId(c.charge_point_id)}
                  className={`relative px-4 py-2.5 rounded-2xl text-xs font-medium border transition-all duration-300 flex items-center gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/50'
                      : 'bg-gray-900/80 border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200 hover:bg-gray-800/80 shadow-sm'
                  } ${charging ? 'border-cyan-400/60 shadow-cyan-500/20' : ''}`}
                >
                  {charging ? (
                    <div className="relative flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-cyan-400 opacity-75" />
                      <Zap className="w-4 h-4 text-cyan-400 animate-bounce" fill="currentColor" />
                    </div>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-gray-600'}`} />
                  )}
                  <div className="text-left">
                    <p className="font-mono font-bold leading-tight text-xs">{displayName}</p>
                    {displayName !== c.charge_point_id && (
                      <p className="text-[10px] opacity-60 mt-0.5 font-mono">{c.charge_point_id}</p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* OCPP Log Viewer */}
      {currentCpId ? (
        <OcppLogViewer messages={messages} cpId={currentCpId} maxHeight="calc(50vh - 80px)" />
      ) : (
        <div className="card flex flex-col items-center justify-center py-16 text-center gap-4">
          <ScrollText className="w-8 h-8 text-gray-600" />
          <p className="text-gray-400 font-medium">Sem chargers ligados</p>
        </div>
      )}

      {/* Live Events */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{t('dashboard.liveEvents')}</h2>
          <span className="live-pill">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            LIVE
          </span>
        </div>
        <EventLog maxHeight="calc(50vh - 80px)" />
      </div>
    </div>
  )
}
