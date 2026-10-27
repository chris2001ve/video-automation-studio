/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#050d19', 900: '#07111f', 850: '#0a1729', 800: '#0d1d33', 700: '#132a47', 600: '#1c3a5f', 500: '#2a4f7a' },
        accent: { DEFAULT: '#22d3ee', strong: '#06b6d4', soft: '#67e8f9' },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'Consolas', 'monospace'] },
      boxShadow: { glow: '0 0 0 1px rgba(34,211,238,.35), 0 0 24px rgba(34,211,238,.25)' },
    },
  },
  plugins: [],
};
