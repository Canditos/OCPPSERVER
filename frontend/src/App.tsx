import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { ChargerDetail } from './pages/ChargerDetail'
import { Transactions } from './pages/Transactions'
import { Commands } from './pages/Commands'
import { Configuration } from './pages/Configuration'
import Authentication from './pages/Authentication'
import { useOcppEvents } from './hooks/useOcppEvents'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 max-w-screen-2xl">
        {children}
      </main>
    </div>
  )
}

function AppInner() {
  useOcppEvents()
  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/chargers/:id" element={<Layout><ChargerDetail /></Layout>} />
      <Route path="/transactions" element={<Layout><Transactions /></Layout>} />
      <Route path="/commands" element={<Layout><Commands /></Layout>} />
      <Route path="/configuration" element={<Layout><Configuration /></Layout>} />
      <Route path="/authentication" element={<Layout><Authentication /></Layout>} />
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
