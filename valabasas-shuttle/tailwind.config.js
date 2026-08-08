/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#05080b',
          800: '#0b0f14',
          700: '#131a22',
          600: '#1b242f',
          500: '#26323f',
          400: '#3b4a5a',
        },
        brand: {
          400: '#7dd3fc',
          500: '#38bdf8',
          600: '#0ea5e9',
        },
      },
      fontSize: {
        huge: ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      spacing: {
        tap: '3.5rem', // 56px minimum tap target
      },
    },
  },
  plugins: [],
}
