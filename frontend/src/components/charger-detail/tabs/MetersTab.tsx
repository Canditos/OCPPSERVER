import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Wand2, Trash2, Key, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { api, MeterKeyData } from '../../../api'

interface MetersTabProps {
  chargerId: string
  isOnline: boolean
  isEichrechtCompliant: boolean
  meterKeys: MeterKeyData[]
  onRefreshMeterKeys: () => void
  onRefreshCharger?: () => void
}

export function MetersTab({
  chargerId,
  isOnline,
  isEichrechtCompliant,
  meterKeys,
  onRefreshMeterKeys,
  onRefreshCharger,
}: MetersTabProps) {
  const [lemConnectorId, setLemConnectorId] = useState<number>(1)
  const [lemModel, setLemModel] = useState<string>('Bauer BSM-WS (AC)')
  const [lemSerial, setLemSerial] = useState<string>('')
  const [lemPubKeyHex, setLemPubKeyHex] = useState<string>('')
  const [lemCurve, setLemCurve] = useState<string>('secp256r1')
  const [lemSaving, setLemSaving] = useState<boolean>(false)
  const [lemFeedback, setLemFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isExtractingKey, setIsExtractingKey] = useState<boolean>(false)

  // Prefill form when connector or meterKeys change
  useEffect(() => {
    const existing = meterKeys.find((k) => k.connector_id === lemConnectorId)
    if (existing) {
      setLemPubKeyHex(existing.public_key_hex || '')
      setLemSerial(existing.serial_number || '')
      setLemModel(existing.meter_model || 'Bauer BSM-WS (AC)')
      setLemCurve(existing.curve_name || 'secp256r1')
    } else {
      setLemPubKeyHex('')
      setLemSerial('')
    }
  }, [lemConnectorId, meterKeys])

  const handleExtractMeterKey = async () => {
    if (!chargerId) return
    setIsExtractingKey(true)
    setLemFeedback(null)
    try {
      const res = await api.extractMeterKey(chargerId, lemConnectorId)
      setLemPubKeyHex(res.public_key_hex || '')
      setLemSerial(res.serial_number || '')
      setLemModel(res.meter_model || 'LEM DCBM 400')
      setLemCurve(res.curve_name || 'secp256r1')
      setLemFeedback({
        type: 'success',
        message: res.message || `Chave do medidor extraída com sucesso via ${res.source}!`,
      })
      onRefreshMeterKeys()
      onRefreshCharger?.()
    } catch (err: any) {
      setLemFeedback({
        type: 'error',
        message: err?.response?.data?.detail || err?.message || 'Falha ao extrair chave pública do medidor',
      })
    } finally {
      setIsExtractingKey(false)
      setTimeout(() => setLemFeedback(null), 8000)
    }
  }

  const handleSaveMeterKey = async () => {
    if (!chargerId || !lemPubKeyHex.trim()) return
    setLemSaving(true)
    setLemFeedback(null)
    try {
      await api.createOrUpdateMeterKey(chargerId, {
        connector_id: lemConnectorId,
        meter_model: lemModel,
        serial_number: lemSerial.trim() || undefined,
        public_key_hex: lemPubKeyHex.trim(),
        curve_name: lemCurve,
      })
      setLemFeedback({
        type: 'success',
        message: `Chave pública do medidor guardada com sucesso para a Tomada #${lemConnectorId}!`,
      })
      setLemPubKeyHex('')
      setLemSerial('')
      onRefreshMeterKeys()
      onRefreshCharger?.()
    } catch (err: any) {
      setLemFeedback({
        type: 'error',
        message: err?.response?.data?.detail || err?.message || 'Erro ao guardar chave',
      })
    } finally {
      setLemSaving(false)
      setTimeout(() => setLemFeedback(null), 5000)
    }
  }

  const handleDeleteMeterKey = async (keyId: number) => {
    if (!chargerId || !confirm('Deseja remover esta chave de medidor?')) return
    try {
      await api.deleteMeterKey(chargerId, keyId)
      onRefreshMeterKeys()
      onRefreshCharger?.()
    } catch (err: any) {
      alert('Erro ao remover: ' + (err?.response?.data?.detail || err.message))
    }
  }

  const handleToggleEichrecht = async () => {
    if (!chargerId) return
    try {
      await api.setChargerEichrecht(chargerId, !isEichrechtCompliant)
      onRefreshCharger?.()
    } catch (err: any) {
      alert('Erro ao atualizar certificação ERK: ' + (err?.response?.data?.detail || err.message))
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card space-y-5 border border-purple-500/20 shadow-xl shadow-purple-500/5">
        {/* Header with Title & Quick Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Metrologia Legal & Medidores Eichrecht (OCMF)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-mono font-bold">
                  S.A.F.E. v2.0.2 · PTB-A 50.7
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                Assinaturas criptográficas ECDSA de medidores AC (Bauer/EMU) e DC (LEM DCBM)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExtractMeterKey}
              disabled={isExtractingKey || !isOnline}
              className="btn bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs py-2 px-3.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-purple-500/20 disabled:opacity-50 cursor-pointer transition-all"
              title="Interrogar o carregador via OCPP para extrair automaticamente a chave pública do medidor"
            >
              <Wand2 className={`w-4 h-4 ${isExtractingKey ? 'animate-spin' : ''}`} />
              <span>{isExtractingKey ? 'A extrair chave…' : '⚡ Sacar Chave (OCPP)'}</span>
            </button>

            <Link
              to="/ocmf"
              className="btn-ghost text-xs px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-gray-300 flex items-center gap-1.5"
            >
              <span>Auditoria OCMF →</span>
            </Link>
          </div>
        </div>

        {/* Status Toggle Card */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-bold text-slate-900 dark:text-white text-sm block">Certificação ERK / Eichrecht Ativa no Posto</span>
            <span className="text-xs text-slate-500 dark:text-gray-400">
              Ativa a validação obrigatória de assinaturas OCMF e o selo visual de metrologia calibrada
            </span>
          </div>
          <button
            type="button"
            onClick={handleToggleEichrecht}
            className={`text-xs px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
              isEichrechtCompliant
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-400'
            }`}
          >
            {isEichrechtCompliant ? '✅ Ativo (Certificado ERK)' : 'Desativado'}
          </button>
        </div>

        {/* Configured Meter Keys List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider">
              Chaves de Medidores Registadas ({meterKeys.length})
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-gray-400">
              1 chave pública por conector físico
            </span>
          </div>

          {meterKeys.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white/2 border border-white/6 text-center text-xs text-slate-500 dark:text-gray-400">
              Nenhuma chave pública configurada para este posto. Clique em "⚡ Sacar Chave (OCPP)" ou utilize o formulário abaixo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {meterKeys.map((mk) => (
                <div
                  key={mk.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/6 flex flex-col justify-between text-xs space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">Tomada #{mk.connector_id}</span>
                        <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                          {mk.meter_model}
                        </span>
                      </div>
                      {mk.serial_number && (
                        <p className="text-[11px] font-mono text-slate-500 dark:text-gray-400 mt-0.5">
                          S/N: <span className="text-slate-700 dark:text-gray-200 font-bold">{mk.serial_number}</span>
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteMeterKey(mk.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover Chave"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-gray-950/60 border border-white/5 font-mono text-[10px] text-slate-400 break-all select-all">
                    <span className="text-gray-500 block mb-0.5">Curva: {mk.curve_name}</span>
                    {mk.public_key_hex}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form to Register / Update Meter Key */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 space-y-3.5">
          <h4 className="text-xs font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-purple-400" />
            Registar / Atualizar Chave Pública do Medidor
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-gray-400 block mb-1">Tomada / Conector:</label>
              <select
                value={lemConnectorId}
                onChange={(e) => setLemConnectorId(Number(e.target.value))}
                className="select text-xs py-2 w-full"
              >
                <option value={1}>Tomada #1</option>
                <option value={2}>Tomada #2</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-gray-400 block mb-1">Modelo do Medidor:</label>
              <select
                value={lemModel}
                onChange={(e) => setLemModel(e.target.value)}
                className="select text-xs py-2 w-full font-medium"
              >
                <optgroup label="Medidores AC">
                  <option value="Bauer BSM-WS (AC)">Bauer BSM-WS (AC Eichrecht)</option>
                  <option value="Bauer BM (AC)">Bauer BM Series (AC)</option>
                  <option value="Bauer E350 (AC)">Bauer E350 (AC)</option>
                  <option value="EMU Professional (AC)">EMU Professional (AC)</option>
                  <option value="Eastron SDM (AC)">Eastron SDM630/72D (AC)</option>
                  <option value="Hager / Bender (AC)">Hager / Bender (AC)</option>
                </optgroup>
                <optgroup label="Medidores DC">
                  <option value="LEM DCBM 400">LEM DCBM 400 (DC)</option>
                  <option value="LEM DCBM 600">LEM DCBM 600 (DC)</option>
                  <option value="LEM DCBM 100">LEM DCBM 100 (DC)</option>
                  <option value="Isabellenhuette">Isabellenhütte (DC)</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-gray-400 block mb-1">Nº de Série do Medidor (Opcional):</label>
              <input
                type="text"
                value={lemSerial}
                onChange={(e) => setLemSerial(e.target.value)}
                placeholder="Ex: 1202671229 ou BSM-2026..."
                className="input text-xs font-mono py-2 w-full"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-gray-400 block mb-1">Curva Criptográfica ECDSA:</label>
              <select
                value={lemCurve}
                onChange={(e) => setLemCurve(e.target.value)}
                className="select text-xs py-2 w-full"
              >
                <option value="secp256r1">secp256r1 (NIST P-256 / LEM / Bauer)</option>
                <option value="brainpoolP256r1">brainpoolP256r1 (PTB / BSI Eichrecht)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-600 dark:text-gray-400 block mb-1">Chave Pública ECDSA (Hex 04... / DER 3059... / PEM):</label>
            <input
              type="text"
              value={lemPubKeyHex}
              onChange={(e) => setLemPubKeyHex(e.target.value)}
              placeholder="04039b53... ou 305930130607..."
              className="input text-xs font-mono py-2 w-full"
            />
          </div>

          {lemFeedback && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              lemFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {lemFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
              <span>{lemFeedback.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveMeterKey}
            disabled={lemSaving || !lemPubKeyHex.trim()}
            className="btn bg-purple-600 hover:bg-purple-500 text-white text-xs w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-purple-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{lemSaving ? 'A guardar…' : `Guardar Chave do Medidor na Tomada #${lemConnectorId}`}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
