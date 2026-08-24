import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Lock, Edit2, Check, X, RefreshCw, Loader, Tag, Plus, Trash2, ShieldCheck, AlertCircle } from 'lucide-react'
import { api, AuthorizedTag } from '../api'
import type { Charger, ConfigurationItem } from '../types'

export function Configuration() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'config' | 'tags'>('config')

  // Chargers
  const { data: chargers = [] } = useQuery<Charger[]>({ queryKey: ['chargers'], queryFn: api.getChargers })
  const [cpId, setCpId] = useState('')

  // Automatically select first charger
  React.useEffect(() => {
    if (!cpId && chargers.length > 0) {
      setCpId(chargers[0].charge_point_id)
    }
  }, [chargers, cpId])

  // Configuration Table State
  const [editing, setEditing] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { data: config = [] } = useQuery<ConfigurationItem[]>({
    queryKey: ['config', cpId],
    queryFn: () => api.getConfiguration(cpId),
    enabled: !!cpId,
  })

  // Tags State
  const { data: tags = [], refetch: refetchTags } = useQuery<AuthorizedTag[]>({
    queryKey: ['tags'],
    queryFn: api.getTags,
  })

  const [newTagId, setNewTagId] = useState('')
  const [newTagDesc, setNewTagDesc] = useState('')
  const [tagFeedback, setTagFeedback] = useState<string | null>(null)

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

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTagId.trim()) return
    try {
      await api.createTag(newTagId.trim(), newTagDesc.trim() || undefined)
      setNewTagId('')
      setNewTagDesc('')
      setTagFeedback('Tag autorizada criada com sucesso!')
      setTimeout(() => setTagFeedback(null), 4000)
      refetchTags()
      qc.invalidateQueries({ queryKey: ['tags'] })
    } catch (err: any) {
      setTagFeedback('Erro ao adicionar tag.')
    }
  }

  const handleDeleteTag = async (id: number) => {
    try {
      await api.deleteTag(id)
      refetchTags()
      qc.invalidateQueries({ queryKey: ['tags'] })
    } catch (err: any) {
      // ignore
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Configuração & Acessos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Parâmetros OCPP dos postos e controlo de tags RFID autorizadas</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'config'
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          Parâmetros OCPP
        </button>

        <button
          onClick={() => setActiveTab('tags')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'tags'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          <Tag className="w-4 h-4" />
          Tags RFID & Autorizações
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
            {tags.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: PARÂMETROS OCPP ─────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 max-w-xs">
              <label className="label">Posto Alvo</label>
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
            <div className="card flex flex-col items-center py-10 text-gray-500 text-sm gap-2">
              <Settings className="w-8 h-8 text-gray-700" />
              Sem configuração em cache. Carrega em "Sincronizar do charger" para ler as chaves OCPP reais.
            </div>
          )}

          {config.length > 0 && (
            <div className="card p-0 overflow-hidden border border-white/8">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/6 bg-slate-100 dark:bg-gray-950/60">
                      <th className="text-left px-5 py-3 text-slate-800 dark:text-gray-300 font-bold uppercase tracking-wider text-[11px]">Chave</th>
                      <th className="text-left px-5 py-3 text-slate-800 dark:text-gray-300 font-bold uppercase tracking-wider text-[11px]">Valor</th>
                      <th className="px-5 py-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.map((item) => (
                      <tr key={item.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {item.readonly && <Lock className="w-3 h-3 text-gray-600 shrink-0" />}
                            <span className="font-mono text-gray-300">{item.key}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {editing === item.id ? (
                            <input
                              className="input py-1 text-xs font-mono"
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
                              className="btn-ghost p-1.5 ml-auto flex text-gray-400 hover:text-white"
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
      )}

      {/* ── TAB 2: TAGS RFID & AUTORIZAÇÕES ─────────────────────────────────── */}
      {activeTab === 'tags' && (
        <div className="space-y-6">
          {/* Add Tag Form Card */}
          <div className="card border border-emerald-500/20 bg-emerald-950/10 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-gray-100">Adicionar Nova Tag Autorizada</h3>
            </div>

            <form onSubmit={handleAddTag} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="label">ID Tag / Cartão RFID</label>
                <input
                  className="input font-mono text-xs"
                  placeholder="ex: VERSICHARGE_01 ou 04A1B2C3D4"
                  value={newTagId}
                  onChange={(e) => setNewTagId(e.target.value)}
                  required
                />
              </div>

              <div className="flex-1 w-full">
                <label className="label">Descrição / Utilizador</label>
                <input
                  className="input text-xs"
                  placeholder="ex: Cartão Principal Siemens / BMW i3"
                  value={newTagDesc}
                  onChange={(e) => setNewTagDesc(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs py-2.5 px-4 rounded-xl flex items-center gap-2 font-bold shrink-0 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Tag</span>
              </button>
            </form>

            {tagFeedback && (
              <p className="text-xs text-emerald-400 mt-2 font-medium animate-fade-up">
                ✓ {tagFeedback}
              </p>
            )}
          </div>

          {/* Tags Table */}
          <div className="card p-0 overflow-hidden border border-white/8">
            <div className="px-5 py-3.5 border-b border-white/6 bg-gray-950/60 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Lista de Tags Autorizadas no Servidor OCPP
              </span>
              <span className="text-xs text-gray-500 font-mono">{tags.length} ativas</span>
            </div>

            {tags.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-600 flex flex-col items-center gap-2">
                <AlertCircle className="w-5 h-5 text-gray-600" />
                Sem tags registadas. Adiciona uma tag acima para permitir iniciar carregamentos.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/6 text-gray-500 font-medium bg-gray-900/40">
                      <th className="text-left px-5 py-3">ID Tag</th>
                      <th className="text-left px-5 py-3">Descrição</th>
                      <th className="text-left px-5 py-3">Estado</th>
                      <th className="text-right px-5 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tags.map((t, idx) => (
                      <tr key={t.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                        <td className="px-5 py-3 font-mono font-bold text-gray-200">
                          <div className="flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{t.id_tag}</span>
                            {idx === 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans font-medium">
                                Tag Padrão Dashboard
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-400">{t.description || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Autorizado
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDeleteTag(t.id)}
                            className="btn-ghost p-1.5 text-red-400 hover:text-red-300 rounded-lg inline-flex"
                            title="Eliminar Tag"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
