import React, { useState } from 'react'
import { Tag, X, Play, Loader2 } from 'lucide-react'
import { useI18n } from '../../i18n'

interface ChargerTagModalProps {
  isOpen: boolean
  onClose: () => void
  onSaveAndStart: (tagId: string, description: string, startImmediately: boolean) => Promise<void>
  isSaving: boolean
  initialTagId?: string
}

const PRESET_TAGS = ['VERSICHARGE_TAG', 'ADMIN_TAG', 'MASTER_RFID', 'TAG_001']

export function ChargerTagModal({
  isOpen,
  onClose,
  onSaveAndStart,
  isSaving,
  initialTagId = '',
}: ChargerTagModalProps) {
  const { t } = useI18n()
  const [tagId, setTagId] = useState(initialTagId)
  const [tagDesc, setTagDesc] = useState('')

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t('chargerCard.authorizedTagTitle')}</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">{t('chargerCard.authorizedTagSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets */}
        <div className="space-y-1.5">
          <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">{t('chargerCard.quickSuggestions')}</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setTagId(preset)
                  setTagDesc(`Tag ${preset}`)
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{t('chargerCard.tagIdLabel')}</label>
            <input
              type="text"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              placeholder={t('chargerCard.tagIdPlaceholder')}
              className="input w-full font-mono text-sm uppercase"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{t('chargerCard.descriptionLabel')}</label>
            <input
              type="text"
              value={tagDesc}
              onChange={(e) => setTagDesc(e.target.value)}
              placeholder={t('chargerCard.descriptionPlaceholder')}
              className="input w-full text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => onSaveAndStart(tagId, tagDesc, false)}
            disabled={isSaving || !tagId.trim()}
            className="flex-1 btn-secondary text-xs py-2 rounded-xl"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('chargerCard.saveTag')}
          </button>

          <button
            type="button"
            onClick={() => onSaveAndStart(tagId, tagDesc, true)}
            disabled={isSaving || !tagId.trim()}
            className="flex-1 btn bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-md font-semibold"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
            <span>{t('chargerCard.saveAndStart')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
