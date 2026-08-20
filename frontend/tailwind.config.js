/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        soc: {
          bg: '#020817',
          page: '#030B16',
          sidebar: '#050B16',
          header: '#050B16',
          card: '#071426',
          secondaryCard: '#09182A',
          elevated: '#0B1C31',
          cardHover: '#0E223B',
          border: '#17304A',
          borderLight: '#1C3B59',
          borderSubtle: 'rgba(28, 59, 89, 0.4)',
          accent: '#1683FF',
          accentBlue: '#2196FF',
          cyan: '#00C6FF',
          ai: '#8B5CF6',
          aiDark: '#7C3AED',
          textPrimary: '#F8FAFC',
          textSecondary: '#94A3B8',
          textMuted: '#64748B',
        },
        severity: {
          critical: '#EF4444',
          high: '#F97316',
          medium: '#F59E0B',
          low: '#3B82F6',
          info: '#64748B',
          success: '#22C55E',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'soc-card': '0 4px 16px -2px rgba(0, 0, 0, 0.5)',
        'glow-blue': '0 0 16px rgba(22, 131, 255, 0.25)',
        'glow-cyan': '0 0 16px rgba(0, 198, 255, 0.25)',
        'glow-purple': '0 0 16px rgba(139, 92, 246, 0.25)',
        'glow-red': '0 0 16px rgba(239, 68, 68, 0.25)',
        'glow-amber': '0 0 16px rgba(245, 158, 11, 0.25)',
        'glow-emerald': '0 0 16px rgba(34, 197, 94, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
