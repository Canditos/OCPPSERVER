import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, AlertCircle, QrCode } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

interface QrScanModalProps {
  isOpen: boolean
  onClose: () => void
  onResult: (cpId: string, connectorId: number) => void
}

// QR code format expected: "canditos:CP001:1" or just "CP001" or JSON {"cp":"CP001","conn":1}
function parseQrResult(raw: string): { cpId: string; connectorId: number } | null {
  raw = raw.trim()
  // JSON format
  try {
    const parsed = JSON.parse(raw)
    if (parsed.cp) return { cpId: parsed.cp, connectorId: Number(parsed.conn ?? 1) }
  } catch {}
  // canditos: prefix  
  if (raw.startsWith('canditos:')) {
    const parts = raw.replace('canditos:', '').split(':')
    return { cpId: parts[0], connectorId: Number(parts[1] ?? 1) }
  }
  // Plain charge point id  
  if (raw.length > 0 && raw.length < 50) {
    return { cpId: raw, connectorId: 1 }
  }
  return null
}

export function QrScanModal({ isOpen, onClose, onResult }: QrScanModalProps) {
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    startCamera()
    return () => stopCamera()
  }, [isOpen])

  const startCamera = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setScanning(true)
        startFrameScanning()
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('Permissão de câmara negada. Active nas definições do browser.')
      } else if (err?.name === 'NotFoundError') {
        setError('Câmara não encontrada neste dispositivo.')
      } else {
        setError('Erro ao aceder à câmara: ' + (err?.message || 'desconhecido'))
      }
      setShowManual(true)
    }
  }

  const startFrameScanning = () => {
    if (!('BarcodeDetector' in window)) return
    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
    intervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue
          const parsed = parseQrResult(raw)
          if (parsed) {
            stopCamera()
            onResult(parsed.cpId, parsed.connectorId)
          }
        }
      } catch {}
    }, 300)
  }

  const stopCamera = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const handleManualSubmit = () => {
    const parsed = parseQrResult(manualInput)
    if (parsed) {
      stopCamera()
      onResult(parsed.cpId, parsed.connectorId)
    } else {
      setError('ID do posto inválido. Tente: NOME_POSTO ou NOME_POSTO:1')
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full sm:max-w-sm sm:mx-4 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl ${
        isDark ? 'bg-slate-900 border border-white/10' : 'bg-white border border-slate-200'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-500">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Ler QR Code do Posto</h2>
              <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Aponte a câmara para o QR no posto</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:bg-slate-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera viewfinder */}
        <div className="relative mx-5 mb-4 rounded-2xl overflow-hidden bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {scanning && (
            <>
              {/* Corner guides */}
              <div className="absolute inset-8 pointer-events-none">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                {/* scan line */}
                <div className="absolute left-0 right-0 h-0.5 bg-blue-400/60 top-1/2 animate-bounce" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-xs text-white/70 bg-black/50 px-3 py-1 rounded-full">A ler QR Code...</span>
              </div>
            </>
          )}
          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-12 h-12 text-white/40 mx-auto mb-2" />
                <p className="text-white/60 text-sm">A iniciar câmara...</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Manual fallback */}
        <div className="mx-5 mb-5">
          {!showManual && !error && (
            <button
              onClick={() => setShowManual(true)}
              className={`w-full py-2.5 rounded-xl text-sm ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Introduzir ID manualmente →
            </button>
          )}
          {showManual && (
            <div className="space-y-2">
              <label className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                ID do Posto (ex: CP001 ou CP001:2)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  placeholder="CP001"
                  onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm border outline-none ${
                    isDark
                      ? 'bg-slate-800 border-white/10 text-white placeholder-gray-500 focus:border-blue-500/50'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-300'
                  }`}
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
