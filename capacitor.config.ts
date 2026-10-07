import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android shell for ORBIT. The WebView loads the built SPA from `dist`, so the
 * app is the same React tree as the web build — no second implementation.
 *
 * The backend URL is baked in at build time through `.env.android` (see
 * package.json's `build:android`). It has to be absolute: inside the WebView
 * there is no dev server, so the `/sb` proxy the browser build relies on does
 * not exist.
 */
const config: CapacitorConfig = {
  appId: 'space.orbit.app',
  appName: 'ORBIT',
  webDir: 'dist',
  android: {
    // serve over https://localhost so the WebView counts as a secure origin —
    // WebAudio and localStorage both behave the same as they do on the web
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      // status-bar glyph for the messenger's native notifications
      smallIcon: 'ic_stat_orbit',
      iconColor: '#7dd3fc',
    },
  },
}

export default config
