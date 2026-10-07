/**
 * The Capacitor side of notifications.
 *
 * On the web the app uses the plain `Notification` API and Web Push. Inside the
 * Android shell neither exists — `Notification` is undefined in a WebView and
 * `PushManager` is Chromium-only, not WebView — so native local notifications are
 * the only channel that reaches the user there.
 *
 * `document.visibilityState` is unreliable in a WebView (it does not follow the
 * Android task state), so foreground/background is read from `@capacitor/app`.
 */
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'

export const isNative = Capacitor.isNativePlatform()

/** Android notification ids are 32-bit ints; hash a string key into that range. */
export function notificationId(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  return h === 0 ? 1 : h
}

let foreground = true
const foregroundListeners = new Set<(active: boolean) => void>()

if (isNative) {
  void App.addListener('appStateChange', ({ isActive }) => {
    foreground = isActive
    for (const listener of foregroundListeners) listener(isActive)
  })
}

export function appForeground(): boolean {
  if (isNative) return foreground
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

export function onAppForegroundChange(listener: (active: boolean) => void): () => void {
  foregroundListeners.add(listener)
  return () => {
    foregroundListeners.delete(listener)
  }
}

export type NativePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

/** Current permission without prompting. */
export async function nativePermission(): Promise<NativePermission> {
  if (!isNative) return 'unsupported'
  try {
    const current = await LocalNotifications.checkPermissions()
    if (current.display === 'granted') return 'granted'
    if (current.display === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** Ask for permission, prompting only if it has not been decided yet. */
export async function ensureNotificationPermission(): Promise<NativePermission> {
  if (!isNative) return 'unsupported'
  const current = await nativePermission()
  if (current === 'granted' || current === 'denied' || current === 'unsupported') return current
  try {
    const asked = await LocalNotifications.requestPermissions()
    if (asked.display === 'granted') return 'granted'
    return asked.display === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** Raise an OS notification. Distinct keys become distinct, stacked notifications. */
export async function showLocalNotification(key: string, title: string, body: string): Promise<void> {
  if (!isNative) return
  try {
    await LocalNotifications.schedule({
      notifications: [{ id: notificationId(key), title, body, iconColor: '#7dd3fc' }],
    })
  } catch {
    /* a notification that cannot be shown must never break the app */
  }
}

/** Fires when the user taps a notification; the app is already foregrounded by then. */
export function onNotificationTap(listener: () => void): () => void {
  if (!isNative) return () => {}
  let handle: { remove: () => Promise<void> } | null = null
  void LocalNotifications.addListener('localNotificationActionPerformed', () => listener()).then((h) => {
    handle = h
  })
  return () => {
    void handle?.remove()
  }
}
