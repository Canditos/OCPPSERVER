import { useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'ocpp-theme-mode'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'auto' ? getSystemTheme() : mode
}

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved
    return 'auto'
  })

  const resolved = useMemo(() => resolveTheme(mode), [mode])

  useEffect(() => {
    applyTheme(resolved)
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode, resolved])

  useEffect(() => {
    if (mode !== 'auto') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(resolveTheme('auto'))

    if (media.addEventListener) {
      media.addEventListener('change', onChange)
    } else {
      media.addListener(onChange)
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', onChange)
      } else {
        media.removeListener(onChange)
      }
    }
  }, [mode])

  return { mode, resolved, setMode }
}
