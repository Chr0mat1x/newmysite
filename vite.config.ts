import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
      // the local mail catcher (Inbucket), so recovery mail is readable in-app
      '/mb': {
        target: 'http://127.0.0.1:54324',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mb/, ''),
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
      // the local mail catcher (Inbucket), so recovery mail is readable in-app
      '/mb': {
        target: 'http://127.0.0.1:54324',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mb/, ''),
      },
    },
  },
})
