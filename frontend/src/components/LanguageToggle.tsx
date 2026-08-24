import React from 'react'
import { useI18n } from '../i18n'

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n()

  return (
    <div className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1 ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <button
        type="button"
        onClick={() => setLanguage('pt')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          language === 'pt' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-white/10'
        }`}
      >
        <span>🇵🇹</span>
        <span>PT</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          language === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-white/10'
        }`}
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  )
}
