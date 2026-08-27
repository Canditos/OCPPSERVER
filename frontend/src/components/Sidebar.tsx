import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Zap, LayoutDashboard, ArrowLeftRight, Terminal, Settings,
  Activity, ShieldCheck, Shield, Gauge, Users, LogOut, User as UserIcon, ScrollText
} from 'lucide-react'
import { useChargerStore } from '../store/chargerStore'
import { useAuthStore } from '../store/authStore'
import { ThemeToggle } from './ThemeToggle'
import { LanguageToggle } from './LanguageToggle'
import type { ThemeMode } from '../hooks/useTheme'
import { useI18n } from '../i18n'

const ADMIN_NAV = [
  { to: '/',               icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/transactions',   icon: ArrowLeftRight,  labelKey: 'nav.transactions' },
  { to: '/commands',       icon: Terminal,        labelKey: 'nav.commands' },
  { to: '/smart-charging', icon: Gauge,           labelKey: 'nav.smartCharging' },
  { to: '/configuration',  icon: Settings,        labelKey: 'nav.configuration' },
  { to: '/authentication', icon: ShieldCheck,     labelKey: 'nav.authentication' },
  { to: '/users',          icon: Users,           labelKey: 'nav.users' },
  { to: '/logs',           icon: ScrollText,      labelKey: 'nav.logs' },
  { to: '/ocmf',           icon: Shield,          labelKey: 'nav.ocmf' },
]

const USER_NAV = [
  { to: '/my-charging',    icon: Zap,             labelKey: 'nav.myCharging' },
]

export function Sidebar({
  mode,
  resolved,
  setMode,
}: {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (value: ThemeMode) => void
}) {
  const events = useChargerStore((s) => s.events)
  const liveState = useChargerStore((s) => s.liveState)
  const { user, isAdmin, logout } = useAuthStore()
  const { t } = useI18n()

  const online   = Object.values(liveState).filter((s) => s.isOnline).length
  const total    = Object.values(liveState).length
  const charging = Object.values(liveState).flatMap((s) =>
    Object.values(s.connectors ?? {})
  ).filter((c) => c.status === 'Charging').length

  const navItems = isAdmin ? ADMIN_NAV : USER_NAV

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex ${
      resolved === 'dark'
        ? 'border-r border-white/10 bg-slate-950/92'
        : 'border-r border-slate-200 bg-white/92'
    }`}
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {/* logo */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
            <Zap className="w-5 h-5 text-white" fill="white" />
            {charging > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />
              </span>
            )}
          </div>
          <div>
            <p className={`text-sm font-bold ${resolved === 'dark' ? 'text-white' : 'text-slate-900'}`}>@Canditos OCPP</p>
            <p className={`text-xs ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-400'}`}>Central System</p>
          </div>
        </div>

        {/* status bar */}
        {isAdmin && (
          <div className="mt-4 flex items-center gap-2">
            <div className={`flex-1 h-1 rounded-full overflow-hidden ${resolved === 'dark' ? 'bg-gray-800' : 'bg-slate-200'}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-700"
                style={{ width: `${total === 0 ? 2 : Math.min(100, (online / Math.max(total, 1)) * 100)}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>{online}/{total} on</span>
          </div>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/my-charging'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? resolved === 'dark'
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                  : resolved === 'dark'
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? (resolved === 'dark' ? 'text-blue-400' : 'text-blue-600') : ''}`} />
                {t(labelKey)}
                {isActive && (
                  <div className={`ml-auto w-1.5 h-1.5 rounded-full ${resolved === 'dark' ? 'bg-blue-400' : 'bg-blue-600'} animate-pulse-slow`} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile info & Logout */}
      <div className="mt-auto p-3 m-3 space-y-2 box-border">
        {/* User Card */}
        {user && (
          <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
            resolved === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-100/80 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold truncate block text-slate-900 dark:text-white">
                  {user.username}
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${
                  user.role === 'admin' ? 'text-blue-500' : 'text-emerald-500'
                }`}>
                  {user.role === 'admin' ? t('shell.admin') : t('shell.driver')}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
              title={t('shell.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Status for Admin */}
        {isAdmin && (
          <div className={`rounded-xl p-3 border space-y-2 ${
            resolved === 'dark'
              ? 'bg-white/3 border-white/5'
              : 'bg-slate-100/80 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <div className={`flex items-center gap-2 ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>
                <Activity className="w-3.5 h-3.5" />
                {t('shell.events')}
              </div>
              <span className={`font-mono ${resolved === 'dark' ? 'text-gray-400' : 'text-slate-700'}`}>{events.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className={`flex items-center gap-2 ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>
                <Zap className="w-3.5 h-3.5" />
                {t('common.charging')}
              </div>
              <span className={`font-mono font-medium ${charging > 0 ? (resolved === 'dark' ? 'text-blue-400' : 'text-blue-600') : (resolved === 'dark' ? 'text-gray-500' : 'text-slate-400')}`}>
                {charging}
              </span>
            </div>
          </div>
        )}

        <div className="w-full">
          <div className="mb-2">
            <LanguageToggle compact />
          </div>
          <ThemeToggle value={mode} onChange={setMode} />
        </div>
      </div>
    </aside>
  )
}
