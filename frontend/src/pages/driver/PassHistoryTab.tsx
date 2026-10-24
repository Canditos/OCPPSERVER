import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CreditCard, Zap, History, ShieldCheck, Clock,
  Download, Smartphone, Chrome, QrCode
} from 'lucide-react'
import { api } from '../../api'
import { useAuthStore } from '../../store/authStore'
import { OcmfValidationModal } from '../../components/OcmfValidationModal'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { safeFormatDateTime, safeFormatDuration } from '../../utils/date'
import type { Transaction } from '../../types'
import { useTheme } from '../../hooks/useTheme'

export function PassHistoryTab() {
  const { user } = useAuthStore()
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'
  const { canInstall, isInstalled, install } = useInstallPrompt()
  const [selectedTxForOcmf, setSelectedTxForOcmf] = useState<number | null>(null)

  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: api.getMe, refetchInterval: 15000 })
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['my-transactions'],
    queryFn: api.getMyTransactions,
    refetchInterval: 15000,
  })

  const rfidTag = profile?.rfid_tag || user?.rfid_tag || (user?.username ? `TAG_${user.username.toUpperCase()}` : '—')

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Virtual RFID card */}
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white shadow-xl border border-blue-500/20 min-h-[170px] flex flex-col justify-between">
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-36 h-36 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-28 h-28 rounded-full bg-emerald-500/10 blur-xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-xs tracking-wider uppercase text-blue-200">@Canditos · Passe de Condutor</span>
          </div>
          <CreditCard className="w-6 h-6 text-slate-400" />
        </div>

        <div className="relative z-10">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">ID RFID</span>
          <div className="font-mono text-xl font-bold tracking-widest text-emerald-400 bg-black/30 px-3 py-2 rounded-xl border border-white/10 inline-block">
            {rfidTag}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300 relative z-10 pt-2 border-t border-white/10">
          <span>{profile?.username || user?.username}</span>
          <div className="flex gap-3">
            <div className="text-center">
              <span className="block font-bold text-white">{profile?.total_kwh ?? 0}</span>
              <span className="text-[10px] text-slate-400">kWh total</span>
            </div>
            <div className="text-center">
              <span className="block font-bold text-white">{profile?.total_sessions ?? transactions.length}</span>
              <span className="text-[10px] text-slate-400">sessões</span>
            </div>
          </div>
        </div>
      </div>

      {/* Install App card */}
      {!isInstalled && (
        <div className={`rounded-2xl p-4 border ${
          isDark ? 'bg-gradient-to-br from-blue-950/40 to-indigo-950/40 border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20">
              <Smartphone className={`w-5 h-5 ${isDark ? 'text-blue-300' : 'text-blue-600'}`} />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>Instalar App @Canditos</h3>
              <p className={`text-[11px] ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Acesso rápido no ecrã inicial do telemóvel</p>
            </div>
          </div>

          {canInstall ? (
            <button
              onClick={install}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Instalar Agora (1 Clique)
            </button>
          ) : (
            <div className={`space-y-2 text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
              <div className="flex items-start gap-2">
                <Chrome className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Android / Chrome:</strong> Toque nos 3 pontos (⋮) no browser → "Adicionar ao ecrã inicial" → Instalar</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-base">🍎</span>
                <span><strong>iPhone / Safari:</strong> Toque no botão Partilhar (□↑) → "Adicionar ao Ecrã Inicial" → Adicionar</span>
              </div>
              <div className="flex items-start gap-2">
                <QrCode className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Ou partilhe o link: <strong>ocpp.gatoescondido.com/my-charging</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
      {isInstalled && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}>
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className={`text-sm font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>App instalada ✓</span>
        </div>
      )}

      {/* Transaction history */}
      <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-slate-900 border border-white/8' : 'bg-white border border-slate-100'} shadow-sm`}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-inherit">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Histórico de Sessões</h3>
          </div>
          <span className={`text-xs font-mono ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>{transactions.length}</span>
        </div>

        {isLoading && (
          <div className={`py-10 text-center text-sm animate-pulse ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>A carregar…</div>
        )}

        {!isLoading && transactions.length === 0 && (
          <div className={`py-10 text-center space-y-2 ${isDark ? 'text-gray-600' : 'text-slate-400'}`}>
            <Clock className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">Sem sessões registadas</p>
          </div>
        )}

        {!isLoading && transactions.length > 0 && (
          <div className="divide-y divide-inherit">
            {transactions.map((tx: any) => {
              const duration = tx.start_time && tx.stop_time
                ? safeFormatDuration((new Date(tx.stop_time).getTime() - new Date(tx.start_time).getTime()) / 1000)
                : tx.status === 'Active' ? 'Em curso' : '—'

              const energyNum = tx.energy_kwh != null
                ? Number(tx.energy_kwh)
                : tx.signed_energy_kwh != null
                  ? Number(tx.signed_energy_kwh)
                  : tx.meter_stop && tx.meter_start
                    ? (tx.meter_stop - tx.meter_start) / 1000
                    : 0

              const kwhFormatted = energyNum.toFixed(2)
              const cost = (energyNum * 0.28).toFixed(2)
              const hasOcmf = Boolean(tx.ocmf_stop_raw || tx.ocmf_start_raw || tx.ocmf_verified || tx.signed_energy_kwh)
              const isActive = tx.status === 'Active'

              return (
                <div key={tx.id || tx.transaction_id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className={`text-xs font-mono font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                        #{tx.transaction_id}
                      </span>
                      <span className={`ml-2 text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
                        {tx.charge_point_id} ·{tx.connector_id}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                      isActive
                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {isActive ? 'Em curso' : 'Concluída'}
                    </span>
                  </div>

                  <div className={`grid grid-cols-3 gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider mb-0.5">Energia</span>
                      <span className={`font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{kwhFormatted} kWh</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider mb-0.5">Duração</span>
                      <span className={`font-mono ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{duration}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider mb-0.5">Custo est.</span>
                      <span className={`font-mono font-semibold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>{cost} €</span>
                    </div>
                  </div>

                  {hasOcmf && (
                    <button
                      onClick={() => setSelectedTxForOcmf(tx.transaction_id)}
                      className="mt-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>Verificar Medição LEM OCMF</span>
                    </button>
                  )}

                  <div className={`mt-1.5 text-[10px] font-mono ${isDark ? 'text-gray-600' : 'text-slate-400'}`}>
                    {safeFormatDateTime(tx.start_time)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedTxForOcmf && (
        <OcmfValidationModal
          transactionId={selectedTxForOcmf}
          onClose={() => setSelectedTxForOcmf(null)}
        />
      )}
    </div>
  )
}
