// Backend URL — override via VITE_API_URL env var for production
export const API_BASE  = import.meta.env.VITE_API_URL  ?? ''
export const WS_BASE   = import.meta.env.VITE_WS_URL   ?? ''
