import React from 'react'
import { Plug, Zap, AlertTriangle, Clock, XCircle, WrenchIcon } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  connectorId: number
  status: string
  errorCode?: string
}

const STATUS_CONFIG: Record<string, {
  label: string
  bg: string
  text: string
  border: string
  icon: React.ReactNode
  ping?: string
  glow?: string
}> = {
  Available: {
    label: 'Disponível',
    bg:     'bg-emerald-500/12',
    text:   'text-emerald-400',
    border: 'border-emerald-500/25',
    icon:   <Plug className="w-3 h-3" />,
  },
  Charging: {
    label: 'A carregar',
    bg:     'bg-blue-500/15',
    text:   'text-blue-400',
    border: 'border-blue-500/35',
    icon:   <Zap className="w-3 h-3" fill="currentColor" />,
    ping:   'bg-blue-400',
    glow:   'shadow-[0_0_10px_rgba(59,130,246,0.4)]',
  },
  Preparing: {
    label: 'A preparar',
    bg:     'bg-amber-500/12',
    text:   'text-amber-400',
    border: 'border-amber-500/25',
    icon:   <Clock className="w-3 h-3" />,
    ping:   'bg-amber-400',
  },
  Finishing: {
    label: 'A finalizar',
    bg:     'bg-violet-500/12',
    text:   'text-violet-400',
    border: 'border-violet-500/25',
    icon:   <Clock className="w-3 h-3" />,
  },
  SuspendedEV: {
    label: 'Suspenso EV',
    bg:     'bg-orange-500/12',
    text:   'text-orange-400',
    border: 'border-orange-500/25',
    icon:   <Clock className="w-3 h-3" />,
  },
  SuspendedEVSE: {
    label: 'Suspenso EVSE',
    bg:     'bg-orange-500/12',
    text:   'text-orange-400',
    border: 'border-orange-500/25',
    icon:   <Clock className="w-3 h-3" />,
  },
  Faulted: {
    label: 'Avaria',
    bg:     'bg-red-500/15',
    text:   'text-red-400',
    border: 'border-red-500/35',
    icon:   <AlertTriangle className="w-3 h-3" />,
    ping:   'bg-red-400',
    glow:   'shadow-[0_0_10px_rgba(239,68,68,0.35)]',
  },
  Unavailable: {
    label: 'Indisponível',
    bg:     'bg-gray-700/30',
    text:   'text-gray-500',
    border: 'border-gray-700/30',
    icon:   <XCircle className="w-3 h-3" />,
  },
  Reserved: {
    label: 'Reservado',
    bg:     'bg-purple-500/12',
    text:   'text-purple-400',
    border: 'border-purple-500/25',
    icon:   <Clock className="w-3 h-3" />,
  },
}

export function ConnectorBadge({ connectorId, status, errorCode }: Props) {
  const { t } = useI18n()
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    bg: 'bg-gray-700/30', text: 'text-gray-500', border: 'border-gray-700/30',
    icon: <WrenchIcon className="w-3 h-3" />,
  }
  const translatedLabel = ({
    Available: t('connector.available'),
    Charging: t('connector.charging'),
    Preparing: t('connector.preparing'),
    Finishing: t('connector.finishing'),
    SuspendedEV: t('connector.suspendedEv'),
    SuspendedEVSE: t('connector.suspendedEvse'),
    Faulted: t('connector.faulted'),
    Unavailable: t('connector.unavailable'),
    Reserved: t('connector.reserved'),
  } as Record<string, string>)[status] ?? cfg.label
 
  return (
    <div className={`relative inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.glow ?? ''}`}>
      {/* ping ring for active states */}
      {cfg.ping && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.ping}`} />
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${cfg.ping}`} />
        </span>
      )}

      <span className={cfg.ping ? '' : 'shrink-0'}>{cfg.icon}</span>

      <span>
        <span className="text-gray-500 mr-1">#{connectorId}</span>
        {translatedLabel}
      </span>

      {errorCode && errorCode !== 'NoError' && (
        <span className="ml-1 text-red-400/70 font-mono text-[10px]">{errorCode}</span>
      )}
    </div>
  )
}
