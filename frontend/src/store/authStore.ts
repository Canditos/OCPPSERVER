import { create } from 'zustand'
import type { UserProfile } from '../api'

interface AuthState {
  token: string | null
  user: UserProfile | null
  isAuthenticated: boolean
  isAdmin: boolean
  login: (token: string, user: UserProfile) => void
  logout: () => void
  setUser: (user: UserProfile) => void
}

const getStoredToken = () => localStorage.getItem('ocpp_auth_token')
const getStoredUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem('ocpp_auth_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const initialToken = getStoredToken()
  const initialUser = getStoredUser()

  return {
    token: initialToken,
    user: initialUser,
    isAuthenticated: !!initialToken && !!initialUser,
    isAdmin: initialUser?.role === 'admin',

    login: (token: string, user: UserProfile) => {
      localStorage.setItem('ocpp_auth_token', token)
      localStorage.setItem('ocpp_auth_user', JSON.stringify(user))
      set({
        token,
        user,
        isAuthenticated: true,
        isAdmin: user.role === 'admin',
      })
    },

    logout: () => {
      localStorage.removeItem('ocpp_auth_token')
      localStorage.removeItem('ocpp_auth_user')
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isAdmin: false,
      })
    },

    setUser: (user: UserProfile) => {
      localStorage.setItem('ocpp_auth_user', JSON.stringify(user))
      set({
        user,
        isAdmin: user.role === 'admin',
      })
    },
  }
})
