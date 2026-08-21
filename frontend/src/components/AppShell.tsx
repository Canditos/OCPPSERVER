import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ArrowLeftRight, LayoutDashboard, Settings, ShieldCheck, Terminal, Zap, Wifi, Activity } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useChargerStore } from '../store/chargerStore'

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

  const chargers = Object.values(liveState)
  const online = chargers.filter((c) => c.isOnline).length
  const charging = chargers.filter((c) => Object.values(c.connectors).some((connector) => connector.status === 'Charging')).length
  const currentTitle = location.pathname.startsWith('/chargers/')
    ? 'Posto'
    : TITLES[location.pathname] ?? 'Dashboard'

  return (
    <div className="min-h-screen bg-grid">
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur-lg lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">OCPP Central</p>
              <p className="text-xs text-gray-500">{currentTitle}</p>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-medium">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Online
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-gray-300">
                <Activity className="h-3 w-3" />
                {events.length}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-4 pb-24 sm:px-6 lg:ml-60 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 px-2 pt-2 backdrop-blur-lg lg:hidden"
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
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    : 'text-gray-500 hover:text-gray-300'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between rounded-2xl border border-white/5 bg-white/3 px-3 py-2 text-[10px] text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            {online} online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            {charging} a carregar
          </span>
        </div>
      </nav>
    </div>
  )
}
