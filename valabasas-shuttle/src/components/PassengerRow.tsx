import type { Appointment, PassengerState, Run } from '../types'
import { formatPhone } from '../lib/phone'
import { openUrl, telUrl } from '../lib/links'

const STATE_STYLES: Record<PassengerState, string> = {
  waiting: 'bg-amber-500/20 text-amber-300',
  onboard: 'bg-emerald-500/20 text-emerald-300',
  dropped: 'bg-slate-500/20 text-slate-300',
  noShow: 'bg-red-500/20 text-red-300',
}

const STATE_LABEL: Record<PassengerState, string> = {
  waiting: 'Waiting',
  onboard: 'Onboard',
  dropped: 'Dropped',
  noShow: 'No-show',
}

export const PassengerStateChip = ({ state }: { state: PassengerState }) => (
  <span className={`chip ${STATE_STYLES[state]}`}>{STATE_LABEL[state]}</span>
)

export const PassengerRow = ({
  run,
  appointment,
  state,
  onText,
  onNoShow,
  onMore,
  showBoarding,
  onBoard,
}: {
  run: Run
  appointment: Appointment
  state: PassengerState
  onText: () => void
  onNoShow: () => void
  onMore: () => void
  /** The boarding checklist only appears once the driver has arrived. */
  showBoarding: boolean
  onBoard: (next: PassengerState) => void
}) => {
  const callable = Boolean(appointment.phone)
  const finished = run.status === 'complete'

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-700/60 p-3" data-testid={`passenger-${appointment.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-xl font-bold leading-tight">
            {appointment.accountName}
          </span>
          <span className="block truncate text-base text-slate-400">
            {appointment.contactName || 'No contact name'} · {appointment.partySize}{' '}
            {appointment.partySize === 1 ? 'person' : 'people'}
          </span>
          {appointment.phone ? (
            <span className="block text-sm text-slate-500">{formatPhone(appointment.phone)}</span>
          ) : (
            <span className="block text-sm text-red-400">No usable phone number</span>
          )}
        </div>
        <PassengerStateChip state={state} />
      </div>

      {showBoarding && state !== 'noShow' && state !== 'dropped' ? (
        <button
          type="button"
          data-testid={`board-${appointment.id}`}
          onClick={() => onBoard(state === 'onboard' ? 'waiting' : 'onboard')}
          className={`tap mt-3 w-full ${
            state === 'onboard' ? 'bg-emerald-600 text-white' : 'tap-ghost'
          }`}
        >
          {state === 'onboard' ? '✓ In the car' : 'Mark onboard'}
        </button>
      ) : null}

      {finished ? null : (
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button
            type="button"
            className="tap tap-secondary px-2 text-sm"
            disabled={!callable}
            onClick={() => {
              const url = telUrl(appointment.phone)
              if (url) openUrl(url)
            }}
            data-testid={`call-${appointment.id}`}
            data-tel-url={telUrl(appointment.phone) ?? ''}
          >
            Call
          </button>
          <button
            type="button"
            className="tap tap-secondary px-2 text-sm"
            disabled={!callable}
            onClick={onText}
            data-testid={`text-${appointment.id}`}
          >
            Text
          </button>
          <button
            type="button"
            className="tap tap-ghost px-2 text-sm"
            disabled={state === 'noShow'}
            onClick={onNoShow}
            data-testid={`noshow-${appointment.id}`}
          >
            No-show
          </button>
          <button
            type="button"
            className="tap tap-ghost px-2 text-sm"
            onClick={onMore}
            data-testid={`more-${appointment.id}`}
          >
            More
          </button>
        </div>
      )}
    </div>
  )
}
