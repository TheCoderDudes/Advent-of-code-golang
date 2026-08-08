import type { AppState, Appointment, Run, Settings } from '../types'
import { DEFAULT_SETTINGS } from './defaults'
import { toDateKey } from './time'

const KEY = 'valabasas-shuttle/v1'

export const emptyState = (): AppState => ({
  appointments: [],
  runs: [],
  settings: { ...DEFAULT_SETTINGS, templates: { ...DEFAULT_SETTINGS.templates } },
  selectedDate: toDateKey(),
  activeRunId: null,
  notices: [],
  hasOnboarded: false,
})

/**
 * Everything is read back defensively: a half-written or older payload should
 * degrade to defaults, never crash the app the driver is holding at a red light.
 */
export const loadState = (): AppState => {
  const base = emptyState()
  if (typeof localStorage === 'undefined') return base
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      ...base,
      appointments: Array.isArray(parsed.appointments)
        ? (parsed.appointments as Appointment[])
        : [],
      runs: Array.isArray(parsed.runs) ? (parsed.runs as Run[]) : [],
      settings: mergeSettings(base.settings, parsed.settings),
      selectedDate: typeof parsed.selectedDate === 'string' ? parsed.selectedDate : base.selectedDate,
      activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,
      hasOnboarded: parsed.hasOnboarded === true,
      notices: [],
    }
  } catch {
    return base
  }
}

const mergeSettings = (base: Settings, stored: unknown): Settings => {
  if (!stored || typeof stored !== 'object') return base
  const partial = stored as Partial<Settings>
  return {
    ...base,
    ...partial,
    templates: { ...base.templates, ...(partial.templates ?? {}) },
  }
}

let quotaWarned = false

export const saveState = (state: AppState): void => {
  if (typeof localStorage === 'undefined') return
  try {
    const { notices: _notices, ...persisted } = state
    localStorage.setItem(KEY, JSON.stringify(persisted))
  } catch (error) {
    if (!quotaWarned) {
      quotaWarned = true
      console.warn('Could not persist state — storage may be full.', error)
    }
  }
}

export const wipeState = (): void => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing useful to do */
  }
}
