/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#16181d', 2: '#3b3f47' },
        canvas: '#f7f6f3',
        accent: { DEFAULT: '#0f766e', ink: '#0b5650', soft: '#e5f2f0', bright: '#34d3c2' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,24,29,.04), 0 1px 1px rgba(22,24,29,.03)',
        lift: '0 1px 2px rgba(22,24,29,.06), 0 12px 32px -8px rgba(22,24,29,.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .2s ease both' },
    },
  },
  plugins: [],
};
