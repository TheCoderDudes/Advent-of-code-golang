import type { Appointment, Settings } from '../types'

export interface NavTarget {
  /** Native Google Maps scheme. Absent when the route needs waypoints. */
  appUrl?: string
  webUrl: string
  label: string
  stops: string[]
}

const enc = encodeURIComponent

/**
 * One stop -> the app scheme with a web fallback.
 * More than one -> the web URL with waypoints, because comgooglemaps:// does not
 * handle waypoints reliably. Origin is left off so Maps starts from wherever the
 * driver actually is.
 */
export const buildNavTarget = (stops: string[], label: string): NavTarget | null => {
  const clean = stops.map((s) => s.trim()).filter(Boolean)
  if (clean.length === 0) return null

  if (clean.length === 1) {
    return {
      appUrl: `comgooglemaps://?daddr=${enc(clean[0])}&directionsmode=driving`,
      webUrl: `https://www.google.com/maps/dir/?api=1&destination=${enc(clean[0])}&travelmode=driving`,
      label,
      stops: clean,
    }
  }

  const destination = clean[clean.length - 1]
  const waypoints = clean.slice(0, -1).map(enc).join('%7C')
  return {
    webUrl: `https://www.google.com/maps/dir/?api=1&destination=${enc(destination)}&waypoints=${waypoints}&travelmode=driving`,
    label,
    stops: clean,
  }
}

export const telUrl = (phone: string): string | null => (phone ? `tel:${phone}` : null)

/** iOS wants `sms:<number>&body=<text>` — not `?body=`. */
export const smsUrl = (phone: string, body: string): string | null =>
  phone ? `sms:${phone}&body=${enc(body)}` : null

export interface TemplateVars {
  contact?: string
  account?: string
  minutes?: number | string
  me?: string
  vehicle?: string
}

export const renderTemplate = (template: string, vars: TemplateVars, settings: Settings): string =>
  template
    .replace(/\{contact\}/g, vars.contact ?? 'there')
    .replace(/\{account\}/g, vars.account ?? '')
    .replace(/\{minutes\}/g, String(vars.minutes ?? ''))
    .replace(/\{me\}/g, vars.me ?? (settings.driverName || 'your driver'))
    .replace(/\{vehicle\}/g, vars.vehicle ?? (settings.vehicleDescription || 'vehicle'))

export const templateVarsFor = (appointment: Appointment): TemplateVars => ({
  contact: appointment.contactName || appointment.accountName,
  account: appointment.accountName,
})

/**
 * Try the native app first, then fall back to the browser. If the scheme handler
 * takes over, the page gets hidden and the fallback is skipped.
 */
export const openNavigation = (target: NavTarget): void => {
  if (typeof window === 'undefined') return
  if (!target.appUrl) {
    window.location.href = target.webUrl
    return
  }
  const started = Date.now()
  window.location.href = target.appUrl
  window.setTimeout(() => {
    if (document.visibilityState === 'visible' && Date.now() - started < 2500) {
      window.location.href = target.webUrl
    }
  }, 1200)
}

export const openUrl = (url: string): void => {
  if (typeof window === 'undefined') return
  window.location.href = url
}
