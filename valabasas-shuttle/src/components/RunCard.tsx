import { useMemo, useState } from 'react'
import type { Appointment, PassengerState, Run, Settings } from '../types'
import type { Action } from '../state/reducer'
import { LEAVE_BY_WARNING_MINUTES } from '../lib/defaults'
import { openNavigation, openUrl, telUrl } from '../lib/links'
import { navPlanForRun, shortAddress } from '../lib/navigation'
import {
  RUN_STATUS_LABEL,
  allPassengersResolved,
  directionVerb,
  isOverCapacity,
  primaryActionLabel,
  runAppointments,
  runLeaveByInstant,
  runPartySize,
  runScheduledInstant,
  runStops,
} from '../lib/runs'
import { formatClock, formatCountdown, minutesUntil } from '../lib/time'
import { MessageSheet } from './MessageSheet'
import { PassengerRow } from './PassengerRow'
import { Sheet } from './ui'

export type LeaveByTone = 'calm' | 'warn' | 'late'

export const leaveByTone = (leaveBy: Date, now: Date, status: Run['status']): LeaveByTone => {
  if (status !== 'upcoming') return 'calm'
  const minutes = minutesUntil(leaveBy, now)
  if (minutes < 0) return 'late'
  if (minutes <= LEAVE_BY_WARNING_MINUTES) return 'warn'
  return 'calm'
}

const TONE_RING: Record<LeaveByTone, string> = {
  calm: 'border-ink-600',
  warn: 'border-amber-500 shadow-lg shadow-amber-500/10',
  late: 'border-red-500 shadow-lg shadow-red-500/10',
}

const TONE_TEXT: Record<LeaveByTone, string> = {
  calm: 'text-brand-400',
  warn: 'text-amber-300',
  late: 'text-red-400',
}

export const RunCard = ({
  run,
  appointmentsById,
  settings,
  dispatch,
  allRuns,
  now,
}: {
  run: Run
  appointmentsById: Map<string, Appointment>
  settings: Settings
  dispatch: (action: Action) => void
  allRuns: Run[]
  now: Date
}) => {
  const [messageTarget, setMessageTarget] = useState<Appointment[] | null>(null)
  const [callPickerOpen, setCallPickerOpen] = useState(false)
  const [moreFor, setMoreFor] = useState<Appointment | null>(null)
  const [moveFor, setMoveFor] = useState<Appointment | null>(null)
  const [splitPickerOpen, setSplitPickerOpen] = useState(false)

  const appointments = useMemo(
    () => runAppointments(run, appointmentsById),
    [run, appointmentsById],
  )
  const contactable = appointments.filter((a) => a.phone)
  const heads = runPartySize(run, appointmentsById)
  const accounts = run.passengers.filter((p) => p.state !== 'noShow').length
  const over = isOverCapacity(run, appointmentsById, settings)
  const stops = runStops(run, appointmentsById, settings)
  const leaveBy = runLeaveByInstant(run, appointmentsById, settings)
  const tone = leaveByTone(leaveBy, now, run.status)
  const countdown = minutesUntil(leaveBy, now)
  const nav = navPlanForRun(run, appointmentsById, settings)
  const actionLabel = primaryActionLabel(run)
  const boardingOpen = run.status === 'arrived'
  const canComplete = run.status !== 'arrived' || allPassengersResolved(run)

  const where =
    run.direction === 'toSuite'
      ? stops.map(shortAddress).join(' + ') || 'pickup'
      : shortAddress(settings.suiteAddress) || 'the suite'

  return (
    <section
      className={`card border-2 ${TONE_RING[tone]}`}
      data-testid={`run-card-${run.id}`}
      data-run-status={run.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
            {RUN_STATUS_LABEL[run.status]}
          </p>
          <h2 className="text-huge font-black leading-none">{directionVerb(run.direction)}</h2>
          <p className="mt-1 text-xl text-slate-300">{where}</p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {run.direction === 'toSuite' ? 'At suite by' : 'Leaves suite'}
          </p>
          <p className="text-2xl font-black">{formatClock(runScheduledInstant(run))}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`text-3xl font-black ${TONE_TEXT[tone]}`} data-testid="leave-by-countdown">
          {run.status === 'upcoming'
            ? countdown >= 0
              ? `Leave in ${formatCountdown(countdown)}`
              : `Leave now — ${formatCountdown(Math.abs(countdown))} late`
            : RUN_STATUS_LABEL[run.status]}
        </span>
        <span className="text-lg text-slate-400">
          leave by {formatClock(leaveBy)}
        </span>
      </div>

      <p className="mt-2 text-xl font-bold text-slate-200" data-testid="run-heads">
        {accounts} {accounts === 1 ? 'account' : 'accounts'} · {heads}{' '}
        {heads === 1 ? 'person' : 'people'}
      </p>

      {over ? (
        <div className="mt-3 rounded-2xl border-2 border-red-500 bg-red-500/15 p-3" data-testid="capacity-warning">
          <p className="text-lg font-black text-red-300">
            OVER CAPACITY — {heads} people, {settings.vehicleCapacity} seats
          </p>
          <p className="mt-1 text-sm text-red-200/80">
            Split this run or you'll be short {heads - settings.vehicleCapacity} seat
            {heads - settings.vehicleCapacity === 1 ? '' : 's'} in the parking lot.
          </p>
          {run.passengers.length > 1 ? (
            <button
              type="button"
              className="tap-danger mt-3 w-full"
              data-testid="split-shortcut"
              onClick={() => setSplitPickerOpen(true)}
            >
              Split this run
            </button>
          ) : null}
        </div>
      ) : null}

      {actionLabel ? (
        <button
          type="button"
          className="tap-primary mt-4"
          data-testid="primary-action"
          disabled={run.status === 'arrived' && !canComplete}
          onClick={() => dispatch({ type: 'advanceRun', runId: run.id })}
        >
          {actionLabel}
        </button>
      ) : (
        <p className="mt-4 rounded-2xl bg-emerald-500/15 p-3 text-center text-lg font-bold text-emerald-300">
          Run complete
        </p>
      )}

      {run.status === 'arrived' && !canComplete ? (
        <p className="mt-2 text-center text-base text-amber-300">
          Tap each account as they get in — or mark a no-show to leave without them.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="tap tap-secondary px-2 text-sm"
          data-testid="navigate"
          data-nav-url={nav.target?.appUrl ?? nav.target?.webUrl ?? ''}
          data-nav-web-url={nav.target?.webUrl ?? ''}
          disabled={!nav.target}
          onClick={() => nav.target && openNavigation(nav.target)}
        >
          Navigate
        </button>
        <button
          type="button"
          className="tap tap-secondary px-2 text-sm"
          data-testid="text-everyone"
          disabled={contactable.length === 0}
          onClick={() => setMessageTarget(appointments)}
        >
          {appointments.length > 1 ? 'Text all' : 'Text'}
        </button>
        <button
          type="button"
          className="tap tap-secondary px-2 text-sm"
          data-testid="call-run"
          disabled={contactable.length === 0}
          onClick={() => {
            if (contactable.length === 1) {
              const url = telUrl(contactable[0].phone)
              if (url) openUrl(url)
            } else {
              setCallPickerOpen(true)
            }
          }}
        >
          Call
        </button>
      </div>

      {nav.blockedReason ? (
        <p className="mt-2 text-center text-sm text-amber-300">{nav.blockedReason}</p>
      ) : nav.target && nav.target.stops.length > 1 ? (
        <p className="mt-2 text-center text-sm text-slate-400">
          {nav.target.stops.length}-stop route: {nav.target.stops.map(shortAddress).join(' → ')}
        </p>
      ) : nav.target ? (
        <p className="mt-2 text-center text-sm text-slate-400">{nav.target.label}</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {run.passengers.map((passenger) => {
          const appointment = appointmentsById.get(passenger.appointmentId)
          if (!appointment) return null
          return (
            <PassengerRow
              key={passenger.appointmentId}
              run={run}
              appointment={appointment}
              state={passenger.state}
              showBoarding={boardingOpen}
              onBoard={(next: PassengerState) =>
                dispatch({
                  type: 'setPassengerState',
                  runId: run.id,
                  appointmentId: appointment.id,
                  state: next,
                })
              }
              onText={() => setMessageTarget([appointment])}
              onNoShow={() =>
                dispatch({ type: 'noShow', runId: run.id, appointmentId: appointment.id })
              }
              onMore={() => setMoreFor(appointment)}
            />
          )
        })}
      </div>

      <label className="mt-4 block">
        <span className="label">Notes for this run</span>
        <textarea
          className="field py-3"
          rows={2}
          placeholder="Jot anything here — saves as you type."
          value={run.notes}
          data-testid="run-notes"
          onChange={(e) => dispatch({ type: 'setRunNotes', runId: run.id, notes: e.target.value })}
        />
      </label>

      <MessageSheet
        open={messageTarget !== null}
        onClose={() => setMessageTarget(null)}
        appointments={messageTarget ?? []}
        settings={settings}
        title={messageTarget && messageTarget.length > 1 ? 'Text everyone' : 'Send a text'}
      />

      <Sheet open={callPickerOpen} title="Who are you calling?" onClose={() => setCallPickerOpen(false)}>
        {contactable.map((appointment) => (
          <button
            key={appointment.id}
            type="button"
            className="tap-secondary w-full justify-between"
            data-testid={`call-pick-${appointment.id}`}
            onClick={() => {
              const url = telUrl(appointment.phone)
              setCallPickerOpen(false)
              if (url) openUrl(url)
            }}
          >
            <span>{appointment.accountName}</span>
            <span className="text-slate-400">{appointment.contactName}</span>
          </button>
        ))}
      </Sheet>

      <Sheet
        open={moreFor !== null}
        title={moreFor?.accountName ?? ''}
        onClose={() => setMoreFor(null)}
      >
        <button
          type="button"
          className="tap-secondary w-full"
          data-testid="split-out"
          disabled={run.passengers.length < 2}
          onClick={() => {
            if (!moreFor) return
            dispatch({ type: 'splitRun', runId: run.id, appointmentId: moreFor.id })
            setMoreFor(null)
          }}
        >
          Split into its own run
        </button>
        <button
          type="button"
          className="tap-secondary w-full"
          data-testid="move-open"
          onClick={() => {
            setMoveFor(moreFor)
            setMoreFor(null)
          }}
        >
          Move to another run
        </button>
        <button
          type="button"
          className="tap-danger w-full"
          disabled={!moreFor || run.passengers.find((p) => p.appointmentId === moreFor.id)?.state === 'noShow'}
          onClick={() => {
            if (!moreFor) return
            dispatch({ type: 'noShow', runId: run.id, appointmentId: moreFor.id })
            setMoreFor(null)
          }}
        >
          No-show — leave without them
        </button>
      </Sheet>

      <Sheet
        open={moveFor !== null}
        title={`Move ${moveFor?.accountName ?? ''}`}
        onClose={() => setMoveFor(null)}
      >
        {allRuns.filter((r) => r.id !== run.id && r.direction === run.direction && r.date === run.date)
          .length === 0 ? (
          <p className="text-slate-400">
            There's no other {run.direction === 'toSuite' ? 'pickup' : 'return'} run today to move
            them into. Split them out instead.
          </p>
        ) : (
          allRuns
            .filter((r) => r.id !== run.id && r.direction === run.direction && r.date === run.date)
            .map((target) => (
              <button
                key={target.id}
                type="button"
                className="tap-secondary w-full justify-between"
                data-testid={`move-to-${target.id}`}
                onClick={() => {
                  if (!moveFor) return
                  dispatch({
                    type: 'moveAppointment',
                    appointmentId: moveFor.id,
                    fromRunId: run.id,
                    toRunId: target.id,
                  })
                  setMoveFor(null)
                }}
              >
                <span>{formatClock(runScheduledInstant(target))}</span>
                <span className="text-slate-400">
                  {target.passengers.length}{' '}
                  {target.passengers.length === 1 ? 'account' : 'accounts'}
                </span>
              </button>
            ))
        )}
      </Sheet>
      <Sheet open={splitPickerOpen} title="Split this run" onClose={() => setSplitPickerOpen(false)}>
        <p className="text-slate-400">Pick who rides separately. They get their own run.</p>
        {appointments.map((appointment) => (
          <button
            key={appointment.id}
            type="button"
            className="tap-secondary w-full justify-between"
            data-testid={`split-pick-${appointment.id}`}
            onClick={() => {
              dispatch({ type: 'splitRun', runId: run.id, appointmentId: appointment.id })
              setSplitPickerOpen(false)
            }}
          >
            <span className="truncate">{appointment.accountName}</span>
            <span className="text-slate-400">{appointment.partySize}p</span>
          </button>
        ))}
      </Sheet>
    </section>
  )
}
