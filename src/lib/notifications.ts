/**
 * System notifications, layered on top of the in-app activity feed.
 *
 * Two channels exist. On the web it is the `Notification` API plus Web Push, and
 * both are optional (iOS only exposes them to an installed web app; a browser
 * that was not granted permission throws on construction). Inside the Android
 * shell neither the `Notification` API nor `PushManager` exists, so notifications
 * go through the native `@capacitor/local-notifications` plugin instead.
 *
 * Every call here is defensive — a missing permission or API must never break
 * the app, it just means the bell badge is the only channel.
 */

import {
  appForeground,
  ensureNotificationPermission,
  isNative,
  nativePermission,
  showLocalNotification,
  type NativePermission,
} from './native'

const KEY = 'orbit.notify'

export interface NotifyPrefs {
  /** Mirror activity into OS-level notifications when the app is not visible. */
  system: boolean
}

export function loadNotifyPrefs(): NotifyPrefs {
  try {
    return { system: false, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<NotifyPrefs>) }
  } catch {
    return { system: false }
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs))
}

export function notificationsSupported(): boolean {
  if (isNative) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

/** `unsupported` is distinct from `denied` so the UI can explain the difference. */
export function systemPermission(): NotificationPermission | 'unsupported' | NativePermission {
  if (isNative) return 'prompt' // read asynchronously via `systemPermissionAsync`
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** The real permission on both platforms; native is async. */
export async function systemPermissionAsync(): Promise<NotificationPermission | 'unsupported' | NativePermission> {
  if (isNative) return nativePermission()
  return systemPermission()
}

export async function requestSystemPermission(): Promise<NotificationPermission | 'unsupported' | NativePermission> {
  if (isNative) return ensureNotificationPermission()
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Raise an OS notification. Only fires while the app is not in the foreground —
 * a visible app already shows its own toast, and doubling up is noise.
 */
export function showSystemNotification(title: string, body?: string, onClick?: () => void): void {
  if (appForeground()) return
  if (isNative) {
    void showLocalNotification(`${title}|${body ?? ''}`, title, body ?? '')
    return
  }
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    const note = new Notification(title, {
      body,
      icon: 'brand/orbit-logo-128.png',
      badge: 'brand/orbit-logo-64.png',
      tag: 'orbit-activity',
    })
    if (onClick) {
      note.onclick = () => {
        window.focus()
        onClick()
        note.close()
      }
    }
  } catch {
    /* some browsers only allow this from a service worker — the badge still works */
  }
}
