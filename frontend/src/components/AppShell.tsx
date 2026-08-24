import React, { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight, LayoutDashboard, Settings, ShieldCheck, Terminal,
  Zap, Wifi, Activity, Gauge, Users, LogOut, User as UserIcon
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { LanguageToggle } from './LanguageToggle'
import { useChargerStore } from '../store/chargerStore'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'
import { useI18n } from '../i18n'

const ADMIN_NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/transactions', labelKey: 'nav.transactions', icon: ArrowLeftRight },
  { to: '/commands', labelKey: 'nav.commands', icon: Terminal },
  { to: '/smart-charging', labelKey: 'nav.smartCharging', icon: Gauge },
  { to: '/users', labelKey: 'nav.users', icon: Users },
]

const USER_NAV_ITEMS = [
  { to: '/my-charging', labelKey: 'nav.myCharging', icon: Zap },
]

const TITLE_KEYS: Record<string, string> = {
  '/': 'shell.overview',
  '/transactions': 'shell.globalTransactions',
  '/commands': 'shell.ocppCommands',
  '/smart-charging': 'shell.smartCharging',
  '/authentication': 'shell.authentication',
  '/configuration': 'shell.configuration',
  '/users': 'shell.users',
  '/my-charging': 'shell.driverPortal',
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const liveState = useChargerStore((s) => s.liveState)
  const events = useChargerStore((s) => s.events)
  const { user, isAdmin, logout } = useAuthStore()
  const { mode, resolved, setMode } = useTheme()
  const { t } = useI18n()

  const chargers = Object.values(liveState)
  const online = chargers.filter((c) => c.isOnline).length
  const charging = chargers.filter((c) => Object.values(c.connectors).some((connector) => connector.status === 'Charging')).length
  const currentTitle = location.pathname.startsWith('/chargers/')
    ? t('shell.station')
    : t(TITLE_KEYS[location.pathname] ?? 'nav.dashboard')

  const navItems = isAdmin ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS

  return (
    <div className={`min-h-screen bg-grid ${resolved === 'dark' ? 'bg-slate-950 text-gray-100' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar mode={mode} resolved={resolved} setMode={setMode} />

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Mobile Top Header */}
        <header className={`sticky top-0 z-20 border-b px-4 py-3 backdrop-blur-lg lg:hidden ${
          resolved === 'dark'
            ? 'border-white/10 bg-slate-950/90'
            : 'border-slate-200 bg-white/90'
        }`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${resolved === 'dark' ? 'text-white' : 'text-slate-900'}`}>@Canditos OCPP</p>
                <p className={`text-xs ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>{currentTitle}</p>
              </div>

              <div className="flex items-center gap-2">
                {user && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-semibold">
                    <UserIcon className="w-3 h-3" />
                    <span>{user.username}</span>
                  </div>
                )}
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500"
                  title={t('shell.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <LanguageToggle compact />
              <ThemeToggle value={mode} onChange={setMode} compact />
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-4 pb-24 sm:px-6 lg:ml-60 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 border-t px-2 pt-2 backdrop-blur-lg lg:hidden ${
          resolved === 'dark'
            ? 'border-white/10 bg-slate-950/95'
            : 'border-slate-200 bg-white/95'
        }`}
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-1'} gap-1`}>
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/my-charging'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? resolved === 'dark'
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : resolved === 'dark'
                      ? 'text-gray-500 hover:text-gray-300'
                      : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </div>

        {isAdmin && (
          <div className={`mt-2 flex items-center justify-between rounded-2xl px-3 py-2 text-[10px] ${
            resolved === 'dark'
              ? 'border border-white/5 bg-white/3 text-gray-400'
              : 'border border-slate-200 bg-slate-50 text-slate-500'
          }`}>
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              {online} {t('common.online')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-400" />
              {charging} {t('common.charging')}
            </span>
          </div>
        )}
        <div className="mt-2">
          <div className="mb-2">
            <LanguageToggle compact />
          </div>
          <ThemeToggle value={mode} onChange={setMode} compact />
        </div>
      </nav>
    </div>
  )
}
