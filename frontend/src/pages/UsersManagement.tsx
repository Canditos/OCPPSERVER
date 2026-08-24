import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserPlus, Shield, Key, Zap,
  Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw, X, Search,
  History, Clock, BatteryCharging, ArrowRight, User as UserIcon, Mail, Send,
  UserCheck, UserX, Sparkles, Filter, Check
} from 'lucide-react'
import { api, UserProfile, AuthorizedTag } from '../api'
import { useAuthStore } from '../store/authStore'
import { safeFormatDate, safeFormatDuration } from '../utils/date'
import type { Transaction } from '../types'
import { useI18n } from '../i18n'

export function UsersManagement() {
  const qc = useQueryClient()
  const currentAdmin = useAuthStore((s) => s.user)
  const { t } = useI18n()

  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'charging' | 'admin' | 'user'>('all')

  // Modals
  const [modalOpen, setModalOpen] = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [userToApprove, setUserToApprove] = useState<UserProfile | null>(null)
  const [approveRfid, setApproveRfid] = useState('')

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<UserProfile | null>(null)

  // Form State
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [rfidTag, setRfidTag] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const getDurationLabel = (startTime?: string | null, stopTime?: string | null) => {
    if (!startTime || !stopTime) return '0m'
    const startMs = new Date(startTime).getTime()
    const stopMs = new Date(stopTime).getTime()
    if (isNaN(startMs) || isNaN(stopMs) || stopMs <= startMs) return '0m'
    return safeFormatDuration(Math.floor((stopMs - startMs) / 1000))
  }

  // Fetch all users
  const { data: users = [], isLoading, refetch } = useQuery<UserProfile[]>({
    queryKey: ['admin-users'],
    queryFn: api.getUsers,
    refetchInterval: 3000,
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
    refetchInterval: 4000,
  })

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setUsername('')
    setFullName('')
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
    setFullName(u.full_name || '')
    setEmail(u.email || '')
    setPassword('')
    setRole(u.role)
    setRfidTag(u.rfid_tag || '')
    setFormError(null)
    setModalOpen(true)
  }

  const openApproveModal = (u: UserProfile) => {
    setUserToApprove(u)
    setApproveRfid(u.rfid_tag || `TAG-${u.username.toUpperCase()}`)
    setApproveModalOpen(true)
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { username: string; full_name?: string; password: string; email: string; role: string; rfid_tag?: string }) =>
      api.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setModalOpen(false)
      showSuccess(t('users.userCreated'))
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
      showSuccess(t('users.userUpdated'))
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.detail || err.message)
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, rfid_tag }: { id: number; rfid_tag: string }) =>
      api.approveUser(id, { rfid_tag }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      setApproveModalOpen(false)
      showSuccess(t('users.driverApproved', { name: data.full_name || data.username, tag: data.rfid_tag ?? '' }))
    },
    onError: (err: any) => {
      alert(t('users.approveError', { error: err?.response?.data?.detail || err.message }))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      showSuccess(t('users.userDeleted'))
    },
    onError: (err: any) => {
      alert(t('users.deleteError', { error: err?.response?.data?.detail || err.message }))
    },
  })

  const notifyMutation = useMutation({
    mutationFn: (params: { user_id?: number; charge_point_id?: string; connector_id?: number }) =>
      api.notifyMoveCar(params),
    onSuccess: (data) => {
      showSuccess(t('users.notifyEmailSent', { user: data.username, recipient: data.recipient }))
    },
    onError: (err: any) => {
      alert(t('users.notifyEmailError', { error: err?.response?.data?.detail || err.message }))
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!username.trim()) {
      setFormError(t('users.usernameRequired'))
      return
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError(t('users.emailRequired'))
      return
    }

    if (!editingUser && (!password || password.length < 4)) {
      setFormError(t('users.passwordMin'))
      return
    }

    if (editingUser) {
      const payload: any = {
        full_name: fullName.trim() || undefined,
        email: email.trim(),
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
        full_name: fullName.trim() || undefined,
        password,
        email: email.trim(),
        role,
        rfid_tag: rfidTag.trim() || undefined,
      })
    }
  }

  const handleDelete = (u: UserProfile) => {
    if (u.id === currentAdmin?.id) {
      alert(t('users.cannotDeleteSelf'))
      return
    }
    if (confirm(t('users.confirmAction', { action: !u.is_active ? t('users.rejectDeleteRequest') : t('users.deleteUser'), name: u.username }))) {
      deleteMutation.mutate(u.id)
    }
  }

  // Pending approval list
  const pendingUsers = users.filter((u) => !u.is_active)
  const pendingCount = pendingUsers.length
  const usersChargingNow = users.filter((u) => u.active_charge !== null && u.active_charge !== undefined).length
  const totalAdmins = users.filter((u) => u.role === 'admin').length
  const totalDrivers = users.filter((u) => u.role === 'user').length
  const totalKwh = users.reduce((acc, u) => acc + (u.total_kwh || 0), 0)

  // Filtered Users for table
  const filteredUsers = users.filter((u) => {
    // Search
    const q = search.toLowerCase()
    const matchesSearch = (
      u.username.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.rfid_tag && u.rfid_tag.toLowerCase().includes(q))
    )
    if (!matchesSearch) return false

    // Tab filter
    if (activeFilter === 'pending') return !u.is_active
    if (activeFilter === 'charging') return Boolean(u.active_charge)
    if (activeFilter === 'admin') return u.role === 'admin'
    if (activeFilter === 'user') return u.role === 'user' && u.is_active
    return true
  })

  // Filter transactions for history modal
  const userTransactions = selectedUserForHistory?.rfid_tag
    ? allTransactions.filter((tx) => tx.id_tag === selectedUserForHistory.rfid_tag)
    : []

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('users.title')}
            </h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                {pendingCount} {pendingCount === 1 ? t('users.pendingSingle') : t('users.pendingPlural')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            {t('users.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center gap-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('users.refresh')}</span>
          </button>

          <button
            onClick={openCreateModal}
            className="btn btn-primary flex items-center gap-2 text-xs shadow-md shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('users.newUser')}</span>
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-fade-up">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* PENDING APPROVALS QUEUE BANNER (When any user is pending)    */}
      {/* ──────────────────────────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between gap-4 mb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 dark:text-amber-400">
                <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {pendingCount === 1
                    ? t('users.pendingBannerSingle', { count: pendingCount })
                    : t('users.pendingBannerPlural', { count: pendingCount })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {t('users.pendingBannerSubtitle')}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-500 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              {t('users.actionRequired')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingUsers.map((pu) => (
              <div
                key={pu.id}
                className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 border border-amber-500/20 shadow-sm flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block">
                        {pu.full_name || pu.username}
                      </span>
                      <span className="text-[11px] font-mono text-blue-500 dark:text-blue-400">
                        @{pu.username}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold">
                      {t('users.pending')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-gray-400 mt-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 opacity-60" />
                    <span>{pu.email}</span>
                  </div>
                  {pu.rfid_tag && (
                    <div className="text-xs text-slate-600 dark:text-gray-300 mt-1 flex items-center gap-1.5 font-mono">
                      <Key className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t('users.requestedTag')}: <strong>{pu.rfid_tag}</strong></span>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-1">
                    {t('users.registeredAt')}: {pu.created_at ? safeFormatDate(pu.created_at, 'dd/MM/yyyy HH:mm') : t('users.today')}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <button
                    onClick={() => openApproveModal(pu)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-emerald-600/20"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{t('users.approveAssign')}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(pu)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                    title={t('users.rejectRequest')}
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* KPIs Summary Cards                                          */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-blue-500/30 transition-all">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">{t('users.totalUsers')}</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {users.length} <span className="text-xs font-normal text-slate-500">{t('users.adminAndDrivers', { admins: totalAdmins, drivers: totalDrivers })}</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-emerald-500/30 transition-all">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">{t('users.chargingNow')}</span>
            <div className="text-2xl font-bold font-mono mt-1 flex items-center gap-2">
              <span className={usersChargingNow > 0 ? "text-emerald-500 font-extrabold" : "text-slate-900 dark:text-white"}>
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

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-amber-500/30 transition-all">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">{t('users.assignedRfid')}</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {users.filter((u) => !!u.rfid_tag && u.is_active).length}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
            <Key className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-violet-500/30 transition-all">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">{t('users.globalConsumption')}</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
              {totalKwh.toFixed(1)} <span className="text-xs font-normal text-slate-500">kWh</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-500">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Users Management Table Card                                 */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="card p-6 border border-slate-200 dark:border-white/10 space-y-5">

        {/* Controls: Search and Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4">

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 overflow-x-auto">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-slate-750 text-blue-600 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('users.allFilter', { count: users.length })}
            </button>

            {pendingCount > 0 && (
              <button
                onClick={() => setActiveFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeFilter === 'pending'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <span>{t('users.pendingFilter')}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
                  {pendingCount}
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveFilter('charging')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeFilter === 'charging'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-gray-400 hover:text-emerald-500'
              }`}
            >
              <span>{t('users.chargingFilter')}</span>
              {usersChargingNow > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                  {usersChargingNow}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('admin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'admin'
                  ? 'bg-white dark:bg-slate-750 text-blue-600 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('users.adminsFilter', { count: totalAdmins })}
            </button>

            <button
              onClick={() => setActiveFilter('user')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'user'
                  ? 'bg-white dark:bg-slate-750 text-blue-600 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('users.driversFilter', { count: totalDrivers })}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="input pl-9 w-full text-xs"
            />
          </div>
        </div>

        {/* Table Content */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
            {t('users.loadingUsers')}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-gray-500 text-sm">
            {t('users.noUsersFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th>{t('users.colUserEmail')}</th>
                  <th>{t('users.colRole')}</th>
                  <th>{t('users.colRfid')}</th>
                  <th>{t('users.colStatus')}</th>
                  <th>{t('users.colConsumption')}</th>
                  <th>{t('users.colSessions')}</th>
                  <th>{t('users.colLastCharge')}</th>
                  <th className="text-right">{t('users.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isCharging = Boolean(u.active_charge)
                  const isPending = !u.is_active

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        isPending
                          ? "bg-amber-500/[0.04] border-l-4 border-l-amber-500"
                          : isCharging
                          ? "bg-emerald-500/[0.04] border-l-4 border-l-emerald-500"
                          : "hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                      }`}
                    >
                      {/* User Info */}
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl flex items-center justify-center font-bold text-xs ${
                            u.role === 'admin'
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              : isPending
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {(u.full_name || u.username).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-xs text-slate-900 dark:text-white block">
                              {u.full_name || u.username}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                              <span className="font-mono text-[10px] text-blue-500 dark:text-blue-400">@{u.username}</span>
                              {u.email && (
                                <>
                                  <span>·</span>
                                  <span>{u.email}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td>
                        {u.role === 'admin' ? (
                          <span className="badge badge-blue flex items-center gap-1 text-[11px] w-fit">
                            <Shield className="w-3 h-3" />
                            <span>{t('users.roleAdmin')}</span>
                          </span>
                        ) : (
                          <span className="badge badge-green flex items-center gap-1 text-[11px] w-fit">
                            <UserIcon className="w-3 h-3" />
                            <span>{t('users.roleDriver')}</span>
                          </span>
                        )}
                      </td>

                      {/* RFID Tag */}
                      <td>
                        {u.rfid_tag ? (
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-white/10">
                            {u.rfid_tag}
                          </span>
                        ) : isPending ? (
                          <span className="text-[11px] text-amber-500 font-medium italic">
                            {t('users.rfidPendingAssign')}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">{t('users.rfidNone')}</span>
                        )}
                      </td>

                      {/* Live Session / Status */}
                      <td>
                        {isPending ? (
                          <button
                            onClick={() => openApproveModal(u)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5 hover:bg-amber-500/25 transition-all"
                            title="Clique para aprovar este condutor"
                          >
                            <span>{t('users.pendingApproval')}</span>
                          </button>
                        ) : isCharging && u.active_charge ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
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
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {t('users.userAvailable')}
                          </span>
                        )}
                      </td>

                      {/* Accumulated Consumption */}
                      <td>
                        <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          {u.total_kwh ?? 0} kWh
                        </span>
                      </td>

                      {/* Sessions count */}
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedUserForHistory(u)}
                          className="font-mono text-xs text-slate-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 underline decoration-dotted flex items-center gap-1"
                          title={t('users.viewTransactions')}
                        >
                          <span>{t('users.chargesCount', { count: u.total_sessions ?? 0 })}</span>
                          <History className="w-3 h-3 opacity-60" />
                        </button>
                      </td>

                      {/* Last Charge */}
                      <td className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                        {u.last_charge_time ? safeFormatDate(u.last_charge_time, 'dd/MM/yyyy HH:mm') : '—'}
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => openApproveModal(u)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
                              title="Aprovar e atribuir RFID"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t('users.approve')}</span>
                            </button>
                          )}

                          {isCharging && (
                            <button
                              onClick={() => notifyMutation.mutate({ user_id: u.id, charge_point_id: u.active_charge?.charge_point_id, connector_id: u.active_charge?.connector_id })}
                              disabled={notifyMutation.isPending}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 shadow-sm transition-all"
                              title="Enviar email de cortesia a pedir para mover o carro"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span>{t('users.askToMove')}</span>
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedUserForHistory(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-blue-500 transition-colors"
                            title={t('users.chargeHistoryBtn')}
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-600 dark:text-gray-300 transition-colors"
                            title={t('users.editUser')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={u.id === currentAdmin?.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={isPending ? t('users.rejectDeleteRequest') : t('users.deleteUser')}
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

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: APPROVE DRIVER & ASSIGN RFID TAG                     */}
      {/* ──────────────────────────────────────────────────────────── */}
      {approveModalOpen && userToApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 border border-emerald-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {t('users.approveDriverTitle')}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-gray-400">
                    {t('users.userLabel')} <strong>{userToApprove.username}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setApproveModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">
              {t('users.approveExplanation')} <strong>{userToApprove.email}</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!approveRfid.trim()) {
                  alert(t('users.rfidRequired'))
                  return
                }
                approveMutation.mutate({ id: userToApprove.id, rfid_tag: approveRfid.trim() })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.rfidAssignLabel')}
                </label>
                <input
                  type="text"
                  value={approveRfid}
                  onChange={(e) => setApproveRfid(e.target.value)}
                  placeholder="ex: 9F13FB29 ou VERSICHARGE_TAG"
                  className="input w-full text-xs font-mono font-bold"
                  required
                />

                {/* Quick suggestions from White-list */}
                {tags.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[11px] text-slate-500 block">{t('users.whitelistSuggestions')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 6).map((tagItem) => (
                        <button
                          key={tagItem.id_tag}
                          type="button"
                          onClick={() => setApproveRfid(tagItem.id_tag)}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-400 border border-slate-200 dark:border-white/10 text-[11px] font-mono transition-colors"
                        >
                          {tagItem.id_tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={approveMutation.isPending}
                  className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{approveMutation.isPending ? t('users.approving') : t('users.confirmActivate')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE / EDIT USER                                   */}
      {/* ──────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 border border-slate-200 dark:border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingUser ? t('users.editUserTitle', { username: editingUser.username }) : t('users.newUserTitle')}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.fullName')}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ex: Hugo Santos"
                  className="input w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.usernameLabel')}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: hugo.santos"
                  className="input w-full text-xs font-mono"
                  disabled={Boolean(editingUser)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.emailLabel')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: marco@canditos.com"
                  className="input w-full text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {editingUser ? t('users.newPasswordLabel') : t('users.passwordLabel')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : t('users.passwordPlaceholder')}
                  className="input w-full text-xs"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.roleLabel')}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="select w-full text-xs"
                >
                  <option value="user">{t('users.driverOption')}</option>
                  <option value="admin">{t('users.adminOption')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                  {t('users.rfidLabel')}
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
                      <span>{t('users.suggestions')}</span>
                      {tags.slice(0, 5).map((tagItem) => (
                        <button
                          key={tagItem.id_tag}
                          type="button"
                          onClick={() => setRfidTag(tagItem.id_tag)}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-500/20 hover:text-blue-400 font-mono text-[10px] transition-colors"
                        >
                          {tagItem.id_tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn btn-primary text-xs"
                >
                  {createMutation.isPending || updateMutation.isPending ? t('users.saving') : t('users.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: USER TRANSACTION HISTORY                            */}
      {/* ──────────────────────────────────────────────────────────── */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-2xl w-full p-6 border border-slate-200 dark:border-white/10 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {t('users.historyTitle', { username: selectedUserForHistory.username })}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                    {t('users.historySubtitle', { tag: selectedUserForHistory.rfid_tag || t('users.noTagRfid') })} {selectedUserForHistory.total_kwh || 0} kWh ({selectedUserForHistory.total_sessions || 0} sessões)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {userTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {t('users.noTransactions')}
                </div>
              ) : (
                userTransactions.map((tx) => {
                  let kwh = 0.0
                  if (tx.meter_stop !== null && tx.meter_start !== null) {
                    const diff = tx.meter_stop - tx.meter_start
                    if (diff > 0) kwh = diff / 1000.0
                  }

                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {t('users.connectorStation', { cp: tx.charge_point_id, connector: tx.connector_id })}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tx.status === 'Active'
                              ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-gray-300'
                          }`}>
                            {tx.status === 'Active' ? t('users.inProgress') : t('users.completed')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{t('users.startLabel')} {tx.start_time ? safeFormatDate(tx.start_time, 'dd/MM/yyyy HH:mm') : '—'}</span>
                          {tx.stop_time && (
                            <>
                              <span>·</span>
                              <span>{t('users.endLabel')} {safeFormatDate(tx.stop_time, 'HH:mm')}</span>
                              <span>·</span>
                              <span>{t('users.durationLabel')} {getDurationLabel(tx.start_time, tx.stop_time)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {kwh > 0 ? `${kwh.toFixed(2)} kWh` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          TX #{tx.transaction_id}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 text-right">
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="btn btn-secondary text-xs"
              >
                {t('users.close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
