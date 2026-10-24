import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, BarChart3, ShieldCheck, Layers, Award, MessageSquare
} from 'lucide-react'

import { api, MeterKeyData } from '../api'
import { useChargerStore } from '../store/chargerStore'
import { useI18n } from '../i18n'
import type { Charger, OcppMessage, Certificate } from '../types'

import { ChargerHeader } from '../components/charger-detail/ChargerHeader'
import { ChargerInfoSidebar } from '../components/charger-detail/ChargerInfoSidebar'
import { TelemetryTab } from '../components/charger-detail/tabs/TelemetryTab'
import { MetersTab } from '../components/charger-detail/tabs/MetersTab'
import { SecurityTab } from '../components/charger-detail/tabs/SecurityTab'
import { OcppLogsTab } from '../components/charger-detail/tabs/OcppLogsTab'
import { DeviceModelTab } from '../components/DeviceModelTab'

export function ChargerDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const live = useChargerStore((s) => s.liveState[id ?? ''])

  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<'telemetry' | 'meters' | 'devicemodel' | 'security' | 'logs'>('telemetry')

  // Main Charger Query
  const { data: charger } = useQuery<Charger>({
    queryKey: ['charger', id],
    queryFn: () => api.getCharger(id!),
    enabled: Boolean(id),
    refetchInterval: 10000,
  })

  // Meter Keys Query (Eichrecht / OCMF)
  const { data: meterKeys = [], refetch: refetchMeterKeys } = useQuery<MeterKeyData[]>({
    queryKey: ['meterKeys', id],
    queryFn: () => api.getMeterKeys(id!),
    enabled: Boolean(id),
  })

  // X.509 Certificates Query
  const { data: certs = [], refetch: refetchCerts } = useQuery<Certificate[]>({
    queryKey: ['certificates', id],
    queryFn: () => api.getChargerCertificates(id!),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  // OCPP Messages Query
  const { data: messages = [] } = useQuery<OcppMessage[]>({
    queryKey: ['messages', id],
    queryFn: () => api.getMessages(id!, 1000),
    enabled: Boolean(id),
    refetchInterval: 5000,
  })

  // Success Rates Query
  const { data: successRates = {} } = useQuery({
    queryKey: ['successRate', id],
    queryFn: () => api.getChargingSuccessRate(id!),
    enabled: Boolean(id),
    refetchInterval: 30000,
  })

  const refreshAllData = () => {
    queryClient.invalidateQueries({ queryKey: ['charger', id] })
    queryClient.invalidateQueries({ queryKey: ['meterKeys', id] })
    queryClient.invalidateQueries({ queryKey: ['certificates', id] })
  }

  const isOnline = live?.isOnline ?? charger?.is_online ?? false

  // Compute connectors from charger and live state
  const connectors = (() => {
    const connectorMap = new Map<number, {
      connector_id: number
      status: string
      error_code?: string | null
      updated_at?: string | null
    }>()

    for (const connector of charger?.connectors || []) {
      connectorMap.set(connector.connector_id, {
        connector_id: connector.connector_id,
        status: connector.status,
        error_code: connector.error_code ?? null,
        updated_at: connector.updated_at ?? null,
      })
    }

    for (const [cid, connector] of Object.entries(live?.connectors || {})) {
      connectorMap.set(Number(cid), {
        connector_id: Number(cid),
        status: connector.status,
        error_code: connector.errorCode ?? null,
        updated_at: null,
      })
    }

    if (connectorMap.size === 0) {
      return [{
        connector_id: 1,
        status: isOnline ? (charger?.status || 'Available') : 'Offline',
        error_code: null,
        updated_at: null
      }]
    }

    return Array.from(connectorMap.values()).sort((a, b) => a.connector_id - b.connector_id)
  })()

  const isCharging = connectors.some((c) => c.status === 'Charging')

  const FRIENDLY_MEASURANDS: Record<string, string> = {
    'Voltage': 'Tensão',
    'Power.Active.Import': 'Potência Ativa',
    'Power.Offered': 'Potência Oferecida',
    'Current.Import': 'Corrente',
    'Current.Offered': 'Corrente Oferecida',
    'Energy.Active.Import.Register': 'Energia Total',
    'SoC': 'Bateria (SoC)',
    'Temperature': 'Temperatura',
  }

  const liveMeters = live?.meters
    ? Object.entries(live.meters).map(([measurand, data]) => ({
        key: measurand,
        label: FRIENDLY_MEASURANDS[measurand] || measurand,
        value: typeof data.value === 'number' ? data.value.toLocaleString('pt-PT', { maximumFractionDigits: 2 }) : data.value,
        unit: data.unit || '',
        timestamp: data.timestamp,
      }))
    : []

  const selectedConnector = connectors.find((c) => c.connector_id === selectedConnectorId)
  const isSelectedConnectorActive = selectedConnector && (
    selectedConnector.status === 'Charging' ||
    selectedConnector.status === 'SuspendedEV' ||
    selectedConnector.status === 'SuspendedEVSE'
  )
  const displayedLiveMeters = isSelectedConnectorActive ? liveMeters : []

  if (!charger) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 text-gray-500 animate-pulse-slow" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* 1. Header with metadata and Quick Operations */}
      <ChargerHeader
        charger={charger}
        isOnline={isOnline}
        isCharging={isCharging}
        selectedConnectorId={selectedConnectorId}
        onSelectTab={setActiveTab}
        onRefreshData={refreshAllData}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 2. Left Column: Hardware info, Security profile, Connectors selector, Live readings */}
        <ChargerInfoSidebar
          charger={charger}
          isOnline={isOnline}
          connectors={connectors}
          selectedConnectorId={selectedConnectorId}
          onSelectConnector={setSelectedConnectorId}
          successRates={successRates}
          displayedLiveMeters={displayedLiveMeters}
          meterKeysCount={meterKeys.length}
          onOpenMetersTab={() => setActiveTab('meters')}
          onRefreshCharger={refreshAllData}
        />

        {/* 3. Right Column: Tab Navigation and Active Content */}
        <div className="xl:col-span-2 space-y-5">
          {/* Tab Navigation Bar */}
          <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-gray-900/90 border border-slate-200 dark:border-white/15 rounded-2xl shadow-md dark:shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border border-blue-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <BarChart3 className={`w-4 h-4 ${activeTab === 'telemetry' ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`} />
              <span>{t('chargerDetail.tabs.telemetry')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('meters')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'meters'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-purple-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <ShieldCheck className={`w-4 h-4 ${activeTab === 'meters' ? 'text-white' : 'text-purple-500 dark:text-purple-400'}`} />
              <span>{t('chargerDetail.tabs.meters')}</span>
              {meterKeys.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'meters' ? 'bg-white/20 text-white' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}>
                  {meterKeys.length}
                </span>
              )}
            </button>

            {charger.ocpp_version === '2.0.1' && (
              <button
                type="button"
                onClick={() => setActiveTab('devicemodel')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'devicemodel'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 border border-indigo-400/50 scale-[1.01]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
                }`}
              >
                <Layers className={`w-4 h-4 ${activeTab === 'devicemodel' ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
                <span>{t('chargerDetail.tabs.deviceModel')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-purple-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <Award className={`w-4 h-4 ${activeTab === 'security' ? 'text-white' : 'text-purple-500 dark:text-purple-400'}`} />
              <span>{t('chargerDetail.tabs.certificates')}</span>
              {certs.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'security' ? 'bg-white/20 text-white' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}>
                  {certs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/50 scale-[1.01]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/5'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${activeTab === 'logs' ? 'text-white' : 'text-emerald-500 dark:text-emerald-400'}`} />
              <span>{t('chargerDetail.tabs.ocppLog')}</span>
              {messages.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'logs' ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {messages.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab 1: Telemetry & Monitoring */}
          {activeTab === 'telemetry' && (
            <TelemetryTab
              charger={charger}
              selectedConnectorId={selectedConnectorId}
            />
          )}

          {/* Tab 2: Eichrecht & Medidores (LEM DCBM / Bauer) */}
          {activeTab === 'meters' && (
            <MetersTab
              chargerId={charger.charge_point_id}
              isOnline={isOnline}
              isEichrechtCompliant={Boolean(charger.is_eichrecht_compliant)}
              meterKeys={meterKeys}
              onRefreshMeterKeys={refetchMeterKeys}
              onRefreshCharger={refreshAllData}
            />
          )}

          {/* Tab 3: Device Model (OCPP 2.0.1) */}
          {activeTab === 'devicemodel' && charger.ocpp_version === '2.0.1' && (
            <div className="space-y-4 animate-fade-in">
              <DeviceModelTab chargerId={charger.charge_point_id} isOnline={isOnline} />
            </div>
          )}

          {/* Tab 4: Security & mTLS Certificates */}
          {activeTab === 'security' && (
            <SecurityTab
              charger={charger}
              isOnline={isOnline}
              certs={certs}
              onRefreshCerts={refetchCerts}
            />
          )}

          {/* Tab 5: OCPP Message Logs & Events */}
          {activeTab === 'logs' && (
            <OcppLogsTab
              cpId={charger.charge_point_id}
              messages={messages}
            />
          )}
        </div>
      </div>
    </div>
  )
}
