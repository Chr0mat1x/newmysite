/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#05030c',
        abyss: '#0a0618',
        nebula: '#150a2e',
        pulse: '#a06bff',
        glow: '#7de3ff',
        solar: '#ffcf6b',
        nova: '#ff6bd6',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(160,107,255,.45)',
        'glow-sm': '0 0 12px rgba(125,227,255,.4)',
      },
      keyframes: {
        drift: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        breathe: {
          '0%,100%': { opacity: '.55' },
          '50%': { opacity: '1' },
        },
        sweep: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
      animation: {
        drift: 'drift 6s ease-in-out infinite',
        breathe: 'breathe 4s ease-in-out infinite',
        sweep: 'sweep 8s linear infinite',
      },
    },
  },
  plugins: [],
}
