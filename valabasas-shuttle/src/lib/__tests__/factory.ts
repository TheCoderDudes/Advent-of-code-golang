import type { Appointment, Settings } from '../../types'
import { DEFAULT_SETTINGS, LVCC } from '../defaults'

export const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  suiteAddress: 'Wynn Las Vegas, 3131 S Las Vegas Blvd, Las Vegas, NV 89109',
  ...overrides,
})

let seq = 0

export const appt = (overrides: Partial<Appointment> = {}): Appointment => {
  seq += 1
  return {
    id: `a${seq}`,
    accountName: `Account ${seq}`,
    contactName: `Contact ${seq}`,
    phone: '+17025550100',
    partySize: 2,
    date: '2026-08-10',
    startTime: '08:00',
    durationMinutes: 60,
    pickupLocation: LVCC,
    dropoffLocation: '',
    notes: '',
    status: 'scheduled',
    ...overrides,
  }
}
