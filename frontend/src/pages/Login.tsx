import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ShieldCheck, User, Lock, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { api } from '../api'
import { useAuthStore } from '../store/authStore'
import { ThemeToggle } from '../components/ThemeToggle'

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const msg = err?.response?.data?.detail || 'Erro ao autenticar. Verifica as tuas credenciais.'
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
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-gray-100 transition-colors duration-200">
      {/* Top Navbar with Theme Toggle */}
      <header className="p-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-600/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white block">
              @Canditos OCPP
            </span>
            <span className="text-[10px] text-slate-500 dark:text-gray-400">
              Central System 1.6
            </span>
          </div>
        </div>

        <ThemeToggle />
      </header>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-up">
          <div className="card p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-2xl bg-white/90 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 mb-3">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Iniciar Sessão
              </h1>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                Introduz os teus dados de acesso para gerir os carregamentos
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs mb-5 animate-fade-up">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                  Nome de Utilizador
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-gray-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: admin ou condutor"
                    className="input pl-9 w-full bg-slate-50 dark:bg-gray-800/80 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white text-sm"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                  Palavra-passe
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-gray-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-9 w-full bg-slate-50 dark:bg-gray-800/80 border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white text-sm"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-2.5 mt-2 flex items-center justify-center gap-2 font-medium shadow-md shadow-blue-500/20"
              >
                {loading ? (
                  <span className="text-xs">A verificar credenciais…</span>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials helper */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-gray-400 mb-2.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Acesso Rápido de Teste</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillCredentials('admin', 'admin123')}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Admin</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">Tudo</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-gray-400 font-mono mt-0.5">
                    admin / admin123
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fillCredentials('condutor', 'user123')}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Condutor</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono">User</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-gray-400 font-mono mt-0.5">
                    condutor / user123
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-400 dark:text-gray-600">
        OCPP 1.6 Central System · @Canditos OCPP
      </footer>
    </div>
  )
}
