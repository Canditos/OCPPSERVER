/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      keyframes: {
        'pulse-slow': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.4' } },
        'spin-slow':  { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        'glow-blue': {
          '0%,100%': { boxShadow: '0 0 8px 1px rgba(59,130,246,0.35)' },
          '50%':      { boxShadow: '0 0 22px 4px rgba(59,130,246,0.65)' },
        },
        'glow-emerald': {
          '0%,100%': { boxShadow: '0 0 8px 1px rgba(16,185,129,0.35)' },
          '50%':      { boxShadow: '0 0 22px 4px rgba(16,185,129,0.65)' },
        },
        'glow-red': {
          '0%,100%': { boxShadow: '0 0 8px 1px rgba(239,68,68,0.35)' },
          '50%':      { boxShadow: '0 0 22px 4px rgba(239,68,68,0.65)' },
        },
        'ring-ping': {
          '0%':    { transform: 'scale(1)',   opacity: '0.7' },
          '100%':  { transform: 'scale(2.4)', opacity: '0' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'fade-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'float': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-4px)' },
        },
        'charge-bolt': {
          '0%,100%': { opacity: '1',   transform: 'scale(1)   translateY(0)' },
          '25%':     { opacity: '0.6', transform: 'scale(0.9) translateY(1px)' },
          '75%':     { opacity: '0.8', transform: 'scale(1.1) translateY(-1px)' },
        },
        'counter-in': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',     opacity: '1' },
        },
        'gradient-x': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%':     { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'pulse-slow':    'pulse-slow 2.5s ease-in-out infinite',
        'spin-slow':     'spin-slow 8s linear infinite',
        'glow-blue':     'glow-blue 2s ease-in-out infinite',
        'glow-emerald':  'glow-emerald 2s ease-in-out infinite',
        'glow-red':      'glow-red 1.5s ease-in-out infinite',
        'ring-ping':     'ring-ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
        'slide-in':      'slide-in-right 0.25s ease-out both',
        'fade-up':       'fade-up 0.3s ease-out both',
        'shimmer':       'shimmer 2.5s linear infinite',
        'float':         'float 3s ease-in-out infinite',
        'charge-bolt':   'charge-bolt 1s ease-in-out infinite',
        'gradient-x':    'gradient-x 4s ease infinite',
      },
      backgroundSize: {
        '200%': '200%',
        '400%': '400%',
      },
    },
  },
  plugins: [],
}
