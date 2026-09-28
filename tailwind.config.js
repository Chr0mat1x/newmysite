/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ORBIT is monochrome: every token resolves to a point on the
        // black→white ramp, so layout classes read semantically but render grey.
        void: '#000000',
        abyss: '#0a0a0a',
        nebula: '#141414',
        pulse: '#d4d4d4',
        glow: '#f5f5f5',
        solar: '#e5e5e5',
        nova: '#ffffff',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(255,255,255,.4)',
        'glow-sm': '0 0 12px rgba(255,255,255,.35)',
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
