import React from 'react'
import { useI18n } from '../i18n'

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n()

  return (
    <div className={`inline-flex items-center rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-1 ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <button
        type="button"
        onClick={() => setLanguage('pt')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
          language === 'pt'
            ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
        }`}
      >
        <span>🇵🇹</span>
        <span>PT</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
          language === 'en'
            ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
        }`}
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  )
}
