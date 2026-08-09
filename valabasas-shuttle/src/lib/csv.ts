import Papa from 'papaparse'
import type { Appointment, Settings } from '../types'
import { newId } from './id'
import { toE164 } from './phone'
import { normaliseDate, normaliseTime, toDateKey } from './time'

export interface ImportIssue {
  rowNumber: number
  raw: Record<string, string>
  reason: string
}

export interface ImportPreview {
  rows: Appointment[]
  issues: ImportIssue[]
  /** Header names we could not map to anything — surfaced so typos are visible. */
  unmappedHeaders: string[]
  /**
   * Required columns with no matching header at all. When this is non-empty the
   * sheet is mis-shaped, not merely messy, and every row will fail for the same
   * reason — say so once instead of repeating it per row.
   */
  missingColumns: string[]
  /** Every header we read, so the driver can see what the app actually got. */
  headers: string[]
}

const REQUIRED_FIELDS: { field: Field; label: string }[] = [
  { field: 'date', label: 'Date' },
  { field: 'time', label: 'Time' },
  { field: 'account', label: 'Account' },
]

type Field =
  | 'date'
  | 'time'
  | 'account'
  | 'contact'
  | 'phone'
  | 'partySize'
  | 'pickupLocation'
  | 'dropoffLocation'
  | 'duration'
  | 'notes'

/** Tolerant header matching: case, spacing, punctuation and common synonyms. */
const HEADER_ALIASES: Record<Field, string[]> = {
  date: ['date', 'day', 'appointmentdate', 'apptdate', 'meetingdate'],
  time: ['time', 'starttime', 'start', 'appointmenttime', 'appttime', 'meetingtime'],
  account: ['account', 'accountname', 'company', 'store', 'buyer', 'customer', 'client'],
  contact: ['contact', 'contactname', 'name', 'buyername', 'attendee'],
  phone: ['phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'tel', 'telephone'],
  partySize: ['partysize', 'party', 'people', 'pax', 'headcount', 'heads', 'guests', 'size'],
  pickupLocation: ['pickuplocation', 'pickup', 'location', 'from', 'origin', 'pickupaddress'],
  dropoffLocation: ['dropofflocation', 'dropoff', 'droplocation', 'to', 'destination', 'dropoffaddress'],
  duration: ['duration', 'durationminutes', 'minutes', 'length', 'mins'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
}

const canonical = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]/g, '')

const mapHeaders = (headers: string[]): { map: Map<Field, string>; unmapped: string[] } => {
  const map = new Map<Field, string>()
  const unmapped: string[] = []
  for (const header of headers) {
    const key = canonical(header)
    if (!key) continue
    const field = (Object.keys(HEADER_ALIASES) as Field[]).find(
      (f) => !map.has(f) && HEADER_ALIASES[f].includes(key),
    )
    if (field) map.set(field, header)
    else unmapped.push(header)
  }
  return { map, unmapped }
}

const cell = (row: Record<string, string>, map: Map<Field, string>, field: Field): string => {
  const header = map.get(field)
  if (!header) return ''
  return String(row[header] ?? '').trim()
}

export const parseAppointmentsCsv = (
  text: string,
  settings: Settings,
  today: string = toDateKey(),
): ImportPreview => {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })

  const headers = parsed.meta.fields ?? []
  const { map, unmapped } = mapHeaders(headers)
  const missingColumns = REQUIRED_FIELDS.filter(({ field }) => !map.has(field)).map(
    ({ label }) => label,
  )

  const rows: Appointment[] = []
  const issues: ImportIssue[] = []

  // A missing required column fails every row for one reason. Report it once and
  // stop, rather than burying it under a hundred identical per-row errors.
  if (missingColumns.length > 0) {
    return { rows, issues, unmappedHeaders: unmapped, missingColumns, headers }
  }

  parsed.data.forEach((raw, index) => {
    // +2: one for the header row, one because humans count from 1.
    const rowNumber = index + 2
    const account = cell(raw, map, 'account')
    const dateRaw = cell(raw, map, 'date')
    const timeRaw = cell(raw, map, 'time')

    const problems: string[] = []
    // Papa parks surplus columns here, which almost always means an address with
    // an unquoted comma quietly shifted every field after it.
    if (Array.isArray((raw as { __parsed_extra?: unknown[] }).__parsed_extra)) {
      issues.push({
        rowNumber,
        raw,
        reason: 'more columns than the header — check for an unquoted comma',
      })
    }
    if (!account) problems.push('missing account')
    const date = normaliseDate(dateRaw, today)
    if (!date) problems.push(dateRaw ? `unreadable date "${dateRaw}"` : 'missing date')
    const startTime = normaliseTime(timeRaw)
    if (!startTime) problems.push(timeRaw ? `unreadable time "${timeRaw}"` : 'missing time')

    if (problems.length > 0) {
      issues.push({ rowNumber, raw, reason: problems.join(', ') })
      return
    }

    const partySizeRaw = cell(raw, map, 'partySize')
    const partySize = Number.parseInt(partySizeRaw, 10)
    const durationRaw = cell(raw, map, 'duration')
    const duration = Number.parseInt(durationRaw, 10)
    const phoneRaw = cell(raw, map, 'phone')
    const phone = toE164(phoneRaw)
    if (phoneRaw && !phone) {
      // Not fatal: the row still imports, call/text just stay disabled.
      issues.push({
        rowNumber,
        raw,
        reason: `phone "${phoneRaw}" isn't a usable number — imported without it`,
      })
    }

    rows.push({
      id: newId('appt'),
      accountName: account,
      contactName: cell(raw, map, 'contact'),
      phone,
      partySize: Number.isFinite(partySize) && partySize > 0 ? partySize : 1,
      date,
      startTime,
      durationMinutes:
        Number.isFinite(duration) && duration > 0 ? duration : settings.defaultDurationMinutes,
      pickupLocation: cell(raw, map, 'pickupLocation') || settings.conventionCenterAddress,
      dropoffLocation: cell(raw, map, 'dropoffLocation'),
      notes: cell(raw, map, 'notes'),
      status: 'scheduled',
    })
  })

  return { rows, issues, unmappedHeaders: unmapped, missingColumns, headers }
}

export const CSV_HEADERS = [
  'Date',
  'Time',
  'Account',
  'Contact',
  'Phone',
  'Party Size',
  'Pickup Location',
  'Dropoff Location',
  'Duration',
  'Notes',
  'Status',
] as const

export const appointmentsToCsv = (appointments: Appointment[]): string =>
  Papa.unparse({
    fields: [...CSV_HEADERS],
    data: appointments.map((a) => [
      a.date,
      a.startTime,
      a.accountName,
      a.contactName,
      a.phone,
      a.partySize,
      a.pickupLocation,
      a.dropoffLocation,
      a.durationMinutes,
      a.notes,
      a.status,
    ]),
  })

export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
