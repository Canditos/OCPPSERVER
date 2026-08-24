import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, User, Lock, Mail, Tag, AlertCircle, ArrowRight,
  Sparkles, Shield, BatteryCharging, Activity, CheckCircle2, UserPlus, LogIn, AtSign
} from 'lucide-react'
import { api } from '../api'
import { useAuthStore } from '../store/authStore'

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  // Mode: 'login' | 'register'
  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [password, setPassword] = useState('')

  // Register Form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regRfid, setRegRfid] = useState('')
  const [regSuccess, setRegSuccess] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginIdentifier.trim() || !password) { setError('Preenche todos os campos.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.login({ username: loginIdentifier.trim(), password })
      login(res.token, res.user)
      navigate(res.user.role === 'admin' ? '/' : '/my-charging')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Credenciais inválidas ou conta pendente de aprovação.')
    } finally { setLoading(false) }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError('Por favor introduz o Nome e o Apelido.')
      return
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('Por favor introduz um email válido.')
      return
    }
    if (regPassword.length < 4) {
      setError('A palavra-passe deve ter pelo menos 4 caracteres.')
      return
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`

    setLoading(true)
    setError(null)
    try {
      const res = await api.registerDriver({
        full_name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: regEmail.trim().split('@')[0],
        email: regEmail.trim(),
        password: regPassword,
        requested_rfid_tag: regRfid.trim() || undefined,
      })
      setRegSuccess(res.message || 'Pedido de registo submetido com sucesso! A tua conta aguarda aprovação pelo Administrador.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao submeter pedido de registo.')
    } finally {
      setLoading(false)
    }
  }

  const fill = (u: string, p: string) => {
    setMode('login')
    setLoginIdentifier(u)
    setPassword(p)
    setError(null)
  }

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
        className={`hidden lg:flex lg:w-[48%] xl:w-[52%] relative flex-col justify-between p-10 xl:p-14 transition-all duration-1000 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}
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
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl shadow-xl" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 8px 32px rgba(37,99,235,0.35)' }}>
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
            <span>Sistema Ativo · Mobilidade Elétrica Sustentável</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-extrabold leading-[1.1] tracking-tight mb-5" style={{ color: '#ffffff' }}>
            Carregamentos
            <br />
            <span style={{ background: 'linear-gradient(90deg, #60a5fa, #818cf8, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Simples & Partilhados
            </span>
          </h1>

          <p className="text-base leading-relaxed max-w-md" style={{ color: '#94a3b8' }}>
            Plataforma central de gestão de postos de carregamento OCPP, telemetria em tempo real, registo de condutores e atribuição de chaves RFID.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-2.5 mt-8">
            {[
              { icon: Zap, text: 'Smart Charging', color: '#60a5fa' },
              { icon: Shield, text: 'Aprovação RFID', color: '#34d399' },
              { icon: Mail, text: 'Avisos por Email', color: '#fbbf24' },
              { icon: BatteryCharging, text: 'Portal do Condutor', color: '#a78bfa' },
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
      {/* RIGHT PANEL — Login / Register Tabs            */}
      {/* ══════════════════════════════════════════════ */}
      <div className={`flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10 transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="w-full max-w-md">

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}>
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block" style={{ color: '#ffffff' }}>@Canditos OCPP</span>
              <span className="text-[11px]" style={{ color: '#64748b' }}>Central System 1.6</span>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            className="flex items-center p-1 rounded-2xl mb-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setRegSuccess(null); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              style={{
                background: mode === 'login' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'transparent',
                color: mode === 'login' ? '#ffffff' : '#94a3b8',
                boxShadow: mode === 'login' ? '0 4px 16px rgba(37,99,235,0.3)' : 'none',
              }}
            >
              <LogIn className="w-4 h-4" />
              <span>Iniciar Sessão</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setRegSuccess(null); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              style={{
                background: mode === 'register' ? 'linear-gradient(135deg, #059669, #10b981)' : 'transparent',
                color: mode === 'register' ? '#ffffff' : '#94a3b8',
                boxShadow: mode === 'register' ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
              }}
            >
              <UserPlus className="w-4 h-4" />
              <span>Registar Condutor</span>
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl text-xs mb-5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* TAB 1: LOGIN                                                */}
          {/* ──────────────────────────────────────────────────────────── */}
          {mode === 'login' && (
            <div>
              <div className="mb-5">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
                  Bem-vindo de volta
                </h2>
                <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                  Introduz o teu email ou username para aceder
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                    Email ou Nome de Utilizador
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                      <AtSign className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="ex: hugo@empresa.com ou admin"
                      autoFocus
                      required
                      style={{
                        width: '100%', paddingLeft: '2.5rem', paddingRight: '1rem', paddingTop: '0.7rem', paddingBottom: '0.7rem',
                        borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                      }}
                      className="focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all placeholder:text-gray-600 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                    Palavra-passe
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{
                        width: '100%', paddingLeft: '2.5rem', paddingRight: '1rem', paddingTop: '0.7rem', paddingBottom: '0.7rem',
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
                  className="relative w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group overflow-hidden cursor-pointer"
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
                      A autenticar…
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
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} /></div>
                <div className="relative flex justify-center" style={{ background: '#020617' }}>
                  <span className="px-4 flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold" style={{ color: '#475569', background: '#020617' }}>
                    <Sparkles className="w-3 h-3" style={{ color: '#f59e0b' }} />
                    Contas de Teste
                  </span>
                </div>
              </div>

              {/* Quick Credentials */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => fill('admin', 'admin123')}
                  className="relative p-3.5 rounded-xl text-left transition-all duration-200 group cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="p-1 rounded-md" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold" style={{ color: '#ffffff' }}>Admin</span>
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>admin / admin123</div>
                </button>

                <button
                  type="button"
                  onClick={() => fill('condutor', 'user123')}
                  className="relative p-3.5 rounded-xl text-left transition-all duration-200 group cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="p-1 rounded-md" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold" style={{ color: '#ffffff' }}>Condutor</span>
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>condutor / user123</div>
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* TAB 2: REGISTER DRIVER (Pending Approval)                   */}
          {/* ──────────────────────────────────────────────────────────── */}
          {mode === 'register' && (
            <div>
              {regSuccess ? (
                <div
                  className="p-6 rounded-2xl text-center space-y-4"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Pedido Enviado com Sucesso!
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#cbd5e1' }}>
                    {regSuccess}
                  </p>
                  <div className="p-3.5 rounded-xl text-left text-xs space-y-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-slate-400">👤 Nome Completo: <strong className="text-white">{firstName} {lastName}</strong></div>
                    <div className="text-slate-400">📧 Email de Login: <strong className="text-emerald-400 font-mono">{regEmail}</strong></div>
                    <div className="text-slate-400">⏳ Estado: <strong className="text-amber-400">Aguardando Validação do Admin</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setRegSuccess(null); setLoginIdentifier(regEmail); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#ffffff' }}
                  >
                    Ir para o Login
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-5">
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
                      Criar Conta de Condutor
                    </h2>
                    <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                      Regista os teus dados para aprovação e atribuição de chave RFID
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                    
                    {/* First and Last Name Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                          Nome *
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="ex: Hugo"
                            required
                            style={{
                              width: '100%', paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingTop: '0.6rem', paddingBottom: '0.6rem',
                              borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                              color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                            }}
                            className="focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all placeholder:text-gray-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                          Apelido *
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="ex: Santos"
                          required
                          style={{
                            width: '100%', paddingLeft: '0.85rem', paddingRight: '0.75rem', paddingTop: '0.6rem', paddingBottom: '0.6rem',
                            borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                          }}
                          className="focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all placeholder:text-gray-600"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                          Email (Usado para Login & Avisos) *
                        </label>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                          <Mail className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="ex: hugo.santos@empresa.com"
                          required
                          style={{
                            width: '100%', paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingTop: '0.6rem', paddingBottom: '0.6rem',
                            borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                          }}
                          className="focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all placeholder:text-gray-600 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                        Palavra-passe *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          required
                          style={{
                            width: '100%', paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingTop: '0.6rem', paddingBottom: '0.6rem',
                            borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                          }}
                          className="focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all placeholder:text-gray-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                        Cartão / Chave RFID Físico (Opcional)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: '#475569' }}>
                          <Tag className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          value={regRfid}
                          onChange={(e) => setRegRfid(e.target.value)}
                          placeholder="Se já tiveres um cartão da empresa (ex: 9F13FB29)"
                          style={{
                            width: '100%', paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingTop: '0.6rem', paddingBottom: '0.6rem',
                            borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#f1f5f9', fontSize: '0.875rem', outline: 'none',
                          }}
                          className="focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all placeholder:text-gray-600 font-mono text-xs"
                        />
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
                        Caso não tenhas cartão, o Administrador irá atribuir-te uma chave RFID.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="relative w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group overflow-hidden cursor-pointer mt-2"
                      style={{
                        background: 'linear-gradient(135deg, #059669, #10b981)',
                        color: '#ffffff',
                        boxShadow: '0 8px 32px rgba(16,185,129,0.3)',
                      }}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          A submeter pedido…
                        </span>
                      ) : (
                        <>
                          <span>Submeter Pedido de Registo</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[11px] mt-6" style={{ color: '#334155' }}>
            OCPP 1.6 Central System · @Canditos
          </p>
        </div>
      </div>
    </div>
  )
}
