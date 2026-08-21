import { NavLink } from 'react-router-dom'
import { Zap, LayoutDashboard, ArrowLeftRight, Terminal, Settings, Activity, ShieldCheck } from 'lucide-react'
import { useChargerStore } from '../store/chargerStore'

const NAV = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions',   icon: ArrowLeftRight,  label: 'Transações' },
  { to: '/commands',       icon: Terminal,        label: 'Comandos' },
  { to: '/configuration',  icon: Settings,        label: 'Configuração' },
  { to: '/authentication', icon: ShieldCheck,     label: 'Autenticação' },
]

export function Sidebar() {
  const events = useChargerStore((s) => s.events)
  const liveState = useChargerStore((s) => s.liveState)

  const online   = Object.values(liveState).filter((s) => s.isOnline).length
  const charging = Object.values(liveState).flatMap((s) =>
    Object.values(s.connectors ?? {})
  ).filter((c) => c.status === 'Charging').length

  return (
    <aside className="fixed inset-y-0 left-0 w-60 flex flex-col z-30"
      style={{ background: 'rgba(8,12,20,0.92)', borderRight: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)' }}
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
            <p className="text-sm font-bold text-white">OCPP 1.6</p>
            <p className="text-xs text-gray-600">Central System</p>
          </div>
        </div>

        {/* status bar */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-700"
              style={{ width: `${online === 0 ? 2 : Math.min(100, (online / Math.max(online, 1)) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 font-mono">{online} online</span>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                {label}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-slow" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* footer stats */}
      <div className="p-3 m-3 rounded-xl bg-white/3 border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-500">
            <Activity className="w-3.5 h-3.5" />
            Eventos
          </div>
          <span className="font-mono text-gray-400">{events.length}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-500">
            <Zap className="w-3.5 h-3.5" />
            A carregar
          </div>
          <span className={`font-mono font-medium ${charging > 0 ? 'text-blue-400' : 'text-gray-600'}`}>
            {charging}
          </span>
        </div>

        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-xs text-emerald-400/80">WebSocket activo</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
