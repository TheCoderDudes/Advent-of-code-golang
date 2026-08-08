import type { AppState, Appointment, PassengerState, Run, RunStatus, Settings } from '../types'
import { emptyState } from '../lib/storage'
import {
  mergeRuns,
  moveAppointment,
  nextRunStatus,
  reconcileRuns,
  splitAppointmentOut,
} from '../lib/runs'

export type Action =
  | { type: 'replaceAppointments'; appointments: Appointment[] }
  | { type: 'appendAppointments'; appointments: Appointment[] }
  | { type: 'upsertAppointment'; appointment: Appointment }
  | { type: 'deleteAppointment'; appointmentId: string }
  | { type: 'setAppointmentStatus'; appointmentId: string; status: Appointment['status'] }
  | { type: 'advanceRun'; runId: string }
  | { type: 'setRunStatus'; runId: string; status: RunStatus }
  | { type: 'setPassengerState'; runId: string; appointmentId: string; state: PassengerState }
  | { type: 'noShow'; runId: string; appointmentId: string }
  | { type: 'setRunNotes'; runId: string; notes: string }
  | { type: 'splitRun'; runId: string; appointmentId: string }
  | { type: 'mergeRuns'; targetId: string; otherId: string }
  | { type: 'moveAppointment'; appointmentId: string; fromRunId: string; toRunId: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'setSelectedDate'; date: string }
  | { type: 'setActiveRun'; runId: string | null }
  | { type: 'pushNotice'; notice: string }
  | { type: 'dismissNotice'; index: number }
  | { type: 'setOnboarded' }
  | { type: 'wipe' }

const MAX_NOTICES = 4

const withNotices = (state: AppState, notices: string[]): string[] =>
  notices.length === 0 ? state.notices : [...state.notices, ...notices].slice(-MAX_NOTICES)

/**
 * Any change to appointments or runs is funnelled through here, so the run
 * invariants hold no matter which screen made the edit.
 */
const settle = (
  state: AppState,
  appointments: Appointment[],
  runs: Run[],
  extraNotices: string[] = [],
): AppState => {
  const result = reconcileRuns(appointments, runs, state.settings)
  const activeStillExists = result.runs.some((run) => run.id === state.activeRunId)
  return {
    ...state,
    appointments,
    runs: result.runs,
    activeRunId: activeStillExists ? state.activeRunId : null,
    notices: withNotices(state, [...extraNotices, ...result.notices]),
  }
}

const mapRun = (runs: Run[], runId: string, fn: (run: Run) => Run): Run[] =>
  runs.map((run) => (run.id === runId ? fn(run) : run))

export const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'replaceAppointments':
      // A full replace drops the old runs too, otherwise stale pinned runs
      // would survive with nobody in them.
      return settle({ ...state, activeRunId: null }, action.appointments, [], [
        `Replaced schedule — ${action.appointments.length} appointments imported.`,
      ])

    case 'appendAppointments':
      return settle(
        state,
        [...state.appointments, ...action.appointments],
        state.runs,
        [`Added ${action.appointments.length} appointments.`],
      )

    case 'upsertAppointment': {
      const exists = state.appointments.some((a) => a.id === action.appointment.id)
      const appointments = exists
        ? state.appointments.map((a) => (a.id === action.appointment.id ? action.appointment : a))
        : [...state.appointments, action.appointment]
      return settle(state, appointments, state.runs)
    }

    case 'deleteAppointment':
      return settle(
        state,
        state.appointments.filter((a) => a.id !== action.appointmentId),
        state.runs,
      )

    case 'setAppointmentStatus':
      return settle(
        state,
        state.appointments.map((a) =>
          a.id === action.appointmentId ? { ...a, status: action.status } : a,
        ),
        state.runs,
      )

    case 'advanceRun': {
      const run = state.runs.find((r) => r.id === action.runId)
      if (!run) return state
      const next = nextRunStatus(run)
      if (!next) return state
      return reducer(state, { type: 'setRunStatus', runId: run.id, status: next })
    }

    case 'setRunStatus': {
      const runs = mapRun(state.runs, action.runId, (run) => {
        let passengers = run.passengers
        if (action.status === 'onboard') {
          // "Everyone onboard" boards anybody still waiting.
          passengers = passengers.map((p) =>
            p.state === 'waiting' ? { ...p, state: 'onboard' as PassengerState } : p,
          )
        }
        if (action.status === 'complete') {
          passengers = passengers.map((p) =>
            p.state === 'onboard' || p.state === 'waiting'
              ? { ...p, state: 'dropped' as PassengerState }
              : p,
          )
        }
        return {
          ...run,
          status: action.status,
          passengers,
          completedAt: action.status === 'complete' ? new Date().toISOString() : undefined,
        }
      })
      const stillActive = runs.find((r) => r.id === action.runId)
      return {
        ...state,
        runs,
        activeRunId:
          action.status === 'complete' && state.activeRunId === action.runId
            ? null
            : stillActive
              ? action.runId
              : state.activeRunId,
      }
    }

    case 'setPassengerState':
      return {
        ...state,
        runs: mapRun(state.runs, action.runId, (run) => ({
          ...run,
          passengers: run.passengers.map((p) =>
            p.appointmentId === action.appointmentId ? { ...p, state: action.state } : p,
          ),
        })),
      }

    case 'noShow': {
      const appointment = state.appointments.find((a) => a.id === action.appointmentId)
      const runs = mapRun(state.runs, action.runId, (run) => ({
        ...run,
        passengers: run.passengers.map((p) =>
          p.appointmentId === action.appointmentId
            ? { ...p, state: 'noShow' as PassengerState }
            : p,
        ),
      }))
      const appointments = state.appointments.map((a) =>
        a.id === action.appointmentId ? { ...a, status: 'noShow' as const } : a,
      )
      return settle(
        state,
        appointments,
        runs,
        appointment ? [`${appointment.accountName} marked no-show.`] : [],
      )
    }

    case 'setRunNotes':
      return {
        ...state,
        runs: mapRun(state.runs, action.runId, (run) => ({ ...run, notes: action.notes })),
      }

    case 'splitRun': {
      const result = splitAppointmentOut(state.runs, action.runId, action.appointmentId)
      return settle(state, state.appointments, result.runs, result.notices)
    }

    case 'mergeRuns': {
      const result = mergeRuns(state.runs, action.targetId, action.otherId)
      return {
        ...settle(state, state.appointments, result.runs, result.notices),
        activeRunId: state.activeRunId === action.otherId ? action.targetId : state.activeRunId,
      }
    }

    case 'moveAppointment': {
      const result = moveAppointment(
        state.runs,
        action.appointmentId,
        action.fromRunId,
        action.toRunId,
      )
      return settle(state, state.appointments, result.runs, result.notices)
    }

    case 'updateSettings': {
      const settings = {
        ...state.settings,
        ...action.settings,
        templates: { ...state.settings.templates, ...(action.settings.templates ?? {}) },
      }
      // Grouping settings changed, so re-run the suggestions (pinned runs stand).
      return settle({ ...state, settings }, state.appointments, state.runs)
    }

    case 'setSelectedDate':
      return { ...state, selectedDate: action.date }

    case 'setActiveRun':
      return { ...state, activeRunId: action.runId }

    case 'pushNotice':
      return { ...state, notices: withNotices(state, [action.notice]) }

    case 'dismissNotice':
      return { ...state, notices: state.notices.filter((_, i) => i !== action.index) }

    case 'setOnboarded':
      return { ...state, hasOnboarded: true }

    case 'wipe':
      return { ...emptyState(), hasOnboarded: true }

    default:
      return state
  }
}
