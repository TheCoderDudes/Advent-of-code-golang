import { addMinutes, differenceInMinutes, format, parse, isValid } from 'date-fns'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

/**
 * Every date/time in this app is Las Vegas show-floor time. The driver's phone
 * might be on any timezone (or travelling); the schedule never is.
 */
export const TZ = 'America/Los_Angeles'

/** yyyy-MM-dd for an instant, in show time. */
export const toDateKey = (instant: Date = new Date()): string =>
  formatInTimeZone(instant, TZ, 'yyyy-MM-dd')

/** HH:mm for an instant, in show time. */
export const toTimeKey = (instant: Date = new Date()): string =>
  formatInTimeZone(instant, TZ, 'HH:mm')

/** Turn a show-time wall clock (yyyy-MM-dd + HH:mm) into a real instant. */
export const zonedInstant = (date: string, time: string): Date =>
  fromZonedTime(`${date}T${normaliseTime(time) || '00:00'}:00`, TZ)

/** "now", expressed as a Date whose local fields read as show time. */
export const showNow = (instant: Date = new Date()): Date => toZonedTime(instant, TZ)

export const formatTime = (date: string, time: string): string =>
  formatInTimeZone(zonedInstant(date, time), TZ, 'h:mm a')

export const formatClock = (instant: Date): string => formatInTimeZone(instant, TZ, 'h:mm a')

export const formatDayLabel = (date: string): string =>
  formatInTimeZone(zonedInstant(date, '12:00'), TZ, 'EEE MMM d')

export const formatLongDayLabel = (date: string): string =>
  formatInTimeZone(zonedInstant(date, '12:00'), TZ, 'EEEE, MMMM d')

/** Shift a yyyy-MM-dd date key by whole days without tripping over DST. */
export const shiftDateKey = (date: string, days: number): string =>
  toDateKey(addMinutes(zonedInstant(date, '12:00'), days * 24 * 60))

/** HH:mm plus minutes, wrapped inside the same day's clock face. */
export const addMinutesToTime = (time: string, minutes: number): string => {
  const total = timeToMinutes(time) + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  return minutesToTime(wrapped)
}

export const timeToMinutes = (time: string): number => {
  const normalised = normaliseTime(time)
  if (!normalised) return 0
  const [h, m] = normalised.split(':')
  return Number(h) * 60 + Number(m)
}

export const minutesToTime = (minutes: number): string => {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const minutesUntil = (target: Date, from: Date = new Date()): number =>
  differenceInMinutes(target, from)

/** "12 min", "1h 05m", "-4 min" — short enough to read at a red light. */
export const formatCountdown = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : ''
  const abs = Math.abs(minutes)
  if (abs < 60) return `${sign}${abs} min`
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, '0')}m`
}

const TIME_PATTERNS = [
  'H:mm',
  'HH:mm',
  'h:mm a',
  'h:mma',
  'h a',
  'ha',
  'h:mm aaa',
  'HHmm',
  'H.mm',
  'h.mm a',
]

/**
 * Accept whatever a spreadsheet threw at us ("8:00 AM", "8am", "0800", "14:30")
 * and return HH:mm, or '' when it is not a time at all.
 */
export const normaliseTime = (raw: string): string => {
  const input = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!input) return ''

  const direct = /^(\d{1,2}):(\d{2})$/.exec(input)
  if (direct) {
    const h = Number(direct[1])
    const m = Number(direct[2])
    if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const reference = new Date(2000, 0, 1)
  for (const pattern of TIME_PATTERNS) {
    for (const candidate of [input, input.toUpperCase(), input.toLowerCase()]) {
      const parsed = parse(candidate, pattern, reference)
      if (isValid(parsed) && parsed.getFullYear() === 2000 && parsed.getMonth() === 0) {
        return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
      }
    }
  }
  return ''
}

const DATE_PATTERNS = ['yyyy-MM-dd', 'M/d/yyyy', 'M/d/yy', 'MMM d yyyy', 'MMMM d yyyy', 'M-d-yyyy']

/**
 * Accept common spreadsheet date spellings and return yyyy-MM-dd.
 * Bare "M/d" is resolved against the current show year.
 */
export const normaliseDate = (raw: string, today: string = toDateKey()): string => {
  const input = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
  if (!input) return ''

  const year = today.slice(0, 4)
  const bare = /^(\d{1,2})[/-](\d{1,2})$/.exec(input)
  const candidates = bare ? [`${input.replace('-', '/')}/${year}`, input] : [input]

  for (const candidate of candidates) {
    for (const pattern of DATE_PATTERNS) {
      const parsed = parse(candidate, pattern, new Date(2000, 0, 1))
      // The parsed value carries the wall-clock date the sheet meant, so read its
      // local fields directly — converting through a timezone would shift the day.
      // The year guard stops "8/10/26" matching M/d/yyyy as the year 26.
      if (isValid(parsed) && parsed.getFullYear() >= 1900) return format(parsed, 'yyyy-MM-dd')
    }
  }
  return ''
}
