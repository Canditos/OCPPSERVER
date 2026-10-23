import React from 'react'
import { MeterChart } from '../../MeterChart'
import { AvailabilityMonitor } from '../../AvailabilityMonitor'
import type { Charger } from '../../../types'

interface TelemetryTabProps {
  charger: Charger
  selectedConnectorId: number
}

export function TelemetryTab({ charger, selectedConnectorId }: TelemetryTabProps) {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Availability Monitor */}
      <AvailabilityMonitor chargePointId={charger.charge_point_id} />

      {/* Meter Chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">MeterValues</h3>
          <span className="text-xs text-slate-400 dark:text-gray-500 font-mono">Conector #{selectedConnectorId}</span>
        </div>
        <MeterChart
          key={`${charger.charge_point_id}-${selectedConnectorId}`}
          cpId={charger.charge_point_id}
          connectorId={selectedConnectorId}
        />
      </div>
    </div>
  )
}
