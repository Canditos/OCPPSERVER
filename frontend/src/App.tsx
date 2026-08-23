import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Dashboard } from './pages/Dashboard'
import { ChargerDetail } from './pages/ChargerDetail'
import { Transactions } from './pages/Transactions'
import { Commands } from './pages/Commands'
import { Configuration } from './pages/Configuration'
import Authentication from './pages/Authentication'
import { SmartCharging } from './pages/SmartCharging'
import { UsersManagement } from './pages/UsersManagement'
import { UserPortal } from './pages/UserPortal'
import { Login } from './pages/Login'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useOcppEvents } from './hooks/useOcppEvents'

function AppInner() {
  useOcppEvents()
  return (
    <Routes>
      {/* Public Login Route */}
      <Route path="/login" element={<Login />} />

      {/* Regular User & Admin Portal */}
      <Route
        path="/my-charging"
        element={
          <ProtectedRoute>
            <AppShell>
              <UserPortal />
            </AppShell>
          </ProtectedRoute>
        }
      />

      {/* Admin Only Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <Dashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chargers/:id"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <ChargerDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <Transactions />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/commands"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <Commands />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/smart-charging"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <SmartCharging />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuration"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <Configuration />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/authentication"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <Authentication />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppShell>
              <UsersManagement />
            </AppShell>
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
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
