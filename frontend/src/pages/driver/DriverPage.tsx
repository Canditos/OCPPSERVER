import React, { useState } from 'react'
import { DriverShell, type DriverTab } from '../../components/driver/DriverShell'
import { ActiveChargeTab } from './ActiveChargeTab'
import { StationsTab } from './StationsTab'
import { PassHistoryTab } from './PassHistoryTab'

export function DriverPage() {
  const [activeTab, setActiveTab] = useState<DriverTab>('charge')

  return (
    <DriverShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'charge' && <ActiveChargeTab />}
      {activeTab === 'stations' && <StationsTab />}
      {activeTab === 'pass' && <PassHistoryTab />}
    </DriverShell>
  )
}
