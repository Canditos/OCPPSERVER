import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
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
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-950 text-gray-100 text-center">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-100 mb-2">Ocorreu um erro temporário no ecrã</h2>
          <p className="text-sm text-gray-400 max-w-md mb-6">
            A aplicação detetou uma falha e recuperou a sessão em segurança sem desligar o servidor.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Recarregar Dashboard
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
