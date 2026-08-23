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

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Preenche todos os campos.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.login({ username: username.trim(), password })
      login(res.token, res.user)
      navigate(res.user.role === 'admin' ? '/' : '/my-charging')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Credenciais inválidas.')
    } finally { setLoading(false) }
  }

  const fill = (u: string, p: string) => { setUsername(u); setPassword(p); setError(null) }

  return (
    <div
      style={{ background: '#020617', color: '#f1f5f9', minHeight: '100vh' }}
      className="flex overflow-hidden relative"
    >
      {/* ── Animated BG Orbs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute rounded-full animate-pulse"
          style={{ top: '-10rem', left: '-10rem', width: '28rem', height: '28rem', background: 'rgba(37,99,235,0.15)', filter: 'blur(120px)' }}
        />
        <div
          className="absolute rounded-full animate-pulse"
          style={{ bottom: '-8rem', right: '-6rem', width: '24rem', height: '24rem', background: 'rgba(79,70,229,0.12)', filter: 'blur(100px)', animationDelay: '1.5s' }}
        />
        <div
          className="absolute rounded-full animate-pulse"
          style={{ top: '50%', left: '40%', width: '20rem', height: '20rem', background: 'rgba(16,185,129,0.08)', filter: 'blur(100px)', animationDelay: '3s' }}
        />
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* LEFT PANEL — Hero                              */}
      {/* ══════════════════════════════════════════════ */}
      <div
        className={`hidden lg:flex lg:w-[55%] relative flex-col justify-between p-10 xl:p-14 transition-all duration-1000 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}
      >
        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.04,
            backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        {/* Top Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl shadow-xl" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' , boxShadow: '0 8px 32px rgba(37,99,235,0.35)' }}>
              <Zap className="w-6 h-6 text-white" fill="white" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#34d399' }} />
                <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: '#34d399' }} />
              </span>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight block" style={{ color: '#ffffff' }}>@Canditos OCPP</span>
              <span className="text-xs font-medium" style={{ color: '#64748b' }}>Central System 1.6</span>
            </div>
          </div>
        </div>

        {/* Center Hero */}
        <div className="relative z-10 max-w-lg">
          {/* Status Pill */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)', color: '#60a5fa' }}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Sistema Ativo · Monitorização em Tempo Real</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-extrabold leading-[1.1] tracking-tight mb-5" style={{ color: '#ffffff' }}>
            Gestão Inteligente
            <br />
            <span style={{ background: 'linear-gradient(90deg, #60a5fa, #818cf8, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              de Carregamentos
            </span>
          </h1>

          <p className="text-base leading-relaxed max-w-md" style={{ color: '#94a3b8' }}>
            Controla os teus postos de carregamento em tempo real.
            Monitorização de energia, perfis de carga inteligentes
            e gestão de acessos RFID numa única plataforma.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-2.5 mt-8">
            {[
              { icon: Zap, text: 'Smart Charging', color: '#60a5fa' },
              { icon: Shield, text: 'RFID Auth', color: '#34d399' },
              { icon: BatteryCharging, text: 'Telemetria Live', color: '#a78bfa' },
            ].map(({ icon: Icon, text, color }) => (
              <div
                key={text}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#cbd5e1' }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="relative z-10">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold font-mono" style={{ color: '#ffffff' }}>OCPP</div>
              <div className="text-xs" style={{ color: '#64748b' }}>Protocolo</div>
            </div>
            <div style={{ width: '1px', height: '2.5rem', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <div className="text-2xl font-bold font-mono" style={{ color: '#ffffff' }}>1.6J</div>
              <div className="text-xs" style={{ color: '#64748b' }}>Versão</div>
            </div>
            <div style={{ width: '1px', height: '2.5rem', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <div className="text-2xl font-bold font-mono flex items-center gap-1.5" style={{ color: '#34d399' }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#34d399' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#34d399' }} />
                </span>
                Online
              </div>
              <div className="text-xs" style={{ color: '#64748b' }}>Estado</div>
            </div>
          </div>
        </div>

        {/* Decorative Bolt */}
        <div className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none" style={{ opacity: 0.03 }}>
          <svg viewBox="0 0 200 200" fill="white"><path d="M 80 10 L 50 100 L 90 100 L 60 190 L 150 80 L 110 80 L 140 10 Z" /></svg>
        </div>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Login Form                       */}
      {/* ══════════════════════════════════════════════ */}
      <div className={`flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10 transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="w-full max-w-sm">

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}>
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block" style={{ color: '#ffffff' }}>@Canditos OCPP</span>
              <span className="text-[11px]" style={{ color: '#64748b' }}>Central System 1.6</span>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
              Bem-vindo de volta
            </h2>
            <p className="text-sm mt-1.5" style={{ color: '#94a3b8' }}>
              Introduz as tuas credenciais para aceder ao sistema
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl text-xs mb-6"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                Utilizador
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors" style={{ color: '#475569' }}>
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nome de utilizador"
                  autoFocus
                  required
                  style={{
                    width: '100%', paddingLeft: '2.75rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem',
                    borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                  }}
                  className="focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all placeholder:text-gray-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                Palavra-passe
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors" style={{ color: '#475569' }}>
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', paddingLeft: '2.75rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem',
                    borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                  }}
                  className="focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all placeholder:text-gray-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: '#ffffff',
                boxShadow: '0 8px 32px rgba(37,99,235,0.3)',
              }}
            >
              {/* Shine */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
              />
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
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
            <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} /></div>
            <div className="relative flex justify-center" style={{ background: '#020617' }}>
              <span className="px-4 flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold" style={{ color: '#475569', background: '#020617' }}>
                <Sparkles className="w-3 h-3" style={{ color: '#f59e0b' }} />
                Acesso Rápido
              </span>
            </div>
          </div>

          {/* Quick Credentials */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => fill('admin', 'admin123')}
              className="relative p-4 rounded-xl text-left transition-all duration-200 group"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div className="absolute top-3 right-3">
                <span className="text-[9px] px-2 py-0.5 rounded-md font-mono font-bold uppercase" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>Full</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold" style={{ color: '#ffffff' }}>Admin</span>
              </div>
              <div className="text-[11px] font-mono" style={{ color: '#64748b' }}>admin / admin123</div>
            </button>

            <button
              type="button"
              onClick={() => fill('condutor', 'user123')}
              className="relative p-4 rounded-xl text-left transition-all duration-200 group"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div className="absolute top-3 right-3">
                <span className="text-[9px] px-2 py-0.5 rounded-md font-mono font-bold uppercase" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>User</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold" style={{ color: '#ffffff' }}>Condutor</span>
              </div>
              <div className="text-[11px] font-mono" style={{ color: '#64748b' }}>condutor / user123</div>
            </button>
          </div>

          <p className="text-center text-[11px] mt-10" style={{ color: '#334155' }}>
            OCPP 1.6 Central System · @Canditos
          </p>
        </div>
      </div>
    </div>
  )
}
