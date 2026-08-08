import type {
  Appointment,
  PassengerState,
  Run,
  RunDirection,
  RunStatus,
  Settings,
} from '../types'
import { newId } from './id'
import { addMinutesToTime, timeToMinutes, zonedInstant } from './time'

export const DIRECTIONS: RunDirection[] = ['toSuite', 'toConventionCenter']

export const RUN_STATUS_ORDER: RunStatus[] = [
  'upcoming',
  'driving',
  'arrived',
  'onboard',
  'complete',
]

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  upcoming: 'Upcoming',
  driving: 'En route to pickup',
  arrived: 'At pickup',
  onboard: 'Passengers onboard',
  complete: 'Complete',
}

export const directionVerb = (direction: RunDirection): string =>
  direction === 'toSuite' ? 'PICK UP' : 'DROP OFF'

export const byId = (appointments: Appointment[]): Map<string, Appointment> =>
  new Map(appointments.map((a) => [a.id, a]))

export const appointmentEndTime = (appointment: Appointment): string =>
  addMinutesToTime(appointment.startTime, appointment.durationMinutes)

/** The time an appointment contributes to a run of the given direction. */
export const appointmentTimeForDirection = (
  appointment: Appointment,
  direction: RunDirection,
): string =>
  direction === 'toSuite' ? appointment.startTime : appointmentEndTime(appointment)

/**
 * Pickup runs are anchored to the *earliest* start — everyone has to be at the
 * suite by the time the first meeting begins. Return runs are anchored to the
 * *latest* end — you can't leave before the last meeting is over.
 */
export const anchorTimeFor = (direction: RunDirection, times: string[]): string => {
  if (times.length === 0) return '00:00'
  const minutes = times.map(timeToMinutes)
  return times[
    minutes.indexOf(direction === 'toSuite' ? Math.min(...minutes) : Math.max(...minutes))
  ]
}

// --- derived read models ---------------------------------------------------

export const activePassengers = (run: Run) => run.passengers.filter((p) => p.state !== 'noShow')

export const runAppointments = (run: Run, appointments: Map<string, Appointment>): Appointment[] =>
  run.passengers
    .map((p) => appointments.get(p.appointmentId))
    .filter((a): a is Appointment => Boolean(a))

export const runPartySize = (run: Run, appointments: Map<string, Appointment>): number =>
  run.passengers
    .filter((p) => p.state !== 'noShow')
    .reduce((sum, p) => sum + (appointments.get(p.appointmentId)?.partySize ?? 0), 0)

export const runAccountCount = (run: Run): number => activePassengers(run).length

export const isOverCapacity = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): boolean => runPartySize(run, appointments) > settings.vehicleCapacity

const passengerAddress = (
  appointment: Appointment,
  direction: RunDirection,
  settings: Settings,
): string => {
  if (direction === 'toSuite') return appointment.pickupLocation || settings.conventionCenterAddress
  return appointment.dropoffLocation || appointment.pickupLocation || settings.conventionCenterAddress
}

/** Distinct addresses this run has to physically visit, in passenger order. */
export const runStops = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): string[] => {
  const stops: string[] = []
  for (const passenger of run.passengers) {
    if (passenger.state === 'noShow') continue
    const appointment = appointments.get(passenger.appointmentId)
    if (!appointment) continue
    const address = passengerAddress(appointment, run.direction, settings)
    if (address && !stops.includes(address)) stops.push(address)
  }
  return stops
}

/**
 * Minutes of lead time before `scheduledTime`.
 *
 * Pickup runs follow the spec's formula (drive time + buffer), with the extra
 * per-stop allowance when there's more than one pickup point. `roundTripLeaveBy`
 * additionally counts the drive *out* to the pickup, which is what the clock
 * actually does — it's off by default so the stated formula is what ships.
 *
 * Return runs depart from the suite, so there's no drive to subtract: just the
 * buffer so the driver is downstairs before the meeting breaks.
 */
export const leadMinutes = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): number => {
  if (run.direction === 'toConventionCenter') return settings.bufferMinutes
  const stops = Math.max(runStops(run, appointments, settings).length, 1)
  const extra = (stops - 1) * settings.extraMinutesPerStop
  const drive = settings.driveTimeMinutes * (settings.roundTripLeaveBy ? 2 : 1)
  return drive + settings.bufferMinutes + extra
}

export const runScheduledInstant = (run: Run): Date => zonedInstant(run.date, run.scheduledTime)

export const runLeaveByInstant = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): Date =>
  new Date(
    runScheduledInstant(run).getTime() - leadMinutes(run, appointments, settings) * 60_000,
  )

/** When this run should be finished, used for conflict + "running behind" math. */
export const runPlannedEndInstant = (
  run: Run,
  appointments: Map<string, Appointment>,
  settings: Settings,
): Date => {
  if (run.direction === 'toSuite') return runScheduledInstant(run)
  const stops = Math.max(runStops(run, appointments, settings).length, 1)
  const minutes = settings.driveTimeMinutes + (stops - 1) * settings.extraMinutesPerStop
  return new Date(runScheduledInstant(run).getTime() + minutes * 60_000)
}

export const isRunActive = (run: Run): boolean =>
  run.status !== 'upcoming' && run.status !== 'complete'

/** Every passenger has either boarded or been written off — the run can close. */
export const allPassengersResolved = (run: Run): boolean =>
  run.passengers.length > 0 &&
  run.passengers.every((p) => p.state === 'onboard' || p.state === 'dropped' || p.state === 'noShow')

export const nextRunStatus = (run: Run): RunStatus | null => {
  const index = RUN_STATUS_ORDER.indexOf(run.status)
  if (index < 0 || index === RUN_STATUS_ORDER.length - 1) return null
  return RUN_STATUS_ORDER[index + 1]
}

export const primaryActionLabel = (run: Run): string | null => {
  switch (run.status) {
    case 'upcoming':
      return 'Start driving'
    case 'driving':
      return 'Arrived'
    case 'arrived':
      return 'Everyone onboard'
    case 'onboard':
      return 'Complete'
    default:
      return null
  }
}

// --- reconciliation --------------------------------------------------------

export interface ReconcileResult {
  runs: Run[]
  notices: string[]
}

const makeRun = (
  direction: RunDirection,
  date: string,
  scheduledTime: string,
  appointmentIds: string[],
): Run => ({
  id: newId('run'),
  direction,
  date,
  scheduledTime,
  passengers: appointmentIds.map((appointmentId) => ({
    appointmentId,
    state: 'waiting' as PassengerState,
  })),
  status: 'upcoming',
  notes: '',
  pinned: false,
})

const recomputeScheduledTime = (run: Run, appointments: Map<string, Appointment>): Run => {
  const times = run.passengers
    .filter((p) => p.state !== 'noShow')
    .map((p) => appointments.get(p.appointmentId))
    .filter((a): a is Appointment => Boolean(a))
    .map((a) => appointmentTimeForDirection(a, run.direction))
  if (times.length === 0) return run
  const scheduledTime = anchorTimeFor(run.direction, times)
  return scheduledTime === run.scheduledTime ? run : { ...run, scheduledTime }
}

const sortRuns = (runs: Run[]): Run[] =>
  [...runs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const diff = timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime)
    if (diff !== 0) return diff
    return a.direction === b.direction ? 0 : a.direction === 'toSuite' ? -1 : 1
  })

/**
 * The single source of truth for run membership.
 *
 * Guarantees, checked by tests: every scheduled appointment sits in exactly one
 * pickup run and exactly one return run; no run is empty; no appointment is
 * duplicated; and manual splits/merges (pinned runs) are never undone.
 */
export const reconcileRuns = (
  appointments: Appointment[],
  runs: Run[],
  settings: Settings,
): ReconcileResult => {
  const lookup = byId(appointments)
  const notices: string[] = []
  const window = Math.max(settings.groupWindowMinutes, 0)

  let working: Run[] = runs.map((run) => ({ ...run, passengers: [...run.passengers] }))

  // 1. Scrub memberships that no longer make sense.
  const seenPerDirection = new Map<string, Set<string>>()
  working = working.map((run) => {
    const seenKey = `${run.direction}`
    if (!seenPerDirection.has(seenKey)) seenPerDirection.set(seenKey, new Set())
    const seen = seenPerDirection.get(seenKey)!

    const passengers = run.passengers.filter((passenger) => {
      const appointment = lookup.get(passenger.appointmentId)
      if (!appointment) return false // deleted appointment
      if (appointment.status === 'cancelled') return false
      if (appointment.status === 'noShow' && run.direction === 'toConventionCenter') {
        notices.push(`Return run for ${appointment.accountName} removed — marked no-show.`)
        return false
      }
      // An appointment may never sit in two runs of the same direction.
      const key = `${appointment.id}@${appointment.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const normalised = passengers.map((passenger) => {
      const appointment = lookup.get(passenger.appointmentId)!
      if (appointment.status === 'noShow') return { ...passenger, state: 'noShow' as PassengerState }
      // Un-doing a no-show puts them back in the queue.
      if (passenger.state === 'noShow') return { ...passenger, state: 'waiting' as PassengerState }
      return passenger
    })

    return { ...run, passengers: normalised }
  })

  // A revived appointment stuck inside an already-finished run needs a fresh one.
  working = working.map((run) => {
    if (run.status !== 'complete') return run
    const passengers = run.passengers.filter((passenger) => {
      const appointment = lookup.get(passenger.appointmentId)
      return !(appointment?.status === 'scheduled' && passenger.state === 'waiting')
    })
    return passengers.length === run.passengers.length ? run : { ...run, passengers }
  })

  // 2. Drop runs that ended up empty.
  working = working.filter((run) => {
    if (run.passengers.length > 0) return true
    if (runs.find((r) => r.id === run.id)?.passengers.length) {
      notices.push(`Empty ${run.direction === 'toSuite' ? 'pickup' : 'return'} run removed.`)
    }
    return false
  })

  // 3. Assign anything that still has no home.
  for (const direction of DIRECTIONS) {
    const assigned = new Set(
      working
        .filter((run) => run.direction === direction)
        .flatMap((run) => run.passengers.filter((p) => p.state !== 'noShow').map((p) => p.appointmentId)),
    )

    const unassigned = appointments
      .filter((a) => a.status === 'scheduled' && !assigned.has(a.id))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return (
          timeToMinutes(appointmentTimeForDirection(a, direction)) -
          timeToMinutes(appointmentTimeForDirection(b, direction))
        )
      })

    const leftovers: Appointment[] = []
    for (const appointment of unassigned) {
      const time = timeToMinutes(appointmentTimeForDirection(appointment, direction))
      // Prefer joining an existing suggestion that hasn't been touched or started.
      const host = working.find(
        (run) =>
          run.direction === direction &&
          run.date === appointment.date &&
          !run.pinned &&
          run.status === 'upcoming' &&
          Math.abs(timeToMinutes(run.scheduledTime) - time) <= window,
      )
      if (host) {
        host.passengers.push({ appointmentId: appointment.id, state: 'waiting' })
      } else {
        leftovers.push(appointment)
      }
    }

    // Greedy sweep: everyone within `window` of the group's first member rides together.
    let group: Appointment[] = []
    const flush = () => {
      if (group.length === 0) return
      const times = group.map((a) => appointmentTimeForDirection(a, direction))
      working.push(
        makeRun(
          direction,
          group[0].date,
          anchorTimeFor(direction, times),
          group.map((a) => a.id),
        ),
      )
      group = []
    }
    for (const appointment of leftovers) {
      const time = timeToMinutes(appointmentTimeForDirection(appointment, direction))
      const anchor =
        group.length > 0
          ? timeToMinutes(appointmentTimeForDirection(group[0], direction))
          : null
      if (group.length > 0 && (group[0].date !== appointment.date || time - anchor! > window)) {
        flush()
      }
      group.push(appointment)
    }
    flush()
  }

  // 4. Times always follow membership, even on pinned runs.
  working = working.map((run) => recomputeScheduledTime(run, lookup))

  return { runs: sortRuns(working), notices: dedupe(notices) }
}

const dedupe = (values: string[]): string[] => Array.from(new Set(values))

// --- manual overrides ------------------------------------------------------

/** Pull one appointment out of a run and into a run of its own. */
export const splitAppointmentOut = (
  runs: Run[],
  runId: string,
  appointmentId: string,
): ReconcileResult => {
  const source = runs.find((r) => r.id === runId)
  if (!source) return { runs, notices: ['That run no longer exists.'] }
  const passenger = source.passengers.find((p) => p.appointmentId === appointmentId)
  if (!passenger) return { runs, notices: ['That account is not in this run.'] }
  if (source.passengers.length < 2) return { runs, notices: ['That run only has one account.'] }

  const remaining: Run = {
    ...source,
    pinned: true,
    passengers: source.passengers.filter((p) => p.appointmentId !== appointmentId),
  }
  const split: Run = {
    ...source,
    id: newId('run'),
    pinned: true,
    notes: '',
    completedAt: undefined,
    // A brand new run starts from the top so the driver re-walks the statuses.
    status: source.status === 'complete' ? 'complete' : 'upcoming',
    passengers: [passenger],
  }

  return { runs: sortRuns([...runs.filter((r) => r.id !== runId), remaining, split]), notices: [] }
}

/** Fold `otherId` into `targetId`. Same day, same direction only. */
export const mergeRuns = (runs: Run[], targetId: string, otherId: string): ReconcileResult => {
  const target = runs.find((r) => r.id === targetId)
  const other = runs.find((r) => r.id === otherId)
  if (!target || !other) return { runs, notices: ['One of those runs no longer exists.'] }
  if (target.id === other.id) return { runs, notices: [] }
  if (target.direction !== other.direction) {
    return { runs, notices: ['Those runs go in opposite directions — they cannot merge.'] }
  }
  if (target.date !== other.date) {
    return { runs, notices: ['Those runs are on different days — they cannot merge.'] }
  }

  const existing = new Set(target.passengers.map((p) => p.appointmentId))
  const merged: Run = {
    ...target,
    pinned: true,
    // Fall back to the less advanced status so no step gets skipped.
    status:
      RUN_STATUS_ORDER.indexOf(target.status) <= RUN_STATUS_ORDER.indexOf(other.status)
        ? target.status
        : other.status,
    notes: [target.notes, other.notes].filter(Boolean).join('\n'),
    passengers: [
      ...target.passengers,
      ...other.passengers.filter((p) => !existing.has(p.appointmentId)),
    ],
  }

  return {
    runs: sortRuns([...runs.filter((r) => r.id !== targetId && r.id !== otherId), merged]),
    notices: [],
  }
}

/** Move one appointment from one run to another (same day + direction). */
export const moveAppointment = (
  runs: Run[],
  appointmentId: string,
  fromRunId: string,
  toRunId: string,
): ReconcileResult => {
  const from = runs.find((r) => r.id === fromRunId)
  const to = runs.find((r) => r.id === toRunId)
  if (!from || !to) return { runs, notices: ['One of those runs no longer exists.'] }
  if (from.id === to.id) return { runs, notices: [] }
  if (from.direction !== to.direction || from.date !== to.date) {
    return { runs, notices: ['You can only move between runs on the same day and direction.'] }
  }
  const passenger = from.passengers.find((p) => p.appointmentId === appointmentId)
  if (!passenger) return { runs, notices: ['That account is not in this run.'] }

  const updatedFrom: Run = {
    ...from,
    pinned: true,
    passengers: from.passengers.filter((p) => p.appointmentId !== appointmentId),
  }
  const updatedTo: Run = {
    ...to,
    pinned: true,
    passengers: [
      ...to.passengers.filter((p) => p.appointmentId !== appointmentId),
      // Boarding state doesn't survive a move into a run that hasn't started.
      { ...passenger, state: to.status === 'upcoming' ? 'waiting' : passenger.state },
    ],
  }

  const next = [...runs.filter((r) => r.id !== fromRunId && r.id !== toRunId), updatedTo]
  if (updatedFrom.passengers.length > 0) next.push(updatedFrom)

  return {
    runs: sortRuns(next),
    notices: updatedFrom.passengers.length === 0 ? ['Empty run removed after the move.'] : [],
  }
}

// --- conflicts + summaries -------------------------------------------------

export interface RunConflict {
  runIds: [string, string]
  mergeable: boolean
}

/** Two runs the driver cannot possibly do at once. */
export const findConflicts = (
  runs: Run[],
  appointments: Map<string, Appointment>,
  settings: Settings,
): RunConflict[] => {
  const open = runs.filter((r) => r.status !== 'complete')
  const conflicts: RunConflict[] = []
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i]
      const b = open[j]
      if (a.date !== b.date) continue
      const aStart = runLeaveByInstant(a, appointments, settings).getTime()
      const aEnd = runPlannedEndInstant(a, appointments, settings).getTime()
      const bStart = runLeaveByInstant(b, appointments, settings).getTime()
      const bEnd = runPlannedEndInstant(b, appointments, settings).getTime()
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({ runIds: [a.id, b.id], mergeable: a.direction === b.direction })
      }
    }
  }
  return conflicts
}

export interface DaySummary {
  runsTotal: number
  runsComplete: number
  runsLeft: number
  accountsLeft: number
  passengersMoved: number
  noShows: Appointment[]
}

export const summariseDay = (
  runs: Run[],
  appointments: Map<string, Appointment>,
): DaySummary => {
  const complete = runs.filter((r) => r.status === 'complete')
  const left = runs.filter((r) => r.status !== 'complete')
  // Distinct accounts, not memberships: one account owes a pickup *and* a return,
  // and counting them twice reads as twice the work remaining.
  const accountsLeft = new Set(
    left.flatMap((run) => activePassengers(run).map((p) => p.appointmentId)),
  ).size
  const passengersMoved = complete.reduce(
    (sum, run) =>
      sum +
      run.passengers
        .filter((p) => p.state === 'dropped' || p.state === 'onboard')
        .reduce((s, p) => s + (appointments.get(p.appointmentId)?.partySize ?? 0), 0),
    0,
  )
  const noShows = Array.from(
    new Map(
      runs
        .flatMap((run) => run.passengers.filter((p) => p.state === 'noShow'))
        .map((p) => appointments.get(p.appointmentId))
        .filter((a): a is Appointment => Boolean(a))
        .map((a) => [a.id, a]),
    ).values(),
  )

  return {
    runsTotal: runs.length,
    runsComplete: complete.length,
    runsLeft: left.length,
    accountsLeft,
    passengersMoved,
    noShows,
  }
}
