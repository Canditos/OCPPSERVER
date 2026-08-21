import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Dashboard } from './pages/Dashboard'
import { ChargerDetail } from './pages/ChargerDetail'
import { Transactions } from './pages/Transactions'
import { Commands } from './pages/Commands'
import { Configuration } from './pages/Configuration'
import Authentication from './pages/Authentication'
import { useOcppEvents } from './hooks/useOcppEvents'

function AppInner() {
  useOcppEvents()
  return (
    <Routes>
      <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
      <Route path="/chargers/:id" element={<AppShell><ChargerDetail /></AppShell>} />
      <Route path="/transactions" element={<AppShell><Transactions /></AppShell>} />
      <Route path="/commands" element={<AppShell><Commands /></AppShell>} />
      <Route path="/configuration" element={<AppShell><Configuration /></AppShell>} />
      <Route path="/authentication" element={<AppShell><Authentication /></AppShell>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
