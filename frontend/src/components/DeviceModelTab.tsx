import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Cpu, Layers, Sliders, RefreshCw, CheckCircle2, AlertCircle,
  Search, Shield, Key, Sparkles, Check, Copy, Zap, ArrowRight
} from 'lucide-react'
import { api } from '../api'
import { useI18n } from '../i18n'
import type { DeviceComponent, DeviceVariable } from '../types'

interface DeviceModelTabProps {
  chargerId: string
  isOnline: boolean
  ocppVersion?: string
}

export function DeviceModelTab({ chargerId, isOnline, ocppVersion }: DeviceModelTabProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingVar, setEditingVar] = useState<{ comp: string; var: string; val: string } | null>(null)
  const [emaidInput, setEmaidInput] = useState('DEV2G1234567890')
  const [issuedContract, setIssuedContract] = useState<any | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const { data: components = [], isLoading, refetch } = useQuery<DeviceComponent[]>({
    queryKey: ['deviceModel', chargerId],
    queryFn: () => api.getDeviceModel(chargerId),
    refetchInterval: 10000,
  })

  const requestReportMutation = useMutation({
    mutationFn: () => api.requestBaseReport(chargerId),
    onSuccess: (res) => {
      setToastMsg(res.detail || t('chargerDetail.deviceModel.requestReportSuccess'))
      setTimeout(() => setToastMsg(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['deviceModel', chargerId] })
    },
    onError: (err: any) => {
      setToastMsg(`Erro: ${err?.response?.data?.detail || err.message}`)
      setTimeout(() => setToastMsg(null), 5000)
    },
  })

  const saveVarMutation = useMutation({
    mutationFn: (data: { comp: string; var: string; val: string }) =>
      api.setDeviceVariable(chargerId, {
        component_name: data.comp,
        variable_name: data.var,
        value: data.val,
      }),
    onSuccess: () => {
      setEditingVar(null)
      queryClient.invalidateQueries({ queryKey: ['deviceModel', chargerId] })
    },
  })

  const issueContractMutation = useMutation({
    mutationFn: (emaid: string) => api.issuePncContract(chargerId, { emaid, validity_days: 365 }),
    onSuccess: (res) => {
      setIssuedContract(res)
    },
  })

  const filteredComponents = components.filter((c) => {
    const q = search.toLowerCase()
    if (!q) return true
    if (c.name.toLowerCase().includes(q)) return true
    if (c.instance && c.instance.toLowerCase().includes(q)) return true
    return c.variables.some((v) => v.name.toLowerCase().includes(q) || (v.value && v.value.toLowerCase().includes(q)))
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-gray-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Header Info & Actions */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/20 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">{t('chargerDetail.deviceModel.title')}</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              ISO 15118 / OCPP 2.0.1
            </span>
          </div>
          <p className="text-xs text-gray-300 max-w-xl">
            {t('chargerDetail.deviceModel.description')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => requestReportMutation.mutate()}
            disabled={requestReportMutation.isPending || !isOnline}
            className="btn-primary text-xs py-2 px-3.5 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/20"
            title={!isOnline ? 'Posto offline' : 'Dispara GetBaseReport via OCPP 2.0.1'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${requestReportMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{requestReportMutation.isPending ? t('chargerDetail.deviceModel.saving') : t('chargerDetail.deviceModel.requestReportBtn')}</span>
          </button>
        </div>
      </div>

      {/* ISO 15118 Plug & Charge Contract Issuance Widget */}
      <div className="card border-purple-500/20 bg-purple-950/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              {t('chargerDetail.deviceModel.issuePncTitle')}
            </h4>
          </div>
          <span className="text-[11px] text-purple-400 font-mono">PKI V2G Trust</span>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          {t('chargerDetail.deviceModel.issuePncDesc')}
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Key className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
            <input
              type="text"
              value={emaidInput}
              onChange={(e) => setEmaidInput(e.target.value)}
              placeholder="eMAID (ex: DEV2G1234567890)"
              className="input pl-8 py-1.5 text-xs font-mono w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => issueContractMutation.mutate(emaidInput)}
            disabled={issueContractMutation.isPending || !emaidInput}
            className="btn bg-purple-600 hover:bg-purple-500 text-white text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-200" />
            <span>{issueContractMutation.isPending ? t('chargerDetail.deviceModel.saving') : t('chargerDetail.deviceModel.issueCertBtn')}</span>
          </button>
        </div>

        {/* Issued Contract Result */}
        {issuedContract && (
          <div className="mt-4 p-3.5 rounded-xl bg-gray-900/90 border border-purple-500/30 text-xs space-y-2">
            <div className="flex items-center justify-between text-emerald-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Certificado de Contrato ISO 15118 Emitido!
              </span>
              <span className="text-[11px] font-mono text-gray-400">Validade: 365 dias</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                <span className="text-gray-500 block text-[10px]">eMAID Sujeito:</span>
                <span className="text-purple-300 font-bold">{issuedContract.emaid}</span>
              </div>
              <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                <span className="text-gray-500 block text-[10px]">Número de Série:</span>
                <span className="text-gray-300 truncate block">{issuedContract.serial_number}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Components & Variables Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            {t('chargerDetail.deviceModel.componentsFound')} ({filteredComponents.length})
          </h4>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('chargerDetail.deviceModel.searchPlaceholder')}
            className="input pl-8 py-1.5 text-xs w-full"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredComponents.length === 0 && !isLoading && (
        <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
          <Sliders className="w-8 h-8 text-gray-600" />
          <p className="text-gray-400 text-xs max-w-md">
            {t('chargerDetail.deviceModel.noComponents')}
          </p>
          <button
            type="button"
            onClick={() => requestReportMutation.mutate()}
            disabled={requestReportMutation.isPending || !isOnline}
            className="btn-secondary text-xs px-4 py-1.5 rounded-lg"
          >
            {t('chargerDetail.deviceModel.requestReportBtn')}
          </button>
        </div>
      )}

      {/* Components List */}
      <div className="space-y-4">
        {filteredComponents.map((comp) => (
          <div key={comp.id} className="card p-0 overflow-hidden border-white/10 bg-white/4">
            {/* Component Header */}
            <div className="px-4 py-3 bg-white/5 border-b border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-xs font-bold text-white font-mono">{comp.name}</span>
                {comp.instance && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                    inst: {comp.instance}
                  </span>
                )}
                {comp.evse_id && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                    EVSE #{comp.evse_id}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-gray-500">
                {comp.variables.length} var(s)
              </span>
            </div>

            {/* Variables Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase text-gray-500 bg-black/20 font-mono">
                    <th className="text-left px-4 py-2">Variável</th>
                    <th className="text-left px-4 py-2">Tipo / Unidade</th>
                    <th className="text-left px-4 py-2">Acesso</th>
                    <th className="text-left px-4 py-2">Valor Atual</th>
                    <th className="text-right px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comp.variables.map((v) => {
                    const isEditing = editingVar && editingVar.comp === comp.name && editingVar.var === v.name
                    return (
                      <tr key={v.id} className="hover:bg-blue-500/5 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium text-gray-300">
                          {v.name}
                          {v.instance && <span className="text-gray-500 text-[10px] ml-1">({v.instance})</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-400">
                          <span className="text-[11px]">{v.data_type || 'string'}</span>
                          {v.unit && <span className="text-amber-300 ml-1 font-bold">[{v.unit}]</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                            v.mutability === 'ReadOnly'
                              ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          }`}>
                            {v.mutability || 'ReadWrite'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingVar.val}
                              onChange={(e) => setEditingVar({ ...editingVar, val: e.target.value })}
                              className="input py-1 px-2 text-xs font-mono w-48"
                              autoFocus
                            />
                          ) : (
                            <span className="font-mono text-white font-semibold bg-black/30 px-2 py-0.5 rounded border border-white/5">
                              {v.value ?? '<null>'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {v.mutability !== 'ReadOnly' && (
                            isEditing ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveVarMutation.mutate(editingVar)}
                                  disabled={saveVarMutation.isPending}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" /> {t('chargerDetail.deviceModel.saveVar')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingVar(null)}
                                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 text-[11px] cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingVar({ comp: comp.name, var: v.name, val: v.value || '' })}
                                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors cursor-pointer"
                              >
                                {t('chargerDetail.deviceModel.editVar')}
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
