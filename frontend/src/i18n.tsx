import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type LanguageCode = 'pt' | 'en'

interface TranslationMap {
  [key: string]: string | TranslationMap
}

type TranslationValue = string | TranslationMap

const STORAGE_KEY = 'ocpp-language'

const translations = {
  pt: {
    common: {
      pt: 'PT',
      en: 'EN',
      cancel: 'Cancelar',
      start: 'Iniciar',
      update: 'Atualizar',
      online: 'online',
      charging: 'A carregar',
      available: 'Disponível',
      loading: 'A carregar...',
    },
    nav: {
      dashboard: 'Dashboard',
      transactions: 'Transações',
      commands: 'Comandos',
      smartCharging: 'Smart Charging',
      configuration: 'Configuração',
      authentication: 'White-list RFID',
      users: 'Utilizadores',
      myCharging: 'Minhas Cargas',
    },
    shell: {
      overview: 'Resumo Geral',
      globalTransactions: 'Transações Globais',
      ocppCommands: 'Comandos OCPP',
      smartCharging: 'Smart Charging',
      authentication: 'White-list RFID',
      configuration: 'Configuração',
      users: 'Gestão de Utilizadores',
      driverPortal: 'Portal do Condutor',
      station: 'Posto',
      logout: 'Sair',
      events: 'Eventos',
      admin: 'Administrador',
      driver: 'Condutor',
    },
    dashboard: {
      title: 'Central System',
      registeredEvents: '{{count}} eventos registados',
      chargers: 'Chargers',
      online: 'Online',
      onlineAvailability: '{{pct}}% disponibilidade',
      charging: 'A Carregar',
      activePower: '{{kw}} kW potência ativa total',
      available: 'Disponíveis',
      faults: 'Avarias',
      chargingStations: 'Postos de Carga (EVSE)',
      registered: '{{count}} registados',
      noChargers: 'Sem chargers ligados',
      connectStation: 'Liga o posto de carga a:',
      liveEvents: 'Eventos Live',
      fullLogViewer: 'Visualizador Completo de Logs & Payloads JSON',
      selectCharger: 'Selecionar Charger:',
      activeCharge: '⚡ CARGA ATIVA',
    },
    userPortal: {
      title: 'Portal do Condutor',
      activeUser: 'Utilizador Ativo',
      greeting: 'Olá, {{name}}. Acompanha os teus consumos e carregamentos.',
      passTitle: '@Canditos Pass',
      rfidLabel: 'Chave RFID / ID Tag',
      noAssignedTag: 'Nenhuma Tag Atribuída',
      startCharge: 'Iniciar Carga',
      totalConsumed: 'Total Consumido',
      totalChargedEnergy: 'Energia total carregada',
      chargingSessions: 'Sessões de Carga',
      totalUses: 'Total de utilizações',
      avgPerSession: 'Média p/ Sessão',
      avgConsumption: 'Consumo médio',
      activeCharging: 'Carregamento em Curso',
      stationConnector: 'Posto: {{cp}} · Tomada #{{connector}}',
      transaction: 'Transação #{{id}}',
      livePower: 'Potência Live',
      deliveredEnergy: 'Energia Entregue',
      startTime: 'Hora de Início',
      status: 'Estado',
      historyTitle: 'Histórico das Minhas Cargas',
      registeredCount: '{{count}} registadas',
      loadingHistory: 'A carregar histórico de transações…',
      noChargesYet: 'Nenhum carregamento registado ainda',
      noChargesDescription: 'Assim que utilizares a chave {{tag}} no posto, os detalhes aparecerão aqui.',
      table: {
        transaction: 'Transação',
        station: 'Posto',
        start: 'Início',
        end: 'Fim',
        duration: 'Duração',
        consumption: 'Consumo',
        status: 'Estado',
      },
      inProgress: 'Em curso…',
      chargingNow: 'A Carregar',
      completed: 'Concluído',
    },
    remoteStart: {
      title: 'Iniciar carga',
      subtitle: 'Usa o teu RFID',
      card: 'Cartão',
      noChargers: 'Sem carregadores disponíveis.',
      charger: 'Carregador',
      connector: 'Tomada',
      freeCount: '{{count}} livre',
      freeCountPlural: '{{count}} livres',
      startSuccess: 'Carga iniciada com sucesso.',
      startError: 'Não foi possível iniciar a carga.',
      connectorLabel: 'Tomada #{{id}}',
    },
    login: {
      activeSystem: 'Sistema Ativo · Mobilidade Elétrica Sustentável',
      heroTitle1: 'Carregamentos',
      heroTitle2: 'Simples & Partilhados',
      heroDescription: 'Plataforma central de gestão de postos de carregamento OCPP, telemetria em tempo real, registo de condutores e atribuição de chaves RFID.',
      rfidApproval: 'Aprovação RFID',
      emailAlerts: 'Avisos por Email',
      driverPortal: 'Portal do Condutor',
      protocol: 'Protocolo',
      version: 'Versão',
      status: 'Estado',
      login: 'Iniciar Sessão',
      register: 'Registar Condutor',
      welcomeBack: 'Bem-vindo de volta',
      accessPrompt: 'Introduz o teu email ou username para aceder',
      emailOrUsername: 'Email ou Nome de Utilizador',
      loginPlaceholder: 'ex: hugo@empresa.com ou admin',
      password: 'Palavra-passe',
      fillAllFields: 'Preenche todos os campos.',
      invalidCredentials: 'Credenciais inválidas ou conta pendente de aprovação.',
      firstName: 'Nome',
      lastName: 'Apelido',
      validName: 'Por favor introduz o Nome e o Apelido.',
      validEmail: 'Por favor introduz um email válido.',
      minPassword: 'A palavra-passe deve ter pelo menos 4 caracteres.',
      registerSuccess: 'Pedido de registo submetido com sucesso! A tua conta aguarda aprovação pelo Administrador.',
      registerError: 'Erro ao submeter pedido de registo.',
      createAccount: 'Criar conta de condutor',
      registerPrompt: 'Pede acesso à plataforma e uma chave RFID.',
      email: 'Email',
      requestedRfid: 'RFID pretendido (opcional)',
      requestedRfidPlaceholder: 'ex: VERSICHARGE_TAG',
      submitRegister: 'Enviar pedido',
      submitLogin: 'Entrar',
    },
  },
  en: {
    common: {
      pt: 'PT',
      en: 'EN',
      cancel: 'Cancel',
      start: 'Start',
      update: 'Refresh',
      online: 'online',
      charging: 'Charging',
      available: 'Available',
      loading: 'Loading...',
    },
    nav: {
      dashboard: 'Dashboard',
      transactions: 'Transactions',
      commands: 'Commands',
      smartCharging: 'Smart Charging',
      configuration: 'Configuration',
      authentication: 'RFID whitelist',
      users: 'Users',
      myCharging: 'My Charging',
    },
    shell: {
      overview: 'Overview',
      globalTransactions: 'Global Transactions',
      ocppCommands: 'OCPP Commands',
      smartCharging: 'Smart Charging',
      authentication: 'RFID whitelist',
      configuration: 'Configuration',
      users: 'User Management',
      driverPortal: 'Driver Portal',
      station: 'Station',
      logout: 'Logout',
      events: 'Events',
      admin: 'Administrator',
      driver: 'Driver',
    },
    dashboard: {
      title: 'Central System',
      registeredEvents: '{{count}} events logged',
      chargers: 'Chargers',
      online: 'Online',
      onlineAvailability: '{{pct}}% availability',
      charging: 'Charging',
      activePower: '{{kw}} kW total active power',
      available: 'Available',
      faults: 'Faults',
      chargingStations: 'Charging Stations (EVSE)',
      registered: '{{count}} registered',
      noChargers: 'No chargers connected',
      connectStation: 'Connect the charging station to:',
      liveEvents: 'Live Events',
      fullLogViewer: 'Full Log & JSON Payload Viewer',
      selectCharger: 'Select Charger:',
      activeCharge: '⚡ ACTIVE CHARGING',
    },
    userPortal: {
      title: 'Driver Portal',
      activeUser: 'Active User',
      greeting: 'Hello, {{name}}. Track your charging sessions and consumption.',
      passTitle: '@Canditos Pass',
      rfidLabel: 'RFID Key / ID Tag',
      noAssignedTag: 'No tag assigned',
      startCharge: 'Start Charging',
      totalConsumed: 'Total Consumed',
      totalChargedEnergy: 'Total charged energy',
      chargingSessions: 'Charging Sessions',
      totalUses: 'Total sessions',
      avgPerSession: 'Avg / Session',
      avgConsumption: 'Average consumption',
      activeCharging: 'Charging in Progress',
      stationConnector: 'Station: {{cp}} · Connector #{{connector}}',
      transaction: 'Transaction #{{id}}',
      livePower: 'Live Power',
      deliveredEnergy: 'Delivered Energy',
      startTime: 'Start Time',
      status: 'Status',
      historyTitle: 'My Charging History',
      registeredCount: '{{count}} entries',
      loadingHistory: 'Loading transaction history…',
      noChargesYet: 'No charging sessions recorded yet',
      noChargesDescription: 'As soon as you use key {{tag}} at a station, the details will appear here.',
      table: {
        transaction: 'Transaction',
        station: 'Station',
        start: 'Start',
        end: 'End',
        duration: 'Duration',
        consumption: 'Consumption',
        status: 'Status',
      },
      inProgress: 'In progress…',
      chargingNow: 'Charging',
      completed: 'Completed',
    },
    remoteStart: {
      title: 'Start charging',
      subtitle: 'Use your RFID',
      card: 'Card',
      noChargers: 'No chargers available.',
      charger: 'Charger',
      connector: 'Connector',
      freeCount: '{{count}} free',
      freeCountPlural: '{{count}} free',
      startSuccess: 'Charging started successfully.',
      startError: 'Could not start charging.',
      connectorLabel: 'Connector #{{id}}',
    },
    login: {
      activeSystem: 'Active System · Sustainable Electric Mobility',
      heroTitle1: 'Charging',
      heroTitle2: 'Simple & Shared',
      heroDescription: 'Central OCPP charging platform with live telemetry, driver registration and RFID key assignment.',
      rfidApproval: 'RFID Approval',
      emailAlerts: 'Email Alerts',
      driverPortal: 'Driver Portal',
      protocol: 'Protocol',
      version: 'Version',
      status: 'Status',
      login: 'Sign In',
      register: 'Register Driver',
      welcomeBack: 'Welcome back',
      accessPrompt: 'Enter your email or username to continue',
      emailOrUsername: 'Email or Username',
      loginPlaceholder: 'e.g. hugo@company.com or admin',
      password: 'Password',
      fillAllFields: 'Fill in all fields.',
      invalidCredentials: 'Invalid credentials or account pending approval.',
      firstName: 'First name',
      lastName: 'Last name',
      validName: 'Please enter first and last name.',
      validEmail: 'Please enter a valid email.',
      minPassword: 'Password must be at least 4 characters long.',
      registerSuccess: 'Registration request submitted successfully! Your account is waiting for administrator approval.',
      registerError: 'Error submitting registration request.',
      createAccount: 'Create driver account',
      registerPrompt: 'Request access to the platform and an RFID key.',
      email: 'Email',
      requestedRfid: 'Requested RFID (optional)',
      requestedRfidPlaceholder: 'e.g. VERSICHARGE_TAG',
      submitRegister: 'Submit request',
      submitLogin: 'Sign in',
    },
  },
} as const

type TranslationTree = typeof translations.pt

function resolveKey(language: LanguageCode, key: string): string {
  const segments = key.split('.')
  let value: TranslationValue = translations[language]
  for (const segment of segments) {
    if (typeof value !== 'object' || value === null || !(segment in value)) {
      value = translations.pt
      for (const fallbackSegment of segments) {
        if (typeof value !== 'object' || value === null || !(fallbackSegment in value)) {
          return key
        }
        value = value[fallbackSegment as keyof typeof value]
      }
      break
    }
    value = value[segment as keyof typeof value]
  }
  return typeof value === 'string' ? value : key
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
    template
  )
}

interface I18nContextValue {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'en' ? 'en' : 'pt'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, vars) => interpolate(resolveKey(language, key), vars),
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
