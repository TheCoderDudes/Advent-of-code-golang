import { useMemo, useState } from 'react'
import type { Appointment } from '../types'
import { EmptyState, Field, Sheet } from '../components/ui'
import { newId } from '../lib/id'
import { formatPhone, toE164 } from '../lib/phone'
import { appointmentEndTime } from '../lib/runs'
import { formatLongDayLabel, formatTime, normaliseTime, toDateKey } from '../lib/time'
import { useStore } from '../state/store'
import type { Tab } from '../App'

const blankAppointment = (date: string, duration: number, pickup: string): Appointment => ({
  id: newId('appt'),
  accountName: '',
  contactName: '',
  phone: '',
  partySize: 1,
  date,
  startTime: '09:00',
  durationMinutes: duration,
  pickupLocation: pickup,
  dropoffLocation: '',
  notes: '',
  status: 'scheduled',
})

export const AccountsScreen = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [phoneInput, setPhoneInput] = useState('')

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = state.appointments.filter(
      (a) =>
        !needle ||
        a.accountName.toLowerCase().includes(needle) ||
        a.contactName.toLowerCase().includes(needle),
    )
    const byDate = new Map<string, Appointment[]>()
    for (const appointment of matches) {
      const list = byDate.get(appointment.date) ?? []
      list.push(appointment)
      byDate.set(appointment.date, list)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, items]) => [date, items.sort((a, b) => a.startTime.localeCompare(b.startTime))] as const)
  }, [state.appointments, query])

  const startEdit = (appointment: Appointment) => {
    setEditing(appointment)
    setPhoneInput(appointment.phone)
  }

  const save = () => {
    if (!editing) return
    const trimmed: Appointment = {
      ...editing,
      accountName: editing.accountName.trim() || 'Untitled account',
      startTime: normaliseTime(editing.startTime) || '09:00',
      phone: toE164(phoneInput),
      partySize: Math.max(1, Number(editing.partySize) || 1),
      durationMinutes: Math.max(5, Number(editing.durationMinutes) || state.settings.defaultDurationMinutes),
    }
    dispatch({ type: 'upsertAppointment', appointment: trimmed })
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <input
        className="field"
        placeholder="Search account or contact"
        value={query}
        data-testid="account-search"
        onChange={(e) => setQuery(e.target.value)}
      />

      <button
        type="button"
        className="tap-primary"
        data-testid="add-appointment"
        onClick={() =>
          startEdit(
            blankAppointment(
              state.selectedDate || toDateKey(),
              state.settings.defaultDurationMinutes,
              state.settings.conventionCenterAddress,
            ),
          )
        }
      >
        Add appointment
      </button>

      {state.appointments.length === 0 ? (
        <EmptyState
          title="No appointments"
          body="Import a CSV to fill your week, or add one by hand above."
          action={
            <button type="button" className="tap-secondary" onClick={() => onNavigate('import')}>
              Go to Import
            </button>
          }
        />
      ) : null}

      {grouped.map(([date, items]) => (
        <section key={date} className="space-y-2">
          <h2 className="text-lg font-black uppercase tracking-wide text-slate-400">
            {formatLongDayLabel(date)}
          </h2>
          {items.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              className="card w-full text-left"
              data-testid={`appointment-${appointment.id}`}
              onClick={() => startEdit(appointment)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold">{appointment.accountName}</p>
                  <p className="truncate text-base text-slate-400">
                    {appointment.contactName || 'No contact'} · {appointment.partySize}p
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {formatPhone(appointment.phone) || 'No phone'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-black">
                    {formatTime(appointment.date, appointment.startTime)}
                  </p>
                  <p className="text-sm text-slate-400">
                    to {formatTime(appointment.date, appointmentEndTime(appointment))}
                  </p>
                  {appointment.status !== 'scheduled' ? (
                    <span className="chip mt-1 bg-red-500/20 text-red-300">{appointment.status}</span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </section>
      ))}

      <Sheet open={editing !== null} title="Appointment" onClose={() => setEditing(null)}>
        {editing ? (
          <>
            <Field label="Account">
              <input
                className="field"
                data-testid="edit-account"
                value={editing.accountName}
                onChange={(e) => setEditing({ ...editing, accountName: e.target.value })}
              />
            </Field>
            <Field label="Contact">
              <input
                className="field"
                value={editing.contactName}
                onChange={(e) => setEditing({ ...editing, contactName: e.target.value })}
              />
            </Field>
            <Field label="Phone" hint="Saved as +1XXXXXXXXXX. Leave blank if you don't have one.">
              <input
                className="field"
                inputMode="tel"
                value={phoneInput}
                data-testid="edit-phone"
                onChange={(e) => setPhoneInput(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  className="field"
                  data-testid="edit-date"
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                />
              </Field>
              <Field label="Start">
                <input
                  type="time"
                  className="field"
                  data-testid="edit-time"
                  value={editing.startTime}
                  onChange={(e) => setEditing({ ...editing, startTime: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Party size">
                <input
                  className="field"
                  inputMode="numeric"
                  data-testid="edit-party"
                  value={editing.partySize}
                  onChange={(e) =>
                    setEditing({ ...editing, partySize: Number(e.target.value.replace(/\D/g, '')) || 0 })
                  }
                />
              </Field>
              <Field label="Duration (min)">
                <input
                  className="field"
                  inputMode="numeric"
                  value={editing.durationMinutes}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      durationMinutes: Number(e.target.value.replace(/\D/g, '')) || 0,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Pickup location">
              <input
                className="field"
                value={editing.pickupLocation}
                onChange={(e) => setEditing({ ...editing, pickupLocation: e.target.value })}
              />
            </Field>
            <Field label="Drop-off location" hint="Blank means take them back where you got them.">
              <input
                className="field"
                value={editing.dropoffLocation}
                onChange={(e) => setEditing({ ...editing, dropoffLocation: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className="field py-3"
                rows={2}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <div className="grid grid-cols-3 gap-2">
                {(['scheduled', 'noShow', 'cancelled'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`tap text-base ${
                      editing.status === status ? 'bg-brand-500 text-ink-900' : 'tap-ghost'
                    }`}
                    onClick={() => setEditing({ ...editing, status })}
                  >
                    {status === 'noShow' ? 'No-show' : status}
                  </button>
                ))}
              </div>
            </Field>

            <button type="button" className="tap-primary" data-testid="save-appointment" onClick={save}>
              Save
            </button>
            {state.appointments.some((a) => a.id === editing.id) ? (
              <button
                type="button"
                className="tap-danger w-full"
                data-testid="delete-appointment"
                onClick={() => {
                  dispatch({ type: 'deleteAppointment', appointmentId: editing.id })
                  setEditing(null)
                }}
              >
                Delete appointment
              </button>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </div>
  )
}
