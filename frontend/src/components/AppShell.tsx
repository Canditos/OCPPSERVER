import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ArrowLeftRight, LayoutDashboard, Settings, ShieldCheck, Terminal, Zap, Wifi, Activity } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { useChargerStore } from '../store/chargerStore'
import { useTheme } from '../hooks/useTheme'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transações', icon: ArrowLeftRight },
  { to: '/commands', label: 'Comandos', icon: Terminal },
  { to: '/authentication', label: 'Autenticação', icon: ShieldCheck },
  { to: '/configuration', label: 'Configuração', icon: Settings },
]

const TITLES: Record<string, string> = {
  '/': 'Resumo',
  '/transactions': 'Transações',
  '/commands': 'Comandos',
  '/authentication': 'Autenticação',
  '/configuration': 'Configuração',
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const liveState = useChargerStore((s) => s.liveState)
  const events = useChargerStore((s) => s.events)
  const { mode, resolved, setMode } = useTheme()

  const chargers = Object.values(liveState)
  const online = chargers.filter((c) => c.isOnline).length
  const charging = chargers.filter((c) => Object.values(c.connectors).some((connector) => connector.status === 'Charging')).length
  const currentTitle = location.pathname.startsWith('/chargers/')
    ? 'Posto'
    : TITLES[location.pathname] ?? 'Dashboard'

  return (
    <div className={`min-h-screen bg-grid ${resolved === 'dark' ? 'bg-slate-950 text-gray-100' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar mode={mode} resolved={resolved} setMode={setMode} />

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className={`sticky top-0 z-20 border-b px-4 py-3 backdrop-blur-lg lg:hidden ${
          resolved === 'dark'
            ? 'border-white/10 bg-slate-950/90'
            : 'border-slate-200 bg-white/90'
        }`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${resolved === 'dark' ? 'text-white' : 'text-slate-900'}`}>OCPP Central</p>
                <p className={`text-xs ${resolved === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>{currentTitle}</p>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-medium">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                  resolved === 'dark'
                    ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Online
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                  resolved === 'dark'
                    ? 'border border-white/10 bg-white/5 text-gray-300'
                    : 'border border-slate-200 bg-slate-100 text-slate-600'
                }`}>
                  <Activity className="h-3 w-3" />
                  {events.length}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <ThemeToggle value={mode} onChange={setMode} compact />
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-4 pb-24 sm:px-6 lg:ml-60 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-30 border-t px-2 pt-2 backdrop-blur-lg lg:hidden ${
          resolved === 'dark'
            ? 'border-white/10 bg-slate-950/95'
            : 'border-slate-200 bg-white/95'
        }`}
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-5 gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
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
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className={`mt-2 flex items-center justify-between rounded-2xl px-3 py-2 text-[10px] ${
          resolved === 'dark'
            ? 'border border-white/5 bg-white/3 text-gray-400'
            : 'border border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          <span className="inline-flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            {online} online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            {charging} a carregar
          </span>
        </div>
        <div className="mt-2">
          <ThemeToggle value={mode} onChange={setMode} compact />
        </div>
      </nav>
    </div>
  )
}
