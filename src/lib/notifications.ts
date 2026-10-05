/**
 * System notifications, layered on top of the in-app activity feed.
 *
 * The Web Notification API is optional everywhere: iOS only exposes it to an
 * installed web app (16.4+), and a browser that has not been granted permission
 * throws on construction. Every call here is therefore defensive — a missing
 * permission or API must never break the app, it just means the bell badge is
 * the only channel.
 */

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
  return typeof window !== 'undefined' && 'Notification' in window
}

/** `unsupported` is distinct from `denied` so the UI can explain the difference. */
export function systemPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function requestSystemPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Raise an OS notification. Only fires while the document is hidden — a visible
 * app already shows its own toast, and doubling up is noise.
 */
export function showSystemNotification(title: string, body?: string, onClick?: () => void): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
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
