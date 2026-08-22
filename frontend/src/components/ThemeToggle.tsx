import { Moon, Sun, Monitor } from 'lucide-react'
import type { ThemeMode } from '../hooks/useTheme'

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Claro', icon: <Sun className="h-3.5 w-3.5" /> },
  { value: 'dark', label: 'Escuro', icon: <Moon className="h-3.5 w-3.5" /> },
  { value: 'auto', label: 'Auto', icon: <Monitor className="h-3.5 w-3.5" /> },
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
    <div className={`inline-flex rounded-full border border-white/10 bg-white/5 p-1 ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              active
                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={option.label}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
