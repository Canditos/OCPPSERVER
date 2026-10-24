import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

function ErrorFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 dark:bg-gray-950 text-slate-800 dark:text-gray-100 text-center">
      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
        <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-2">
        {t('errorBoundary.title')}
      </h2>
      <p className="text-sm text-slate-600 dark:text-gray-400 max-w-md mb-3">
        {t('errorBoundary.subtitle')}
      </p>
      {error?.message && (
        <div className="mb-6 p-3 rounded-xl bg-slate-100 dark:bg-gray-900 border border-red-500/30 text-xs font-mono text-red-600 dark:text-red-300 max-w-lg truncate">
          {error.message}
        </div>
      )}
      <button
        onClick={onReset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-all"
      >
        <RefreshCw className="w-4 h-4" />
        {t('errorBoundary.reloadBtn')}
      </button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in React Component:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}

