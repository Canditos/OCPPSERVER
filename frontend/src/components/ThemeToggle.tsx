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
    <div className="w-full grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 box-border">
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1 rounded-lg py-1 px-1.5 text-[10px] font-medium transition-all ${
              active
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
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
