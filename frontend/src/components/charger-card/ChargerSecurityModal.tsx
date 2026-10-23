import React, { useState, useEffect } from 'react'
import { Shield, Lock, Eye, EyeOff, Copy, Check, Sparkles, Send, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../../api'
import type { Charger } from '../../types'

interface ChargerSecurityModalProps {
  isOpen: boolean
  onClose: () => void
  charger: Charger
  isOnline: boolean
  onSaved?: () => void
}

export function ChargerSecurityModal({
  isOpen,
  onClose,
  charger,
  isOnline,
  onSaved,
}: ChargerSecurityModalProps) {
  const [secProfile, setSecProfile] = useState<number>(charger.security_profile ?? 0)
  const [authKey, setAuthKey] = useState<string>(charger.auth_password || '')
  const [authEnabled, setAuthEnabled] = useState<boolean>(charger.auth_enabled ?? false)
  const [showKey, setShowKey] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<boolean>(false)
  const [secFeedback, setSecFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSavingSec, setIsSavingSec] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSecProfile(charger.security_profile ?? 0)
      setAuthKey(charger.auth_password || '')
      setAuthEnabled(charger.auth_enabled ?? false)
      setSecFeedback(null)
    }
  }, [isOpen, charger])

  if (!isOpen) return null

  const handleSaveSecurity = async () => {
    setIsSavingSec(true)
    setSecFeedback(null)
    try {
      await api.updateChargerSecurity(charger.charge_point_id, {
        security_profile: secProfile,
        auth_password: authKey,
        auth_enabled: authEnabled || secProfile >= 1,
      })
      setSecFeedback({ type: 'success', message: 'Segurança guardada com sucesso!' })
      onSaved?.()
      setTimeout(() => {
        onClose()
        setSecFeedback(null)
      }, 1200)
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleGenerateKey = async () => {
    setIsSavingSec(true)
    try {
      const res = await api.generateChargerKey(charger.charge_point_id)
      setAuthKey(res.authorization_key)
      setSecFeedback({ type: 'success', message: 'Nova AuthorizationKey gerada!' })
      onSaved?.()
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao gerar: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleSyncKey = async () => {
    setIsSavingSec(true)
    try {
      const res = await api.syncChargerKey(charger.charge_point_id)
      setSecFeedback({ type: 'success', message: `Chave enviada ao posto via OCPP (${res.status})` })
    } catch (err: any) {
      setSecFeedback({ type: 'error', message: `Erro ao sincronizar: ${err?.response?.data?.detail || err.message}` })
    } finally {
      setIsSavingSec(false)
    }
  }

  const handleCopyKey = () => {
    if (!authKey) return
    navigator.clipboard.writeText(authKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl p-5 space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-500 border border-blue-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100">Segurança & AuthorizationKey</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 font-mono">{charger.charge_point_id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alert feedback */}
        {secFeedback && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            secFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30'
          }`}>
            {secFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />}
            <span>{secFeedback.message}</span>
          </div>
        )}

        {/* Profile selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300">Perfil de Segurança (OCPP 1.6)</label>
          <select
            value={secProfile}
            onChange={(e) => {
              const val = Number(e.target.value)
              setSecProfile(val)
              if (val >= 1) setAuthEnabled(true)
            }}
            className="select w-full text-xs py-2 bg-slate-50 dark:bg-gray-800/90 border-slate-200 dark:border-white/10"
          >
            <option value={0}>Profile 0 — Aberto / Unsecure (ws:// sem password)</option>
            <option value={1}>Profile 1 — HTTP Basic Auth (ws:// com password)</option>
            <option value={2}>Profile 2 — TLS + Basic Auth (wss:// encriptado com password)</option>
            <option value={3}>Profile 3 — mTLS (TLS Mútuo com Certificados Digitais X.509)</option>
          </select>
        </div>

        {/* AuthorizationKey */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300">AuthorizationKey (Password do Posto)</label>
            <button
              type="button"
              onClick={handleGenerateKey}
              disabled={isSavingSec}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1 font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Gerar Chave Segura
            </button>
          </div>

          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={authKey}
              onChange={(e) => setAuthKey(e.target.value)}
              placeholder="Introduza ou gere a password do posto"
              className="input pr-20 text-xs font-mono bg-slate-50 dark:bg-gray-800/90 border-slate-200 dark:border-white/10 w-full"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                title={showKey ? 'Ocultar' : 'Mostrar'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleCopyKey}
                disabled={!authKey}
                className="p-1 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                title="Copiar Chave"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Header preview if key present */}
        {authKey && secProfile >= 1 && (
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/8 space-y-1">
            <span className="text-[10px] text-slate-500 dark:text-gray-400 font-medium">Cabeçalho HTTP Basic para o Carregador:</span>
            <p className="text-[10px] font-mono text-slate-700 dark:text-gray-300 break-all bg-white dark:bg-gray-950/80 p-1.5 rounded border border-slate-200 dark:border-white/5 select-all">
              Authorization: Basic {btoa(`${charger.charge_point_id}:${authKey}`)}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={handleSyncKey}
            disabled={isSavingSec || !isOnline || !authKey}
            className="btn bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-40 transition-all"
            title={isOnline ? 'Enviar chave ao posto via OCPP' : 'Posto offline'}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Sincronizar no Posto</span>
          </button>

          <button
            type="button"
            onClick={handleSaveSecurity}
            disabled={isSavingSec}
            className="flex-1 btn-primary text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isSavingSec ? 'A guardar...' : 'Guardar Segurança'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
