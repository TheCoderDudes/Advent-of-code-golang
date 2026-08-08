import type { Appointment, Run, Settings } from '../types'
import { buildNavTarget, type NavTarget } from './links'
import { runStops } from './runs'

/** "Wynn Las Vegas, 3131 S Las Vegas Blvd..." -> "Wynn Las Vegas" */
export const shortAddress = (address: string): string =>
  (address.split(',')[0] || address).trim()

export interface NavPlan {
  target: NavTarget | null
  /** Why there is nothing to navigate to, if that's the case. */
  blockedReason?: string
}

/**
 * Where the driver actually needs to go *right now*, which depends on how far
 * through the run they are:
 *   pickup run:  the pickup point(s) -> then the suite once everyone is aboard
 *   return run:  the suite           -> then the drop-off(s) once aboard
 */
export const navPlanForRun = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): NavPlan => {
  const boarded = run.status === 'onboard' || run.status === 'complete'
  const suite = settings.suiteAddress.trim()

  const wantsSuite = run.direction === 'toSuite' ? boarded : !boarded
  if (wantsSuite) {
    if (!suite) return { target: null, blockedReason: 'Add your suite address in Settings.' }
    return { target: buildNavTarget([suite], `Navigate to ${shortAddress(suite)}`) }
  }

  const stops = runStops(run, appointments, settings)
  if (stops.length === 0) {
    return { target: null, blockedReason: 'No address on these appointments.' }
  }
  const label =
    stops.length === 1
      ? `Navigate to ${shortAddress(stops[0])}`
      : `Navigate ${stops.length} stops`
  return { target: buildNavTarget(stops, label) }
}
