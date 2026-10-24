import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Plus, Trash2, Edit2, RefreshCw, Zap } from 'lucide-react'
import { api } from '../api'
import type { AuthToken, Charger } from '../types'
import { useI18n } from '../i18n'

type TokenType = 'rfid' | 'pin' | 'vid'
type TokenStatus = 'Accepted' | 'Blocked' | 'Expired'

const TYPE_BADGE: Record<TokenType, string> = {
  rfid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  pin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  vid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
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
  const { t } = useI18n()
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

  function openEdit(token: AuthToken) {
    setForm({
      name: token.name,
      id_tag: token.id_tag,
      type: token.type as TokenType,
      status: token.status as TokenStatus,
      expiry_date: token.expiry_date ? token.expiry_date.substring(0, 10) : '',
      note: token.note ?? '',
    })
    setFormError('')
    setModal({ open: true, token })
  }

  function closeModal() {
    setModal({ open: false, token: null })
    setFormError('')
  }

  function validateForm(): boolean {
    if (!form.name.trim()) { setFormError(t('authentication.nameRequired')); return false }
    if (!form.id_tag.trim()) { setFormError(t('authentication.idTagRequired')); return false }
    if (form.type === 'pin' && !/^\d{6}$/.test(form.id_tag)) {
      setFormError(t('authentication.pinDigitsRequired'))
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
      setSyncMsg(t('authentication.syncSuccess'))
    } catch {
      setSyncMsg(t('authentication.syncError'))
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('authentication.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('authentication.subtitle')}</p>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('authentication.authorizedTokens')}</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <select
              className="text-sm border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:border-gray-700 text-slate-900 dark:text-white"
              value={syncCpId}
              onChange={e => { setSyncCpId(e.target.value); setSyncMsg('') }}
            >
              <option value="">{t('authentication.selectStation')}</option>
              {chargers.filter(c => c.is_online).map(c => (
                <option key={c.charge_point_id} value={c.charge_point_id}>{c.charge_point_id}</option>
              ))}
            </select>
            <button
              onClick={handleSync}
              disabled={!syncCpId}
              className="btn btn-secondary flex items-center justify-center gap-1.5 text-sm disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              {t('authentication.syncBtn')}
            </button>
            <button onClick={openCreate} className="btn flex items-center justify-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              {t('authentication.addTokenBtn')}
            </button>
          </div>
        </div>
        {syncMsg && (
          <p className={`text-sm mb-3 ${syncMsg.includes('sucesso') || syncMsg.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{syncMsg}</p>
        )}
        {tokensLoading ? (
          <div className="text-center py-8 text-gray-400">{t('authentication.loading')}</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>{t('authentication.noTokens')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">{t('authentication.colName')}</th>
                  <th className="text-left py-2 px-3">{t('authentication.colType')}</th>
                  <th className="text-left py-2 px-3">{t('authentication.colIdTag')}</th>
                  <th className="text-left py-2 px-3">{t('authentication.colStatus')}</th>
                  <th className="text-left py-2 px-3">{t('authentication.colExpiry')}</th>
                  <th className="text-left py-2 px-3">{t('authentication.colNote')}</th>
                  <th className="text-right py-2 px-3">{t('authentication.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map(token => (
                  <tr key={token.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{token.name}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[token.type as TokenType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABEL[token.type as TokenType] ?? token.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-slate-800 dark:text-gray-200">{token.id_tag}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => updateMut.mutate({ id: token.id, data: { status: token.status === 'Accepted' ? 'Blocked' : 'Accepted' } })}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${
                          token.status === 'Accepted' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                          token.status === 'Blocked' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {token.status}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{token.expiry_date ? token.expiry_date.substring(0, 10) : '—'}</td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{token.note ?? '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => openEdit(token)} className="p-1 text-gray-400 hover:text-blue-600 mr-1">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteMut.mutate(token.id)} className="p-1 text-gray-400 hover:text-red-600">
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('authentication.autochargeTitle')}</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('authentication.autochargeDesc')}</p>
        {chargers.length === 0 ? (
          <div className="text-gray-400 text-sm">{t('authentication.noChargers')}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chargers.map(c => (
              <div key={c.charge_point_id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="font-medium text-sm text-slate-900 dark:text-white">{c.charge_point_id}</p>
                  <p className="text-xs text-gray-400">{c.model ?? t('common.unknown')} {c.is_online ? t('authentication.onlineBadge') : t('authentication.offlineBadge')}</p>
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-slate-200 dark:border-white/10">
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">{modal.token ? t('authentication.editTokenModal') : t('authentication.newTokenModal')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('authentication.nameLabel')}</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('authentication.namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('authentication.typeLabel')}</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as TokenType, id_tag: '' }))}
                >
                  <option value="rfid">{t('authentication.rfidOption')}</option>
                  <option value="pin">{t('authentication.pinOption')}</option>
                  <option value="vid">{t('authentication.vidOption')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {form.type === 'rfid' ? t('authentication.uidLabel') : form.type === 'pin' ? t('authentication.pinCodeLabel') : t('authentication.vidPlateLabel')}
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.id_tag}
                  onChange={e => setForm(f => ({ ...f, id_tag: form.type === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value }))}
                  placeholder={form.type === 'rfid' ? 'A1B2C3D4' : form.type === 'pin' ? '123456' : 'AA-00-BB'}
                  maxLength={form.type === 'pin' ? 6 : 128}
                />
                {form.type === 'pin' && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">{t('authentication.pinHint')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('authentication.statusLabel')}</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as TokenStatus }))}
                >
                  <option value="Accepted">Accepted</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('authentication.expiryLabel')}</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.expiry_date}
                  onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('authentication.noteLabel')}</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder={t('authentication.notePlaceholder')}
                />
              </div>
              {formError && <p className="text-red-600 dark:text-red-400 text-sm">{formError}</p>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={closeModal} className="btn btn-secondary text-sm">{t('authentication.cancelBtn')}</button>
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                className="btn text-sm disabled:opacity-50"
              >
                {modal.token ? t('authentication.saveBtn') : t('authentication.createBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
