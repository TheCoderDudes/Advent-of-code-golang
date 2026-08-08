import type { Appointment, Run, Settings } from '../types'
import { runPlannedEndInstant } from './runs'

export const runsForDate = (runs: Run[], date: string): Run[] =>
  runs.filter((run) => run.date === date)

/**
 * The run the driver is on right now: whatever they pinned, else anything
 * already in progress, else the next unfinished run from today onwards. The
 * "onwards" part matters when they open the app the day before the show.
 */
export const pickActiveRun = (runs: Run[], today: string, activeRunId: string | null): Run | null => {
  const pinned = runs.find((run) => run.id === activeRunId && run.status !== 'complete')
  if (pinned) return pinned
  const inProgress = runs.find(
    (run) => run.status !== 'upcoming' && run.status !== 'complete' && run.date >= today,
  )
  if (inProgress) return inProgress
  return runs.find((run) => run.date >= today && run.status !== 'complete') ?? null
}

export const pickNextRun = (runs: Run[], today: string, currentId: string | undefined): Run | null =>
  runs.find((run) => run.date >= today && run.status !== 'complete' && run.id !== currentId) ?? null

/**
 * How late the day is running: the worst overrun among runs finished today.
 * Only positive values are interesting — being early needs no banner.
 */
export const minutesBehind = (
  runs: Run[],
  appointments: Map<string, Appointment>,
  settings: Settings,
  today: string,
): number => {
  let worst = 0
  for (const run of runs) {
    if (run.date !== today || run.status !== 'complete' || !run.completedAt) continue
    const planned = runPlannedEndInstant(run, appointments, settings).getTime()
    const actual = new Date(run.completedAt).getTime()
    if (!Number.isFinite(actual)) continue
    worst = Math.max(worst, Math.round((actual - planned) / 60_000))
  }
  return worst
}

/** Every date that has at least one appointment, ascending. */
export const showDates = (appointments: Appointment[]): string[] =>
  Array.from(new Set(appointments.map((a) => a.date))).sort()
