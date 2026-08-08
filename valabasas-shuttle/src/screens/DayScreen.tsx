import { useMemo, useState } from 'react'
import type { Run } from '../types'
import { EmptyState, Sheet } from '../components/ui'
import { useNow } from '../lib/hooks'
import {
  RUN_STATUS_LABEL,
  directionVerb,
  findConflicts,
  isOverCapacity,
  runLeaveByInstant,
  runPartySize,
  runScheduledInstant,
  summariseDay,
} from '../lib/runs'
import { runsForDate, showDates } from '../lib/selectors'
import { formatClock, formatCountdown, formatLongDayLabel, minutesUntil, shiftDateKey, toDateKey } from '../lib/time'
import { useStore } from '../state/store'
import type { Tab } from '../App'

const STATUS_DOT: Record<Run['status'], string> = {
  upcoming: 'bg-slate-500',
  driving: 'bg-brand-500',
  arrived: 'bg-amber-400',
  onboard: 'bg-emerald-400',
  complete: 'bg-emerald-700',
}

const leaveByLabel = (run: Run, leaveBy: Date, now: Date): string => {
  if (run.status === 'complete') return 'done'
  const minutes = minutesUntil(leaveBy, now)
  return minutes < 0 ? `${formatCountdown(-minutes)} late` : `in ${formatCountdown(minutes)}`
}

export const DayScreen = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const { state, dispatch, appointmentsById } = useStore()
  const now = useNow(30_000)
  const [mergeSource, setMergeSource] = useState<Run | null>(null)

  const date = state.selectedDate
  const runs = useMemo(() => runsForDate(state.runs, date), [state.runs, date])
  const conflicts = useMemo(
    () => findConflicts(runs, appointmentsById, state.settings),
    [runs, appointmentsById, state.settings],
  )
  const summary = useMemo(() => summariseDay(runs, appointmentsById), [runs, appointmentsById])
  const dates = showDates(state.appointments)

  const conflictPartners = (runId: string) =>
    conflicts
      .filter((c) => c.runIds.includes(runId))
      .map((c) => ({
        otherId: c.runIds[0] === runId ? c.runIds[1] : c.runIds[0],
        mergeable: c.mergeable,
      }))

  const dayComplete = runs.length > 0 && summary.runsLeft === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="tap-secondary px-5"
          data-testid="day-prev"
          onClick={() => dispatch({ type: 'setSelectedDate', date: shiftDateKey(date, -1) })}
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-xl font-black leading-tight">{formatLongDayLabel(date)}</p>
          {date === toDateKey(now) ? (
            <p className="text-sm font-bold uppercase tracking-widest text-brand-400">Today</p>
          ) : null}
        </div>
        <button
          type="button"
          className="tap-secondary px-5"
          data-testid="day-next"
          onClick={() => dispatch({ type: 'setSelectedDate', date: shiftDateKey(date, 1) })}
        >
          ›
        </button>
      </div>

      {dates.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              className={`tap shrink-0 px-4 text-base ${
                d === date ? 'bg-brand-500 text-ink-900' : 'tap-ghost'
              }`}
              onClick={() => dispatch({ type: 'setSelectedDate', date: d })}
            >
              {formatLongDayLabel(d).split(',')[1]?.trim() ?? d}
            </button>
          ))}
        </div>
      ) : null}

      <div className="card flex items-center justify-around text-center" data-testid="day-counts">
        <div>
          <p className="text-3xl font-black" data-testid="runs-left">
            {summary.runsLeft}
          </p>
          <p className="text-sm uppercase tracking-wide text-slate-400">Runs left</p>
        </div>
        <div>
          <p className="text-3xl font-black" data-testid="accounts-left">
            {summary.accountsLeft}
          </p>
          <p className="text-sm uppercase tracking-wide text-slate-400">Accounts left</p>
        </div>
        <div>
          <p className="text-3xl font-black">{summary.runsComplete}</p>
          <p className="text-sm uppercase tracking-wide text-slate-400">Done</p>
        </div>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="No runs on this day. Import a schedule or add an appointment by hand."
          action={
            <button type="button" className="tap-primary" onClick={() => onNavigate('import')}>
              Go to Import
            </button>
          }
        />
      ) : null}

      <div className="space-y-3">
        {runs.map((run) => {
          const heads = runPartySize(run, appointmentsById)
          const over = isOverCapacity(run, appointmentsById, state.settings)
          const partners = conflictPartners(run.id)
          const leaveBy = runLeaveByInstant(run, appointmentsById, state.settings)
          return (
            <section
              key={run.id}
              className={`card ${over ? 'border-red-500' : ''}`}
              data-testid={`timeline-run-${run.id}`}
              data-direction={run.direction}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[run.status]}`} />
                    <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
                      {RUN_STATUS_LABEL[run.status]}
                    </p>
                  </div>
                  <h3 className="mt-1 text-2xl font-black">{directionVerb(run.direction)}</h3>
                  <p className="text-base text-slate-400">
                    leave by {formatClock(leaveBy)} · {leaveByLabel(run, leaveBy, now)}
                  </p>
                </div>
                <div className="shrink-0 whitespace-nowrap text-right">
                  <p className="text-2xl font-black">{formatClock(runScheduledInstant(run))}</p>
                  <p className="text-sm text-slate-400">
                    {run.passengers.length} acct · {heads}p
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {run.passengers.map((p) => {
                  const appointment = appointmentsById.get(p.appointmentId)
                  if (!appointment) return null
                  return (
                    <li
                      key={p.appointmentId}
                      className="flex items-center justify-between gap-2 rounded-xl bg-ink-700/60 px-3 py-2"
                    >
                      <span className="truncate text-lg font-semibold">
                        {appointment.accountName}
                      </span>
                      <span className="shrink-0 text-sm text-slate-400">
                        {appointment.partySize}p · {p.state}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {over ? (
                <p className="mt-3 rounded-xl border border-red-500 bg-red-500/15 px-3 py-2 text-base font-bold text-red-300">
                  Over capacity: {heads} people vs {state.settings.vehicleCapacity} seats
                </p>
              ) : null}

              {partners.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-500 bg-amber-500/10 p-3">
                  <p className="text-base font-bold text-amber-300" data-testid="conflict-badge">
                    Overlaps another run — you can't be in two places at once.
                  </p>
                  {partners
                    .filter((p) => p.mergeable)
                    .map((p) => (
                      <button
                        key={p.otherId}
                        type="button"
                        className="tap-secondary mt-2 w-full"
                        data-testid={`merge-conflict-${run.id}`}
                        onClick={() =>
                          dispatch({ type: 'mergeRuns', targetId: run.id, otherId: p.otherId })
                        }
                      >
                        Merge these two runs
                      </button>
                    ))}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="tap-secondary text-base"
                  data-testid={`make-active-${run.id}`}
                  disabled={run.status === 'complete'}
                  onClick={() => {
                    dispatch({ type: 'setActiveRun', runId: run.id })
                    onNavigate('now')
                  }}
                >
                  Make active
                </button>
                <button
                  type="button"
                  className="tap-ghost text-base"
                  data-testid={`merge-open-${run.id}`}
                  onClick={() => setMergeSource(run)}
                >
                  Merge with…
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {dayComplete ? (
        <section className="card" data-testid="day-summary">
          <h3 className="text-2xl font-black">Day complete</h3>
          <p className="mt-2 text-lg text-slate-300">
            {summary.runsComplete} runs · {summary.passengersMoved} passenger trips
          </p>
          {summary.noShows.length > 0 ? (
            <div className="mt-3">
              <p className="label">Missed / no-show</p>
              <ul className="space-y-1">
                {summary.noShows.map((a) => (
                  <li key={a.id} className="rounded-xl bg-ink-700 px-3 py-2 text-base">
                    {a.accountName} — {a.contactName || 'no contact'}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-base text-emerald-300">No missed appointments. Clean day.</p>
          )}
        </section>
      ) : null}

      <Sheet
        open={mergeSource !== null}
        title="Merge into which run?"
        onClose={() => setMergeSource(null)}
      >
        {runs.filter(
          (r) =>
            mergeSource &&
            r.id !== mergeSource.id &&
            r.direction === mergeSource.direction &&
            r.date === mergeSource.date,
        ).length === 0 ? (
          <p className="text-slate-400">
            No other run today goes the same direction, so there's nothing to merge with.
          </p>
        ) : (
          runs
            .filter(
              (r) =>
                mergeSource &&
                r.id !== mergeSource.id &&
                r.direction === mergeSource.direction &&
                r.date === mergeSource.date,
            )
            .map((target) => (
              <button
                key={target.id}
                type="button"
                className="tap-secondary w-full justify-between"
                data-testid={`merge-into-${target.id}`}
                onClick={() => {
                  if (!mergeSource) return
                  dispatch({ type: 'mergeRuns', targetId: target.id, otherId: mergeSource.id })
                  setMergeSource(null)
                }}
              >
                <span>{formatClock(runScheduledInstant(target))}</span>
                <span className="truncate text-slate-400">
                  {target.passengers
                    .map((p) => appointmentsById.get(p.appointmentId)?.accountName)
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </button>
            ))
        )}
      </Sheet>
    </div>
  )
}
