import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserPlus, Shield, Key, Zap,
  Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw, X, Search,
  History, Clock, BatteryCharging, ArrowRight, User as UserIcon
} from 'lucide-react'
import { api, UserProfile, AuthorizedTag } from '../api'
import { useAuthStore } from '../store/authStore'
import { safeFormatDate, safeFormatDuration } from '../utils/date'
import type { Transaction } from '../types'

export function UsersManagement() {
  const qc = useQueryClient()
  const currentAdmin = useAuthStore((s) => s.user)

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<UserProfile | null>(null)

  // Form State
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [rfidTag, setRfidTag] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Fetch all users
  const { data: users = [], isLoading, refetch } = useQuery<UserProfile[]>({
    queryKey: ['admin-users'],
    queryFn: api.getUsers,
    refetchInterval: 4000,
  })

  // Fetch authorized tags
  const { data: tags = [] } = useQuery<AuthorizedTag[]>({
    queryKey: ['tags'],
    queryFn: api.getTags,
  })

  // Fetch all transactions to filter by user in the history modal
  const { data: allTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.getTransactions(),
    refetchInterval: 5000,
  })

  const openCreateModal = () => {
    setEditingUser(null)
    setUsername('')
    setEmail('')
    setPassword('')
    setRole('user')
    setRfidTag('')
    setFormError(null)
    setModalOpen(true)
  }

  const openEditModal = (u: UserProfile) => {
    setEditingUser(u)
    setUsername(u.username)
    setEmail(u.email || '')
    setPassword('')
    setRole(u.role)
    setRfidTag(u.rfid_tag || '')
    setFormError(null)
    setModalOpen(true)
  }

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  const createMutation = useMutation({
    mutationFn: (data: { username: string; password: string; email?: string; role: string; rfid_tag?: string }) =>
      api.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setModalOpen(false)
      showSuccess('Utilizador criado com sucesso!')
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.detail || err.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setModalOpen(false)
      showSuccess('Utilizador atualizado com sucesso!')
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.detail || err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      showSuccess('Utilizador eliminado.')
    },
    onError: (err: any) => {
      alert(`Erro ao eliminar: ${err?.response?.data?.detail || err.message}`)
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!username.trim()) {
      setFormError('O nome de utilizador é obrigatório.')
      return
    }

    if (!editingUser && (!password || password.length < 4)) {
      setFormError('A palavra-passe deve ter pelo menos 4 caracteres.')
      return
    }

    if (editingUser) {
      const payload: any = {
        email: email.trim() || undefined,
        role,
        rfid_tag: rfidTag.trim() || undefined,
      }
      if (password && password.length >= 4) {
        payload.password = password
      }
      updateMutation.mutate({ id: editingUser.id, data: payload })
    } else {
      createMutation.mutate({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        role,
        rfid_tag: rfidTag.trim() || undefined,
      })
    }
  }

  const handleDelete = (u: UserProfile) => {
    if (u.id === currentAdmin?.id) {
      alert('Não podes eliminar a tua própria conta de administrador!')
      return
    }
    if (confirm(`Tens a certeza que desejas eliminar o utilizador "${u.username}"?`)) {
      deleteMutation.mutate(u.id)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.rfid_tag && u.rfid_tag.toLowerCase().includes(q))
    )
  })

  const totalKwh = users.reduce((acc, u) => acc + (u.total_kwh || 0), 0)
  const totalUsers = users.length
  const totalAdmins = users.filter((u) => u.role === 'admin').length
  const usersChargingNow = users.filter((u) => u.active_charge !== null && u.active_charge !== undefined).length

  // Filter transactions for history modal
  const userTransactions = selectedUserForHistory?.rfid_tag
    ? allTransactions.filter((tx) => tx.id_tag === selectedUserForHistory.rfid_tag)
    : []

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Gestão de Utilizadores e Consumos
          </h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            Controlo de acessos, associação de chaves RFID e histórico de consumos em tempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center gap-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>

          <button
            onClick={openCreateModal}
            className="btn btn-primary flex items-center gap-2 text-xs shadow-md shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Utilizador</span>
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-fade-up">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPIs Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Utilizadores Totais</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {totalUsers} <span className="text-xs font-normal text-slate-500">({totalAdmins} Admin)</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">A Carregar Agora</span>
            <div className="text-2xl font-bold font-mono mt-1 flex items-center gap-2">
              <span className={usersChargingNow > 0 ? "text-emerald-500 animate-pulse" : "text-slate-900 dark:text-white"}>
                {usersChargingNow}
              </span>
              {usersChargingNow > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              )}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
            <BatteryCharging className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Chaves RFID Atribuídas</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {users.filter((u) => !!u.rfid_tag).length}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
            <Key className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Consumo Global Users</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {totalKwh.toFixed(1)} <span className="text-xs font-normal text-slate-500">kWh</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-500">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card p-6 border border-slate-200 dark:border-white/10 space-y-4">
        {/* Search bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, email ou RFID…"
              className="input pl-9 w-full text-xs"
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
            {filteredUsers.length} de {users.length} utilizadores
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
            A carregar lista de utilizadores…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-gray-500 text-sm">
            Nenhum utilizador encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-left">
              <thead>
                <tr>
                  <th>Utilizador</th>
                  <th>Cargo</th>
                  <th>Chave RFID</th>
                  <th>Estado / Sessão Live</th>
                  <th>Consumo Acumulado</th>
                  <th>Sessões</th>
                  <th>Última Carga</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isCharging = Boolean(u.active_charge)

                  return (
                    <tr
                      key={u.id}
                      className={isCharging ? "bg-emerald-500/[0.04] border-l-4 border-l-emerald-500" : ""}
                    >
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300">
                            <UserIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-xs text-slate-900 dark:text-white block">
                              {u.username}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-gray-400">
                              {u.email || 'Sem email'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                          u.role === 'admin'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                          {u.role === 'admin' ? 'Administrador' : 'Condutor'}
                        </span>
                      </td>
                      <td>
                        {u.rfid_tag ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-gray-800/80 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-gray-700">
                              {u.rfid_tag}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sem Chave</span>
                        )}
                      </td>
                      <td>
                        {isCharging && u.active_charge ? (
                          <div className="inline-flex flex-col gap-0.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                            <div className="flex items-center gap-1.5 font-bold text-[11px]">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                              <span>{u.active_charge.charge_point_id} · T#{u.active_charge.connector_id}</span>
                            </div>
                            <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                              ⚡ {u.active_charge.current_power_kw} kW · {u.active_charge.consumed_kwh} kWh
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Disponível</span>
                        )}
                      </td>
                      <td>
                        <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          {u.total_kwh ?? 0} kWh
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedUserForHistory(u)}
                          className="font-mono text-xs text-slate-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 underline decoration-dotted flex items-center gap-1"
                          title="Ver transações deste utilizador"
                        >
                          <span>{u.total_sessions ?? 0} cargas</span>
                          <History className="w-3 h-3 opacity-60" />
                        </button>
                      </td>
                      <td className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                        {u.last_charge_time ? safeFormatDate(u.last_charge_time, 'dd/MM/yyyy HH:mm') : '—'}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedUserForHistory(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-blue-500 transition-colors"
                            title="Histórico de Cargas"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-600 dark:text-gray-300 transition-colors"
                            title="Editar Utilizador"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={u.id === currentAdmin?.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Eliminar Utilizador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Transaction History Modal */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 max-w-3xl w-full border border-slate-200 dark:border-white/10 shadow-2xl bg-white dark:bg-gray-900 rounded-2xl animate-fade-up max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Histórico de Cargas: {selectedUserForHistory.username}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Chave RFID: <span className="font-mono text-emerald-500 font-bold">{selectedUserForHistory.rfid_tag || 'Sem Tag'}</span> · Total: {selectedUserForHistory.total_kwh ?? 0} kWh
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {userTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 dark:text-gray-500 space-y-2">
                  <Clock className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-sm font-medium">Nenhuma transação registada para esta chave RFID.</p>
                </div>
              ) : (
                <table className="table w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Posto</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Duração</th>
                      <th>Consumo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTransactions.map((tx) => {
                      const duration = tx.start_time && tx.stop_time
                        ? safeFormatDuration(
                            (new Date(tx.stop_time).getTime() - new Date(tx.start_time).getTime()) / 1000
                          )
                        : tx.status === 'Active' ? 'A decorrer…' : '—'

                      return (
                        <tr key={tx.id || tx.transaction_id}>
                          <td className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            #{tx.transaction_id}
                          </td>
                          <td className="font-medium text-slate-800 dark:text-gray-200">
                            {tx.charge_point_id} (T#{tx.connector_id})
                          </td>
                          <td className="font-mono text-slate-600 dark:text-gray-400">
                            {safeFormatDate(tx.start_time, 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td className="font-mono text-slate-600 dark:text-gray-400">
                            {tx.stop_time ? safeFormatDate(tx.stop_time, 'dd/MM/yyyy HH:mm') : '—'}
                          </td>
                          <td className="font-mono text-slate-700 dark:text-gray-300">
                            {duration}
                          </td>
                          <td className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {tx.energy_kwh ?? 0} kWh
                          </td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              tx.status === 'Active'
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 animate-pulse'
                                : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400'
                            }`}>
                              {tx.status === 'Active' ? 'A Carregar' : 'Concluído'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-end shrink-0 mt-3">
              <button
                type="button"
                onClick={() => setSelectedUserForHistory(null)}
                className="btn btn-secondary text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 max-w-md w-full border border-slate-200 dark:border-white/10 shadow-2xl bg-white dark:bg-gray-900 rounded-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  {editingUser ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingUser ? `Editar: ${editingUser.username}` : 'Novo Utilizador'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Nome de Utilizador *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!!editingUser}
                  placeholder="ex: marco.canditos"
                  className="input w-full text-xs disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Email (Opcional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: marco@canditos.com"
                  className="input w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {editingUser ? 'Nova Palavra-passe (Deixar em branco para manter)' : 'Palavra-passe *'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Mínimo 4 caracteres'}
                  className="input w-full text-xs"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Cargo / Permissão
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="select w-full text-xs"
                >
                  <option value="user">Utilizador Comum (Portal do Condutor)</option>
                  <option value="admin">Administrador (Acesso Total ao Sistema)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  Chave RFID Associada (id_tag)
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={rfidTag}
                    onChange={(e) => setRfidTag(e.target.value)}
                    placeholder="ex: VERSICHARGE_TAG ou 9F13FB29"
                    className="input w-full text-xs font-mono"
                  />
                  {tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                      <span>Sugestões da White-list:</span>
                      {tags.slice(0, 5).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setRfidTag(t.id_tag)}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800 hover:bg-blue-500/10 text-slate-700 dark:text-gray-300 font-mono text-[10px] border border-slate-200 dark:border-gray-700"
                        >
                          {t.id_tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-white/10 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn btn-primary text-xs"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'A guardar…' : 'Guardar Utilizador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
