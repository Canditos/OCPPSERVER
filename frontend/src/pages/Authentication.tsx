import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Plus, Trash2, Edit2, RefreshCw, Zap } from 'lucide-react'
import { api } from '../api'
import type { AuthToken, Charger } from '../types'

type TokenType = 'rfid' | 'pin' | 'vid'
type TokenStatus = 'Accepted' | 'Blocked' | 'Expired'

const TYPE_BADGE: Record<TokenType, string> = {
  rfid: 'bg-blue-100 text-blue-800',
  pin: 'bg-violet-100 text-violet-800',
  vid: 'bg-amber-100 text-amber-800',
}

const TYPE_LABEL: Record<TokenType, string> = {
  rfid: 'RFID',
  pin: 'PIN',
  vid: 'VID',
}

interface TokenForm {
  name: string
  id_tag: string
  type: TokenType
  status: TokenStatus
  expiry_date: string
  note: string
}

const EMPTY_FORM: TokenForm = {
  name: '',
  id_tag: '',
  type: 'rfid',
  status: 'Accepted',
  expiry_date: '',
  note: '',
}

export default function Authentication() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; token: AuthToken | null }>({ open: false, token: null })
  const [form, setForm] = useState<TokenForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [syncCpId, setSyncCpId] = useState('')
  const [syncMsg, setSyncMsg] = useState('')

  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['auth-tokens'],
    queryFn: api.getAuthTokens,
  })

  const { data: chargers = [] } = useQuery<Charger[]>({
    queryKey: ['chargers'],
    queryFn: api.getChargers,
  })

  const createMut = useMutation({
    mutationFn: (data: typeof form) => api.createAuthToken({
      ...data,
      expiry_date: data.expiry_date || null,
      note: data.note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth-tokens'] }); closeModal() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AuthToken> }) => api.updateAuthToken(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth-tokens'] }); closeModal() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteAuthToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-tokens'] }),
  })

  const autoMut = useMutation({
    mutationFn: ({ cpId, enabled }: { cpId: string; enabled: boolean }) => api.setAutocharge(cpId, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chargers'] }),
  })

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setModal({ open: true, token: null })
  }

  function openEdit(t: AuthToken) {
    setForm({
      name: t.name,
      id_tag: t.id_tag,
      type: t.type as TokenType,
      status: t.status as TokenStatus,
      expiry_date: t.expiry_date ? t.expiry_date.substring(0, 10) : '',
      note: t.note ?? '',
    })
    setFormError('')
    setModal({ open: true, token: t })
  }

  function closeModal() {
    setModal({ open: false, token: null })
    setFormError('')
  }

  function validateForm(): boolean {
    if (!form.name.trim()) { setFormError('Nome é obrigatório'); return false }
    if (!form.id_tag.trim()) { setFormError('ID Tag é obrigatório'); return false }
    if (form.type === 'pin' && !/^\d{6}$/.test(form.id_tag)) {
      setFormError('PIN deve ter exactamente 6 dígitos numéricos (Sicharge D)')
      return false
    }
    return true
  }

  function handleSubmit() {
    if (!validateForm()) return
    if (modal.token) {
      updateMut.mutate({ id: modal.token.id, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  async function handleSync() {
    if (!syncCpId) return
    setSyncMsg('')
    try {
      await api.syncAuthTokens(syncCpId)
      setSyncMsg('Lista enviada com sucesso!')
    } catch {
      setSyncMsg('Erro ao sincronizar.')
    }
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Autenticação</h1>
          <p className="text-sm text-gray-500">Gestão de tokens RFID, PIN, VID e Autocharge por posto</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tokens Autorizados</h2>
          <div className="flex gap-2 flex-wrap">
            <select
              className="text-sm border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:border-gray-700"
              value={syncCpId}
              onChange={e => { setSyncCpId(e.target.value); setSyncMsg('') }}
            >
              <option value="">Seleccionar posto...</option>
              {chargers.filter(c => c.is_online).map(c => (
                <option key={c.charge_point_id} value={c.charge_point_id}>{c.charge_point_id}</option>
              ))}
            </select>
            <button
              onClick={handleSync}
              disabled={!syncCpId}
              className="btn btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              Sincronizar
            </button>
            <button onClick={openCreate} className="btn flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              Adicionar Token
            </button>
          </div>
        </div>
        {syncMsg && (
          <p className={`text-sm mb-3 ${syncMsg.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>{syncMsg}</p>
        )}
        {tokensLoading ? (
          <div className="text-center py-8 text-gray-400">A carregar...</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Sem tokens configurados — todos os idTags são aceites (modo aberto)</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Nome</th>
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">ID Tag</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Expiry</th>
                  <th className="text-left py-2 px-3">Nota</th>
                  <th className="text-right py-2 px-3">Acções</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map(t => (
                  <tr key={t.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3 font-medium">{t.name}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[t.type as TokenType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABEL[t.type as TokenType] ?? t.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{t.id_tag}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => updateMut.mutate({ id: t.id, data: { status: t.status === 'Accepted' ? 'Blocked' : 'Accepted' } })}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${
                          t.status === 'Accepted' ? 'bg-green-100 text-green-800' :
                          t.status === 'Blocked' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {t.status}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-gray-500">{t.expiry_date ? t.expiry_date.substring(0, 10) : '—'}</td>
                    <td className="py-2 px-3 text-gray-500 max-w-[160px] truncate">{t.note ?? '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => openEdit(t)} className="p-1 text-gray-400 hover:text-blue-600 mr-1">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteMut.mutate(t.id)} className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Autocharge por Posto</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Quando activo, o posto aceita carga sem autenticação (plug-and-charge).</p>
        {chargers.length === 0 ? (
          <div className="text-gray-400 text-sm">Sem postos registados.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chargers.map(c => (
              <div key={c.charge_point_id} className="flex items-center justify-between p-3 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="font-medium text-sm">{c.charge_point_id}</p>
                  <p className="text-xs text-gray-400">{c.model ?? 'Desconhecido'} {c.is_online ? '🟢 Online' : '⚫ Offline'}</p>
                </div>
                <button
                  onClick={() => autoMut.mutate({ cpId: c.charge_point_id, enabled: !c.autocharge_enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    c.autocharge_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    c.autocharge_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">{modal.token ? 'Editar Token' : 'Novo Token'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="João Silva"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as TokenType, id_tag: '' }))}
                >
                  <option value="rfid">RFID (cartão)</option>
                  <option value="pin">PIN (6 dígitos — Sicharge D)</option>
                  <option value="vid">VID (matrícula)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {form.type === 'rfid' ? 'UID do Cartão' : form.type === 'pin' ? 'Código PIN (6 dígitos)' : 'Matrícula'}
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:border-gray-700"
                  value={form.id_tag}
                  onChange={e => setForm(f => ({ ...f, id_tag: form.type === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value }))}
                  placeholder={form.type === 'rfid' ? 'A1B2C3D4' : form.type === 'pin' ? '123456' : 'AA-00-BB'}
                  maxLength={form.type === 'pin' ? 6 : 128}
                />
                {form.type === 'pin' && (
                  <p className="text-xs text-violet-600 mt-1">O Sicharge D usa PINs de exactamente 6 dígitos.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as TokenStatus }))}
                >
                  <option value="Accepted">Accepted</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data de Expiração (opcional)</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  value={form.expiry_date}
                  onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nota (opcional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Veículo: Tesla Model 3"
                />
              </div>
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={closeModal} className="btn btn-secondary text-sm">Cancelar</button>
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                className="btn text-sm disabled:opacity-50"
              >
                {modal.token ? 'Guardar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
