import React, { useState, type ReactNode } from 'react'
import { Zap, MapPin, CreditCard, LogOut, Download, CheckCircle } from 'lucide-react'
import { ThemeToggle } from '../ThemeToggle'
import { LanguageToggle } from '../LanguageToggle'
import { useTheme } from '../../hooks/useTheme'
import { useAuthStore } from '../../store/authStore'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { useI18n } from '../../i18n'

export type DriverTab = 'charge' | 'stations' | 'pass'

interface DriverShellProps {
  activeTab: DriverTab
  onTabChange: (tab: DriverTab) => void
  children: ReactNode
}

export function DriverShell({ activeTab, onTabChange, children }: DriverShellProps) {
  const { mode, resolved, setMode } = useTheme()
  const { user, logout } = useAuthStore()
  const { canInstall, isInstalled, install } = useInstallPrompt()
  const { t } = useI18n()
  const [installDone, setInstallDone] = useState(false)

  const isDark = resolved === 'dark'

  const tabs = [
    { id: 'charge' as DriverTab, icon: Zap, label: t('driver.tabCharge') },
    { id: 'stations' as DriverTab, icon: MapPin, label: t('driver.tabStations') },
    { id: 'pass' as DriverTab, icon: CreditCard, label: t('driver.tabPass') },
  ]

  const handleInstall = async () => {
    await install()
    setInstallDone(true)
    setTimeout(() => setInstallDone(false), 3000)
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-slate-950 text-gray-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Compact top bar */}
      <header
        className={`sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 border-b backdrop-blur-lg ${
          isDark ? 'border-white/10 bg-slate-950/90' : 'border-slate-200 bg-white/90'
        }`}
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <div>
            <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>@Canditos</span>
            {user && (
              <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'
              }`}>
                {user.username}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* PWA Install button */}
          {canInstall && !installDone && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-[11px] font-bold shadow-sm hover:opacity-90 transition-opacity"
              title="Instalar App"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Instalar</span>
            </button>
          )}
          {installDone && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] font-bold">
              <CheckCircle className="w-3 h-3" />
              <span>Instalado!</span>
            </span>
          )}
          {isInstalled && !installDone && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
            }`}>
              App ✓
            </span>
          )}
          <LanguageToggle compact />
          <ThemeToggle value={mode} onChange={setMode} compact />
          <button
            onClick={logout}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'text-gray-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500'
            }`}
            title={t('shell.logout')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 min-w-0 overflow-y-auto px-4 py-4 pb-28 sm:px-5">
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-lg ${
          isDark ? 'border-white/10 bg-slate-950/95' : 'border-slate-200 bg-white/95'
        }`}
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-3 gap-1 px-2 pt-2">
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : isDark
                      ? 'text-gray-500 hover:text-gray-300'
                      : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive && id === 'charge' ? 'animate-pulse' : ''}`} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
