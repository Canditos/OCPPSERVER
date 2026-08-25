import React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import type { ThemeMode } from '../hooks/useTheme'

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Claro', icon: <Sun className="h-3 w-3" /> },
  { value: 'dark', label: 'Escuro', icon: <Moon className="h-3 w-3" /> },
  { value: 'auto', label: 'Auto', icon: <Monitor className="h-3 w-3" /> },
]

export function ThemeToggle({
  value,
  onChange,
  compact = false,
}: {
  value: ThemeMode
  onChange: (value: ThemeMode) => void
  compact?: boolean
}) {
  return (
    <div className="w-full grid grid-cols-3 gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-1 box-border shadow-inner">
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-[11px] font-semibold transition-all cursor-pointer ${
              active
                ? 'bg-blue-600 text-white shadow-md dark:bg-blue-500/30 dark:text-blue-300 dark:border dark:border-blue-400/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5'
            }`}
            title={option.label}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
