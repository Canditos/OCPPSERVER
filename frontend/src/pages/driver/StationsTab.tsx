import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wifi, WifiOff, Zap, CheckCircle, Clock } from 'lucide-react'
import { api } from '../../api'
import type { Charger } from '../../types'
import { useTheme } from '../../hooks/useTheme'

function statusLabel(status: string) {
  switch (status) {
    case 'Available': return { label: 'Disponível', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/20' }
    case 'Charging':
    case 'Occupied': return { label: 'Ocupado', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20' }
    case 'Reserved': return { label: 'Reservado', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/20' }
    case 'Faulted': return { label: 'Avaria', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/20' }
    case 'Unavailable': return { label: 'Indisponível', color: 'text-gray-400', bg: 'bg-gray-500/15 border-gray-500/20' }
    default: return { label: status, color: 'text-gray-400', bg: 'bg-gray-500/15 border-gray-500/20' }
  }
}

export function StationsTab() {
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'

  const { data: chargers = [], isLoading } = useQuery<Charger[]>({
    queryKey: ['chargers-driver'],
    queryFn: api.getChargers,
    refetchInterval: 8000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1,2,3].map(i => (
          <div key={i} className={`h-24 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    )
  }

  const online = chargers.filter(c => c.is_online)
  const offline = chargers.filter(c => !c.is_online)

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Online', value: online.length, icon: Wifi, color: isDark ? 'text-emerald-400' : 'text-emerald-600', bg: 'bg-emerald-500/10' },
          { label: 'Em Carga', value: chargers.filter(c => c.status === 'Charging').length, icon: Zap, color: isDark ? 'text-blue-400' : 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'Disponíveis', value: chargers.filter(c => c.is_online && c.status === 'Available').length, icon: CheckCircle, color: isDark ? 'text-amber-400' : 'text-amber-600', bg: 'bg-amber-500/10' },
        ].map(s => (
          <div key={s.label} className={`p-3 rounded-2xl text-center ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-100'} shadow-sm`}>
            <div className={`inline-flex p-2 rounded-xl mb-2 ${s.bg}`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charger cards */}
      <div className="space-y-3">
        {[...online, ...offline].map(charger => {
          const { label, color, bg } = statusLabel(charger.status || 'Unknown')
          const connectors = charger.connectors || []

          return (
            <div
              key={charger.charge_point_id}
              className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900 border border-white/8' : 'bg-white border border-slate-100'} shadow-sm`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${charger.is_online ? 'bg-emerald-500/15' : 'bg-gray-500/15'}`}>
                    {charger.is_online
                      ? <Wifi className="w-4 h-4 text-emerald-400" />
                      : <WifiOff className="w-4 h-4 text-gray-500" />
                    }
                  </div>
                  <div>
                    <span className={`font-bold text-sm block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {charger.charge_point_id}
                    </span>
                    {charger.model && (
                      <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>{charger.model}</span>
                    )}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${bg} ${color}`}>
                  {charger.is_online ? label : 'Offline'}
                </span>
              </div>

              {/* Connectors */}
              {connectors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {connectors.map(conn => {
                    const cSt = statusLabel(conn.status || 'Unknown')
                    return (
                      <div
                        key={conn.connector_id}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border ${cSt.bg}`}
                      >
                        <span className={`font-mono font-bold ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>#{conn.connector_id}</span>
                        <span className={`font-medium ${cSt.color}`}>{cSt.label}</span>
                        {conn.status === 'Charging' && (
                          <Zap className={`w-3 h-3 ${cSt.color} animate-pulse`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {chargers.length === 0 && (
        <div className={`text-center py-16 ${isDark ? 'text-gray-600' : 'text-slate-400'}`}>
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Sem postos configurados</p>
        </div>
      )}
    </div>
  )
}
