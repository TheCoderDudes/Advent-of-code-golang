import { describe, expect, it } from 'vitest'
import { appointmentsToCsv, parseAppointmentsCsv } from '../csv'
import { toE164, formatPhone } from '../phone'
import { normaliseDate, normaliseTime } from '../time'
import { appt, settings } from './factory'

const TODAY = '2026-08-10'

describe('phone normalisation', () => {
  it.each([
    ['(702) 555-0118', '+17025550118'],
    ['702-555-0118', '+17025550118'],
    ['702 555 0118', '+17025550118'],
    ['7025550118', '+17025550118'],
    ['17025550118', '+17025550118'],
    ['+17025550118', '+17025550118'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalises %s', (input, expected) => {
    expect(toE164(input)).toBe(expected)
  })

  it.each(['', '   ', 'call the booth', '555-0118', 'x1234'])(
    'refuses to guess at %s',
    (input) => {
      expect(toE164(input)).toBe('')
    },
  )

  it('formats US numbers for display', () => {
    expect(formatPhone('+17025550118')).toBe('(702) 555-0118')
    expect(formatPhone('')).toBe('')
  })
})

describe('date and time tolerance', () => {
  it.each([
    ['8:00 AM', '08:00'],
    ['8:00am', '08:00'],
    ['8am', '08:00'],
    ['08:00', '08:00'],
    ['14:30', '14:30'],
    ['2:30 PM', '14:30'],
    ['0800', '08:00'],
  ])('reads %s', (input, expected) => {
    expect(normaliseTime(input)).toBe(expected)
  })

  it.each([
    ['2026-08-10', '2026-08-10'],
    ['8/10/2026', '2026-08-10'],
    ['8/10/26', '2026-08-10'],
    ['Aug 10 2026', '2026-08-10'],
    ['8/10', '2026-08-10'],
  ])('reads %s', (input, expected) => {
    expect(normaliseDate(input, TODAY)).toBe(expected)
  })

  it('returns empty for junk instead of guessing', () => {
    expect(normaliseTime('sometime')).toBe('')
    expect(normaliseDate('next tuesday', TODAY)).toBe('')
  })
})

describe('CSV import', () => {
  const csv = [
    'Date,Time,Account,Contact,Phone,Party Size,Pickup Location,Duration,Notes',
    '8/10/2026,8:00 AM,Denim Republic,Marcus Hale,(702) 555-0118,2,Las Vegas Convention Center,60,First look',
    '8/10/2026,8:00 AM,Westgate Apparel,Priya Nandi,702-555-0142,3,,90,',
  ].join('\n')

  it('parses a well-formed sheet', () => {
    const { rows, issues } = parseAppointmentsCsv(csv, settings(), TODAY)
    expect(issues).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      accountName: 'Denim Republic',
      contactName: 'Marcus Hale',
      phone: '+17025550118',
      partySize: 2,
      date: '2026-08-10',
      startTime: '08:00',
      durationMinutes: 60,
    })
    // Blank pickup falls back to the convention center.
    expect(rows[1].pickupLocation).toBe(settings().conventionCenterAddress)
  })

  it('matches headers regardless of case, spacing and wording', () => {
    const odd = [
      'DATE , start time,COMPANY,Buyer Name,Cell Phone,Pax,Pickup,Mins,Comments',
      '8/10/2026,8:00 AM,Denim Republic,Marcus Hale,7025550118,2,LVCC,45,ok',
    ].join('\n')
    const { rows, issues } = parseAppointmentsCsv(odd, settings(), TODAY)
    expect(issues).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      accountName: 'Denim Republic',
      contactName: 'Marcus Hale',
      phone: '+17025550118',
      partySize: 2,
      durationMinutes: 45,
      pickupLocation: 'LVCC',
    })
  })

  it('calls out rows it could not read and still imports the rest', () => {
    const messy = [
      'Date,Time,Account,Contact,Phone,Party Size',
      '8/10/2026,8:00 AM,Good Row,Ann,7025550118,2',
      ',8:00 AM,No Date,Bob,7025550118,2',
      '8/10/2026,whenever,Bad Time,Cal,7025550118,2',
      '8/10/2026,9:00 AM,,Dee,7025550118,2',
    ].join('\n')
    const { rows, issues } = parseAppointmentsCsv(messy, settings(), TODAY)
    expect(rows.map((r) => r.accountName)).toEqual(['Good Row'])
    expect(issues).toHaveLength(3)
    expect(issues.map((i) => i.rowNumber)).toEqual([3, 4, 5])
    expect(issues[1].reason).toContain('unreadable time')
  })

  it('imports a bad phone number as blank rather than dropping the row', () => {
    const messy = [
      'Date,Time,Account,Contact,Phone,Party Size',
      '8/10/2026,8:00 AM,No Phone Co,Ann,ask at booth,2',
    ].join('\n')
    const { rows, issues } = parseAppointmentsCsv(messy, settings(), TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0].phone).toBe('')
    expect(issues[0].reason).toContain("isn't a usable number")
  })

  it('falls back to defaults for missing party size and duration', () => {
    const sparse = [
      'Date,Time,Account',
      '8/10/2026,8:00 AM,Solo Buyer',
    ].join('\n')
    const { rows } = parseAppointmentsCsv(sparse, settings({ defaultDurationMinutes: 45 }), TODAY)
    expect(rows[0].partySize).toBe(1)
    expect(rows[0].durationMinutes).toBe(45)
  })

  it('flags a row whose address has an unquoted comma', () => {
    const shifted = [
      'Date,Time,Account,Contact,Phone,Party Size,Pickup Location,Duration,Notes',
      '8/10/2026,8:00 AM,Acme,Ann,7025550118,2,Las Vegas Convention Center, 3150 Paradise Rd,60,',
    ].join('\n')
    const { issues } = parseAppointmentsCsv(shifted, settings(), TODAY)
    expect(issues[0].reason).toContain('unquoted comma')
  })

  it('handles a properly quoted address containing commas', () => {
    const quoted = [
      'Date,Time,Account,Contact,Phone,Party Size,Pickup Location,Duration,Notes',
      '8/10/2026,8:00 AM,Acme,Ann,7025550118,2,"Las Vegas Convention Center, 3150 Paradise Rd",60,',
    ].join('\n')
    const { rows, issues } = parseAppointmentsCsv(quoted, settings(), TODAY)
    expect(issues).toHaveLength(0)
    expect(rows[0].pickupLocation).toBe('Las Vegas Convention Center, 3150 Paradise Rd')
    expect(rows[0].durationMinutes).toBe(60)
  })

  it('names the required columns a sheet is missing instead of failing every row', () => {
    const wrongShape = [
      'When,Who,Booth,Headcount',
      'Tuesday 8am,Denim Republic,C-12,2',
    ].join('\n')
    const preview = parseAppointmentsCsv(wrongShape, settings(), TODAY)
    // "When" maps to nothing, "Who" is not an account alias.
    expect(preview.missingColumns).toEqual(['Date', 'Time', 'Account'])
    expect(preview.headers).toEqual(['When', 'Who', 'Booth', 'Headcount'])
    expect(preview.rows).toHaveLength(0)
    // One clear explanation, not one error per row.
    expect(preview.issues).toHaveLength(0)
  })

  it('reports only the required column that is actually missing', () => {
    const noAccount = ['Date,Time,Contact', '8/10/2026,8:00 AM,Ann'].join('\n')
    expect(parseAppointmentsCsv(noAccount, settings(), TODAY).missingColumns).toEqual(['Account'])
  })

  it('is happy as long as the three required columns are present under any alias', () => {
    const aliased = ['Day,Start,Company', '8/10/2026,8:00 AM,Denim Republic'].join('\n')
    const preview = parseAppointmentsCsv(aliased, settings(), TODAY)
    expect(preview.missingColumns).toEqual([])
    expect(preview.rows).toHaveLength(1)
  })

  it('reports columns it ignored so typos are visible', () => {
    const extra = ['Date,Time,Account,Booth Number', '8/10/2026,8:00 AM,Acme,C-12'].join('\n')
    expect(parseAppointmentsCsv(extra, settings(), TODAY).unmappedHeaders).toEqual(['Booth Number'])
  })

  it('round-trips through export', () => {
    const original = [appt({ accountName: 'Round, Trip Co', notes: 'has "quotes"' })]
    const csvText = appointmentsToCsv(original)
    const { rows, issues } = parseAppointmentsCsv(csvText, settings(), TODAY)
    expect(issues).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      accountName: original[0].accountName,
      notes: original[0].notes,
      phone: original[0].phone,
      partySize: original[0].partySize,
      date: original[0].date,
      startTime: original[0].startTime,
      durationMinutes: original[0].durationMinutes,
    })
  })
})
