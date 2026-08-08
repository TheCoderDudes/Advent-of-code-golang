import { useEffect, useMemo, useRef } from 'react'
import { RunCard } from '../components/RunCard'
import { EmptyState } from '../components/ui'
import { playAlertTone, useNow, useWakeLock, vibrate } from '../lib/hooks'
import { directionVerb, isRunActive, runLeaveByInstant, runPartySize } from '../lib/runs'
import { minutesBehind, pickActiveRun, pickNextRun } from '../lib/selectors'
import { formatClock, formatCountdown, formatLongDayLabel, minutesUntil, toDateKey } from '../lib/time'
import { useStore } from '../state/store'
import type { Tab } from '../App'

/** How long after a leave-by time the alert is still worth firing. */
const ALERT_GRACE_MS = 15 * 60_000

export const NowScreen = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const { state, dispatch, appointmentsById } = useStore()
  const now = useNow(10_000)
  const today = toDateKey(now)

  const current = pickActiveRun(state.runs, today, state.activeRunId)
  const next = pickNextRun(state.runs, today, current?.id)
  const behind = minutesBehind(state.runs, appointmentsById, state.settings, today)

  useWakeLock(state.settings.keepScreenAwake && Boolean(current && isRunActive(current)))

  // Fire once per run when its leave-by passes, while the app is open.
  const alerted = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!state.settings.leaveByAlerts) return
    for (const run of state.runs) {
      if (run.date !== today || run.status !== 'upcoming') continue
      if (alerted.current.has(run.id)) continue
      const leaveBy = runLeaveByInstant(run, appointmentsById, state.settings)
      const overdueMs = now.getTime() - leaveBy.getTime()
      // Only alert when the time has just hit. Opening the app at noon shouldn't
      // beep about a run whose leave-by passed four hours ago.
      if (overdueMs >= 0 && overdueMs <= ALERT_GRACE_MS) {
        alerted.current.add(run.id)
        playAlertTone()
        vibrate()
        dispatch({
          type: 'pushNotice',
          notice: `Time to leave for the ${formatClock(leaveBy)} run.`,
        })
      }
    }
  }, [now, state.runs, state.settings, today, appointmentsById, dispatch])

  const suiteMissing = !state.settings.suiteAddress.trim()
  const nextHeads = useMemo(
    () => (next ? runPartySize(next, appointmentsById) : 0),
    [next, appointmentsById],
  )

  if (state.appointments.length === 0) {
    return (
      <EmptyState
        title="No schedule yet"
        body="Import your day from a CSV and the app will build your runs automatically."
        action={
          <button type="button" className="tap-primary" onClick={() => onNavigate('import')}>
            Go to Import
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {suiteMissing ? (
        <button
          type="button"
          className="tap-ghost w-full border-amber-500 text-amber-300"
          onClick={() => onNavigate('settings')}
          data-testid="suite-missing"
        >
          Set your suite address in Settings
        </button>
      ) : null}

      {behind > 0 ? (
        <p
          className="rounded-2xl bg-amber-500/15 px-4 py-3 text-center text-lg font-bold text-amber-300"
          data-testid="behind-indicator"
        >
          Running {formatCountdown(behind)} behind
        </p>
      ) : null}

      {current && current.date !== today ? (
        <p className="rounded-2xl bg-ink-700 px-4 py-3 text-center text-base font-bold text-slate-300">
          Nothing left today — showing {formatLongDayLabel(current.date)}
        </p>
      ) : null}

      {current ? (
        <RunCard
          run={current}
          appointmentsById={appointmentsById}
          settings={state.settings}
          dispatch={dispatch}
          allRuns={state.runs}
          now={now}
        />
      ) : (
        <EmptyState
          title="Nothing left today"
          body="Every run for today is complete. Check the Day timeline for other show days."
          action={
            <button type="button" className="tap-secondary" onClick={() => onNavigate('day')}>
              Open Day timeline
            </button>
          }
        />
      )}

      {next ? (
        <section className="card" data-testid="next-card">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Next</p>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h3 className="text-2xl font-black">{directionVerb(next.direction)}</h3>
            <span className="text-2xl font-black text-slate-300">
              {formatClock(runLeaveByInstant(next, appointmentsById, state.settings))}
            </span>
          </div>
          <p className="mt-1 text-lg text-slate-400">
            {next.passengers.length} {next.passengers.length === 1 ? 'account' : 'accounts'} ·{' '}
            {nextHeads} {nextHeads === 1 ? 'person' : 'people'} · leave in{' '}
            {formatCountdown(
              minutesUntil(runLeaveByInstant(next, appointmentsById, state.settings), now),
            )}
          </p>
          <p className="mt-1 truncate text-base text-slate-500">
            {next.passengers
              .map((p) => appointmentsById.get(p.appointmentId)?.accountName)
              .filter(Boolean)
              .join(', ')}
          </p>
          <button
            type="button"
            className="tap-ghost mt-3 w-full"
            onClick={() => dispatch({ type: 'setActiveRun', runId: next.id })}
          >
            Make this the active run
          </button>
        </section>
      ) : null}
    </div>
  )
}
