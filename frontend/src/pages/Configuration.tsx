import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings, Lock, Edit2, Check, X, RefreshCw, Loader } from 'lucide-react'
import { api } from '../api'
import type { Charger, ConfigurationItem } from '../types'

export function Configuration() {
  const qc = useQueryClient()
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const [cpId, setCpId] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { data: config = [] } = useQuery<ConfigurationItem[]>({
    queryKey: ['config', cpId],
    queryFn: () => api.getConfiguration(cpId),
    enabled: !!cpId,
  })

  const handleSync = async () => {
    if (!cpId) return
    setSyncing(true)
    try {
      await api.getConfigurationRemote(cpId)
      await qc.invalidateQueries({ queryKey: ['config', cpId] })
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async (key: string) => {
    if (!cpId) return
    setSaving(true)
    try {
      await api.changeConfiguration(cpId, key, editVal)
      await qc.invalidateQueries({ queryKey: ['config', cpId] })
      setEditing(null)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Configuração</h1>
        <p className="text-sm text-gray-500 mt-0.5">Parâmetros OCPP do charger</p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-xs">
          <label className="label">Charger</label>
          <select className="select" value={cpId} onChange={(e) => setCpId(e.target.value)}>
            <option value="">— seleccionar —</option>
            {chargers.map((c) => <option key={c.id} value={c.charge_point_id}>{c.charge_point_id}</option>)}
          </select>
        </div>
        <button
          className="btn-secondary"
          disabled={!cpId || syncing}
          onClick={handleSync}
        >
          {syncing ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sincronizar do charger
        </button>
      </div>

      {config.length === 0 && cpId && (
        <div className="card flex flex-col items-center py-10 text-gray-600 text-sm gap-2">
          <Settings className="w-8 h-8 text-gray-700" />
          Sem configuração em cache. Carrega em "Sincronizar do charger" para ler.
        </div>
      )}

      {config.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Chave</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Valor</th>
                  <th className="px-5 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {config.map((item) => (
                  <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {item.readonly && <Lock className="w-3 h-3 text-gray-600 shrink-0" />}
                        <span className="font-mono text-gray-300">{item.key}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {editing === item.id ? (
                        <input
                          className="input py-1 text-xs"
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono text-gray-400">{item.value ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {item.readonly ? null : editing === item.id ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            className="btn-ghost p-1.5 text-emerald-400"
                            disabled={saving}
                            onClick={() => handleSave(item.key)}
                          >
                            {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button className="btn-ghost p-1.5 text-red-400" onClick={() => setEditing(null)}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-ghost p-1.5 ml-auto flex"
                          onClick={() => { setEditing(item.id); setEditVal(item.value ?? '') }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
