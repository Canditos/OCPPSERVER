import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const themeKey = 'ocpp-theme-mode'
const themeMode = window.localStorage.getItem(themeKey)
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const initialTheme = themeMode === 'light' || themeMode === 'dark'
  ? themeMode
  : prefersDark
    ? 'dark'
    : 'light'

document.documentElement.classList.toggle('dark', initialTheme === 'dark')
document.documentElement.style.colorScheme = initialTheme

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchInterval: 5000, staleTime: 2000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
