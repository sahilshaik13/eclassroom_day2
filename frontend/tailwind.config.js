/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fdf8e7',
          100: '#f9edbe',
          200: '#f3d98a',
          300: '#ebc355',
          400: '#e3ae2a',
          DEFAULT: '#D4AF37',
          faint: '#fdf8e7',
          dark: '#AA8C2E',
          600: '#AA8C2E',
          700: '#7d6620',
          800: '#534413',
          900: '#2a220a',
        },
        slate: { 950: '#0c1221' },

        // Semantic tokens — used as text-ink, bg-surface, border-border etc.
        ink: {
          DEFAULT: '#1a1f2e',
          muted: '#4a5568',
          faint: '#718096',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f8f9fc',
        },
        border: {
          DEFAULT: '#e8eaf0',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease forwards',
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-in': 'slideIn 0.35s ease forwards',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(-12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pulseDot: { '0%,100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.4)', opacity: '0.6' } },
      },
      boxShadow: {
        'gold': '0 0 0 3px rgba(212,175,55,0.25)',
        'card': '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
        'card-lg': '0 4px 6px rgba(0,0,0,0.05), 0 20px 40px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}