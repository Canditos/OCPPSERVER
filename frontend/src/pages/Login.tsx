import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, User, Lock, AlertCircle, ArrowRight, Sparkles, Shield, BatteryCharging, Activity } from 'lucide-react'
import { api } from '../api'
import { useAuthStore } from '../store/authStore'

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Por favor preenche todos os campos.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await api.login({ username: username.trim(), password })
      login(res.token, res.user)

      if (res.user.role === 'admin') {
        navigate('/')
      } else {
        navigate('/my-charging')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Credenciais inválidas. Tenta novamente.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const fillCredentials = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setError(null)
  }

  return (
    <div className="min-h-screen flex bg-slate-950 overflow-hidden relative">
      {/* ── Animated Background Orbs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute top-1/2 -right-20 w-80 h-80 bg-indigo-600/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-32 left-1/3 w-72 h-72 bg-emerald-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Brand / Hero                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={`hidden lg:flex lg:w-[55%] relative flex-col justify-between p-10 xl:p-14 transition-all duration-1000 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />

        {/* Top – Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-xl shadow-blue-500/30">
              <Zap className="w-6 h-6 text-white" fill="white" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight block leading-tight">@Canditos OCPP</span>
              <span className="text-gray-500 text-xs font-medium">Central System 1.6</span>
            </div>
          </div>
        </div>

        {/* Center – Hero Text */}
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-6">
            <Activity className="w-3.5 h-3.5" />
            <span>Sistema Ativo · Monitorização em Tempo Real</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.1] tracking-tight mb-5">
            Gestão Inteligente
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              de Carregamentos
            </span>
          </h1>

          <p className="text-gray-400 text-base leading-relaxed max-w-md">
            Controla os teus postos de carregamento em tempo real. 
            Monitorização de energia, perfis de carga inteligentes 
            e gestão de acessos RFID numa única plataforma.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2.5 mt-8">
            {[
              { icon: Zap, text: 'Smart Charging', color: 'blue' },
              { icon: Shield, text: 'RFID Auth', color: 'emerald' },
              { icon: BatteryCharging, text: 'Telemetria Live', color: 'violet' },
            ].map(({ icon: Icon, text, color }) => (
              <div key={text} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-medium backdrop-blur-sm`}>
                <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom – Stats */}
        <div className="relative z-10">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-white font-mono">OCPP</div>
              <div className="text-xs text-gray-500">Protocolo</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <div className="text-2xl font-bold text-white font-mono">1.6J</div>
              <div className="text-xs text-gray-500">Versão</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <div className="text-2xl font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                Online
              </div>
              <div className="text-xs text-gray-500">Estado</div>
            </div>
          </div>
        </div>

        {/* Decorative bolt illustration */}
        <div className="absolute bottom-0 right-0 w-96 h-96 opacity-[0.03] pointer-events-none">
          <svg viewBox="0 0 200 200" fill="white">
            <path d="M 80 10 L 50 100 L 90 100 L 60 190 L 150 80 L 110 80 L 140 10 Z" />
          </svg>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Login Form                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={`flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10 transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="w-full max-w-sm">
          {/* Mobile Logo (only shown on small screens) */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-xl shadow-blue-500/30">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight block leading-tight">@Canditos OCPP</span>
              <span className="text-gray-500 text-[11px]">Central System 1.6</span>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Bem-vindo de volta
            </h2>
            <p className="text-sm text-gray-500 mt-1.5">
              Introduz as tuas credenciais para aceder ao sistema
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-6 animate-[fadeUp_0.3s_ease-out]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                Utilizador
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-600 group-focus-within:text-blue-400 transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nome de utilizador"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 focus:bg-white/[0.07] transition-all duration-200"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                Palavra-passe
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-600 group-focus-within:text-blue-400 transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 focus:bg-white/[0.07] transition-all duration-200"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group overflow-hidden"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  A verificar…
                </span>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-950 px-3 flex items-center gap-1.5 text-[11px] text-gray-600 uppercase tracking-widest font-semibold">
                <Sparkles className="w-3 h-3 text-amber-500/60" />
                Acesso de Teste
              </span>
            </div>
          </div>

          {/* Quick Credentials */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => fillCredentials('admin', 'admin123')}
              className="group relative p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-blue-500/30 text-left transition-all duration-200"
            >
              <div className="absolute top-3 right-3">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-mono font-bold uppercase">
                  Full
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-white">Admin</span>
              </div>
              <div className="text-[11px] text-gray-600 font-mono">
                admin / admin123
              </div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('condutor', 'user123')}
              className="group relative p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/30 text-left transition-all duration-200"
            >
              <div className="absolute top-3 right-3">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-mono font-bold uppercase">
                  User
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-white">Condutor</span>
              </div>
              <div className="text-[11px] text-gray-600 font-mono">
                condutor / user123
              </div>
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-gray-700 mt-10">
            OCPP 1.6 Central System · @Canditos
          </p>
        </div>
      </div>
    </div>
  )
}
