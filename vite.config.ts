import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A GitHub Pages project page is served from /<repo>/, while a user site
// (owner.github.io) is served from /. CI passes the right value through
// VITE_BASE. Every other mode stays at the root.
//
// The `pages` mode is also built with blank VITE_SUPABASE_* vars (see
// .env.pages), which drops the app into the offline localStorage backend — the
// hosted demo needs no server to stay up.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? process.env.VITE_BASE || '/' : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    // Reaches the local Supabase stack through the same origin as the app.
    // Only needed when VITE_SUPABASE_URL is the relative `/sb`; external
    // Supabase projects are called directly and never hit this rule.
    proxy: {
      '/sb': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/sb/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/sb': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/sb/, ''),
      },
    },
  },
}))
