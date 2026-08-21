import React, { useId } from 'react'
import { Zap } from 'lucide-react'

interface BatteryIndicatorProps {
  soc: number | null       // 0-100 or null when unknown
  isCharging: boolean
  powerKw?: number | null
  className?: string
}

type ColorConfig = {
  start: string
  end: string
  glow: string
  text: string
  border: string
  bg: string
  label: string
}

function getBatteryColor(soc: number | null): ColorConfig {
  if (soc === null) return {
    start: '#22d3ee', end: '#3b82f6',
    glow: 'shadow-blue-500/40', text: 'text-blue-400',
    border: 'border-blue-500/40', bg: 'bg-blue-500/10', label: 'Carga Rápida DC',
  }
  if (soc < 20) return {
    start: '#dc2626', end: '#fb7185',
    glow: 'shadow-red-500/40', text: 'text-red-400',
    border: 'border-red-500/40', bg: 'bg-red-500/10', label: 'Bateria Crítica',
  }
  if (soc < 50) return {
    start: '#f59e0b', end: '#fbbf24',
    glow: 'shadow-amber-500/40', text: 'text-amber-400',
    border: 'border-amber-500/40', bg: 'bg-amber-500/10', label: 'Carga Baixa',
  }
  if (soc < 80) return {
    start: '#10b981', end: '#4ade80',
    glow: 'shadow-emerald-500/40', text: 'text-emerald-400',
    border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', label: 'A Carregar',
  }
  return {
    start: '#22d3ee', end: '#3b82f6',
    glow: 'shadow-cyan-400/40', text: 'text-cyan-400',
    border: 'border-cyan-400/40', bg: 'bg-cyan-500/10', label: 'Bateria Cheia',
  }
}

export function BatteryIndicator({ soc, isCharging, powerKw, className = '' }: BatteryIndicatorProps) {
  const uid = useId().replace(/:/g, '')
  const color = getBatteryColor(soc)
  const fillPct = soc !== null ? Math.max(soc, 4) : 0
  const fillWidth = (fillPct / 100) * 34

  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border ${color.border} ${color.bg} shadow-lg ${color.glow} ${className}`}>

      {/* SVG Battery */}
      <div className="relative shrink-0">
        <svg viewBox="0 0 46 24" width="56" height="30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id={`bf-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color.start} />
              <stop offset="100%" stopColor={color.end} />
            </linearGradient>
            <linearGradient id={`bs-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.4" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`bc-${uid}`}>
              <rect x="3" y="3" width="34" height="18" rx="2" />
            </clipPath>
          </defs>

          {/* Body outline */}
          <rect x="1" y="1" width="38" height="22" rx="4" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
          {/* Terminal nub */}
          <rect x="40" y="8" width="4" height="8" rx="2" fill="white" fillOpacity="0.2" />
          {/* Dark track */}
          <rect x="3" y="3" width="34" height="18" rx="2" fill="white" fillOpacity="0.05" />

          {/* Colored fill */}
          {soc !== null ? (
            <rect
              x="3" y="3"
              width={fillWidth}
              height="18"
              rx="2"
              fill={`url(#bf-${uid})`}
              clipPath={`url(#bc-${uid})`}
              style={{ transition: 'width 1s ease-out' }}
            />
          ) : (
            /* Unknown SoC — pulsing full bar */
            <rect
              x="3" y="3" width="34" height="18" rx="2"
              fill={`url(#bf-${uid})`}
              clipPath={`url(#bc-${uid})`}
              opacity="0.5"
              className="animate-pulse"
            />
          )}

          {/* Shimmer sweep when charging */}
          {isCharging && soc !== null && (
            <rect
              x="3" y="3" width="34" height="18" rx="2"
              fill={`url(#bs-${uid})`}
              clipPath={`url(#bc-${uid})`}
              className="animate-shimmer"
            />
          )}

          {/* Bolt icon when charging */}
          {isCharging && (
            <path
              d="M22 5 L17 13h5l-1 6 6-9h-5z"
              fill="white"
              fillOpacity="0.9"
              filter="drop-shadow(0 0 2px rgba(255,255,255,0.6))"
            />
          )}
        </svg>
      </div>

      {/* Text info */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          {soc !== null ? (
            <>
              <span className={`text-2xl font-black leading-none ${color.text}`}>{Math.round(soc)}</span>
              <span className="text-sm font-bold text-gray-400">%</span>
            </>
          ) : (
            <div className={`flex items-center gap-1.5 ${color.text}`}>
              <Zap className="w-4 h-4 animate-pulse" fill="currentColor" />
              <span className="text-base font-black">DC</span>
            </div>
          )}
        </div>
        <p className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${color.text} opacity-80`}>
          {color.label}
        </p>
        {powerKw !== null && powerKw !== undefined && powerKw > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Zap className="w-3 h-3 text-yellow-400" fill="currentColor" />
            <span className="text-xs font-bold text-yellow-300">{powerKw.toFixed(1)} kW</span>
          </div>
        )}
      </div>

      {/* Animated bolts column when charging */}
      {isCharging && (
        <div className="flex flex-col gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <Zap
              key={i}
              className="w-3 h-3 text-yellow-400"
              fill="currentColor"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.3}s`, opacity: 0.6 + i * 0.2 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
