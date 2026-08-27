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
  subtext: string
  border: string
  bg: string
  label: string
}

function getBatteryColor(soc: number | null): ColorConfig {
  if (soc === null) return {
    start: '#0284c7', end: '#2563eb',
    glow: 'shadow-blue-500/10 dark:shadow-blue-500/40',
    text: 'text-blue-700 dark:text-blue-400',
    subtext: 'text-blue-900 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-500/40',
    bg: 'bg-blue-50/90 dark:bg-blue-500/10',
    label: 'Carga Rápida DC',
  }
  if (soc < 20) return {
    start: '#dc2626', end: '#f43f5e',
    glow: 'shadow-red-500/10 dark:shadow-red-500/40',
    text: 'text-red-700 dark:text-red-400',
    subtext: 'text-red-900 dark:text-red-300',
    border: 'border-red-200 dark:border-red-500/40',
    bg: 'bg-red-50/90 dark:bg-red-500/10',
    label: 'Bateria Crítica',
  }
  if (soc < 50) return {
    start: '#d97706', end: '#f59e0b',
    glow: 'shadow-amber-500/10 dark:shadow-amber-500/40',
    text: 'text-amber-700 dark:text-amber-400',
    subtext: 'text-amber-900 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-500/40',
    bg: 'bg-amber-50/90 dark:bg-amber-500/10',
    label: 'Carga Baixa',
  }
  if (soc < 80) return {
    start: '#059669', end: '#10b981',
    glow: 'shadow-emerald-500/10 dark:shadow-emerald-500/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    subtext: 'text-emerald-900 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-500/40',
    bg: 'bg-emerald-50/90 dark:bg-emerald-500/10',
    label: 'A Carregar',
  }
  return {
    start: '#0284c7', end: '#2563eb',
    glow: 'shadow-cyan-500/10 dark:shadow-cyan-400/40',
    text: 'text-cyan-700 dark:text-cyan-400',
    subtext: 'text-cyan-900 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-400/40',
    bg: 'bg-cyan-50/90 dark:bg-cyan-500/10',
    label: 'Bateria Cheia',
  }
}

export function BatteryIndicator({ soc, isCharging, powerKw, className = '' }: BatteryIndicatorProps) {
  const uid = useId().replace(/:/g, '')
  
  // Handle NaN or invalid soc values
  const validSoC = soc !== null && !isNaN(soc) ? soc : null
  const color = getBatteryColor(validSoC)
  const fillPct = validSoC !== null ? Math.max(validSoC, 4) : 0
  const fillWidth = (fillPct / 100) * 34

  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border ${color.border} ${color.bg} shadow-md ${color.glow} ${className}`}>

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
          <rect x="1" y="1" width="38" height="22" rx="4" strokeWidth="1.5" className="stroke-slate-400/80 dark:stroke-white/20" />
          {/* Terminal nub */}
          <rect x="40" y="8" width="4" height="8" rx="2" className="fill-slate-400/80 dark:fill-white/20" />
          {/* Dark track */}
          <rect x="3" y="3" width="34" height="18" rx="2" className="fill-slate-900/5 dark:fill-white/5" />

          {/* Colored fill */}
          {validSoC !== null ? (
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
          {isCharging && validSoC !== null && (
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
              fillOpacity="0.95"
              filter="drop-shadow(0 0 2px rgba(0,0,0,0.4))"
            />
          )}
        </svg>
      </div>

      {/* Text info */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          {validSoC !== null ? (
            <>
              <span className={`text-2xl font-black leading-none ${color.text}`}>{Math.round(validSoC)}</span>
              <span className="text-sm font-bold text-slate-500 dark:text-gray-400">%</span>
            </>
          ) : (
            <div className={`flex items-center gap-1.5 ${color.text}`}>
              <Zap className="w-4 h-4 animate-pulse" fill="currentColor" />
              <span className="text-base font-black">DC</span>
            </div>
          )}
        </div>
        <p className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${color.subtext}`}>
          {color.label}
        </p>
        {powerKw !== null && powerKw !== undefined && powerKw > 0 && (
          <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 dark:bg-yellow-400/10 border border-amber-500/25 dark:border-yellow-400/20 w-fit">
            <Zap className="w-3 h-3 text-amber-600 dark:text-yellow-400" fill="currentColor" />
            <span className="text-xs font-bold text-amber-800 dark:text-yellow-300 font-mono">{powerKw.toFixed(1)} kW</span>
          </div>
        )}
      </div>

      {/* Animated bolts column when charging */}
      {isCharging && (
        <div className="flex flex-col gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <Zap
              key={i}
              className="w-3 h-3 text-amber-500 dark:text-yellow-400"
              fill="currentColor"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.3}s`, opacity: 0.7 + i * 0.15 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
