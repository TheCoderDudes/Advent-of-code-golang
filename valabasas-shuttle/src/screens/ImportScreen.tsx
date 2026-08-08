import { useRef, useState } from 'react'
import { appointmentsToCsv, downloadCsv, parseAppointmentsCsv, type ImportPreview } from '../lib/csv'
import { formatPhone } from '../lib/phone'
import { formatTime } from '../lib/time'
import { useStore } from '../state/store'
import type { Tab } from '../App'

export const ImportScreen = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const { state, dispatch } = useStore()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const readFile = async (file: File) => {
    const text = await file.text()
    setFileName(file.name)
    setPreview(parseAppointmentsCsv(text, state.settings))
  }

  const commit = (mode: 'replace' | 'append') => {
    if (!preview || preview.rows.length === 0) return
    dispatch(
      mode === 'replace'
        ? { type: 'replaceAppointments', appointments: preview.rows }
        : { type: 'appendAppointments', appointments: preview.rows },
    )
    dispatch({ type: 'setOnboarded' })
    if (preview.rows[0]) dispatch({ type: 'setSelectedDate', date: preview.rows[0].date })
    setPreview(null)
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
    onNavigate('now')
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="text-2xl font-black">Import a CSV</h2>
        <p className="mt-1 text-base text-slate-400">
          Export your Google Sheet as CSV and drop it in. Headers are matched loosely —{' '}
          <span className="text-slate-300">
            Date, Time, Account, Contact, Phone, Party Size, Pickup Location, Duration, Notes
          </span>
          .
        </p>
        <label className="tap-primary mt-4 cursor-pointer">
          Choose CSV file
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            data-testid="csv-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
        </label>
        {fileName ? <p className="mt-2 text-center text-sm text-slate-400">{fileName}</p> : null}
      </section>

      {preview ? (
        <section className="card" data-testid="import-preview">
          <h3 className="text-xl font-black">
            {preview.rows.length} {preview.rows.length === 1 ? 'row' : 'rows'} ready
          </h3>

          {preview.unmappedHeaders.length > 0 ? (
            <p className="mt-2 rounded-xl bg-ink-700 px-3 py-2 text-sm text-slate-400">
              Ignored columns: {preview.unmappedHeaders.join(', ')}
            </p>
          ) : null}

          <div className="mt-3 max-h-80 overflow-auto rounded-2xl border border-ink-600">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-700 text-slate-400">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">Contact</th>
                  <th className="p-2">Party</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id} className="border-t border-ink-600">
                    <td className="whitespace-nowrap p-2">
                      {row.date.slice(5)} {formatTime(row.date, row.startTime)}
                    </td>
                    <td className="p-2">{row.accountName}</td>
                    <td className="p-2">
                      {row.contactName}
                      <span className="block text-xs text-slate-500">
                        {formatPhone(row.phone) || 'no phone'}
                      </span>
                    </td>
                    <td className="p-2">{row.partySize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.issues.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-500 bg-amber-500/10 p-3" data-testid="import-issues">
              <p className="font-bold text-amber-300">
                {preview.issues.length} {preview.issues.length === 1 ? 'row needs' : 'rows need'} a look
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-200/90">
                {preview.issues.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${index}`}>
                    Row {issue.rowNumber}: {issue.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <button
              type="button"
              className="tap-primary"
              data-testid="import-replace"
              disabled={preview.rows.length === 0}
              onClick={() => commit('replace')}
            >
              Replace everything ({state.appointments.length} existing)
            </button>
            <button
              type="button"
              className="tap-secondary w-full"
              data-testid="import-append"
              disabled={preview.rows.length === 0}
              onClick={() => commit('append')}
            >
              Merge — add to what I have
            </button>
            <button type="button" className="tap-ghost w-full" onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3 className="text-xl font-black">Export</h3>
        <p className="mt-1 text-base text-slate-400">
          Back up your day, or hand it to whoever is driving tomorrow.
        </p>
        <button
          type="button"
          className="tap-secondary mt-3 w-full"
          data-testid="export-csv"
          disabled={state.appointments.length === 0}
          onClick={() =>
            downloadCsv(
              `valabasas-appointments-${state.selectedDate}.csv`,
              appointmentsToCsv(state.appointments),
            )
          }
        >
          Export CSV ({state.appointments.length})
        </button>
      </section>
    </div>
  )
}
