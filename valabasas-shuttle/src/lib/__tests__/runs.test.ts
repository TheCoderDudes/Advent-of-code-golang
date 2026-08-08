import { describe, expect, it } from 'vitest'
import type { Appointment, Run, Settings } from '../../types'
import {
  byId,
  isOverCapacity,
  leadMinutes,
  mergeRuns,
  moveAppointment,
  reconcileRuns,
  runLeaveByInstant,
  runPartySize,
  runStops,
  splitAppointmentOut,
  findConflicts,
} from '../runs'
import { appt, settings } from './factory'

/** Every scheduled appointment lives in exactly one run per direction. */
const expectInvariants = (appointments: Appointment[], runs: Run[]) => {
  for (const direction of ['toSuite', 'toConventionCenter'] as const) {
    const counts = new Map<string, number>()
    for (const run of runs.filter((r) => r.direction === direction)) {
      for (const passenger of run.passengers) {
        if (passenger.state === 'noShow') continue
        counts.set(passenger.appointmentId, (counts.get(passenger.appointmentId) ?? 0) + 1)
      }
    }
    for (const appointment of appointments) {
      const expected = appointment.status === 'scheduled' ? 1 : 0
      expect(
        counts.get(appointment.id) ?? 0,
        `${appointment.accountName} in ${direction}`,
      ).toBe(expected)
    }
  }
  for (const run of runs) expect(run.passengers.length).toBeGreaterThan(0)
}

const group = (appointments: Appointment[], config: Settings = settings()) =>
  reconcileRuns(appointments, [], config)

describe('auto-grouping', () => {
  it('rides three same-slot accounts together on one pickup run', () => {
    const appointments = [
      appt({ startTime: '08:00', durationMinutes: 60 }),
      appt({ startTime: '08:00', durationMinutes: 90 }),
      appt({ startTime: '08:00', durationMinutes: 120 }),
    ]
    const { runs } = group(appointments)

    const pickups = runs.filter((r) => r.direction === 'toSuite')
    expect(pickups).toHaveLength(1)
    expect(pickups[0].passengers).toHaveLength(3)
    expect(pickups[0].scheduledTime).toBe('08:00')
    expectInvariants(appointments, runs)
  })

  it('keeps the return legs separate when they leave at different times', () => {
    const appointments = [
      appt({ startTime: '08:00', durationMinutes: 60 }), // out at 09:00
      appt({ startTime: '08:00', durationMinutes: 90 }), // out at 09:30
      appt({ startTime: '08:00', durationMinutes: 120 }), // out at 10:00
    ]
    const { runs } = group(appointments)

    const returns = runs.filter((r) => r.direction === 'toConventionCenter')
    expect(returns).toHaveLength(3)
    expect(returns.map((r) => r.scheduledTime)).toEqual(['09:00', '09:30', '10:00'])
  })

  it('groups return legs that are inside the window', () => {
    const appointments = [
      appt({ startTime: '08:00', durationMinutes: 60 }), // out at 09:00
      appt({ startTime: '08:00', durationMinutes: 75 }), // out at 09:15
    ]
    const returns = group(appointments).runs.filter((r) => r.direction === 'toConventionCenter')
    expect(returns).toHaveLength(1)
    // Anchored to the last one out — you can't leave before their meeting ends.
    expect(returns[0].scheduledTime).toBe('09:15')
  })

  it('never silently drops one of two identical start times', () => {
    const appointments = [appt({ startTime: '09:00' }), appt({ startTime: '09:00' })]
    const { runs } = group(appointments)
    const pickups = runs.filter((r) => r.direction === 'toSuite')
    expect(pickups).toHaveLength(1)
    expect(pickups[0].passengers.map((p) => p.appointmentId).sort()).toEqual(
      appointments.map((a) => a.id).sort(),
    )
  })

  it('honours the group window setting', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '08:25' })]
    expect(group(appointments).runs.filter((r) => r.direction === 'toSuite')).toHaveLength(2)
    expect(
      group(appointments, settings({ groupWindowMinutes: 30 })).runs.filter(
        (r) => r.direction === 'toSuite',
      ),
    ).toHaveLength(1)
  })

  it('keeps different days apart', () => {
    const appointments = [
      appt({ date: '2026-08-10', startTime: '08:00' }),
      appt({ date: '2026-08-11', startTime: '08:00' }),
    ]
    expect(group(appointments).runs.filter((r) => r.direction === 'toSuite')).toHaveLength(2)
  })

  it('groups even when that busts capacity, so the warning can fire', () => {
    const config = settings({ vehicleCapacity: 4 })
    const appointments = [appt({ partySize: 3 }), appt({ partySize: 3 })]
    const pickup = group(appointments, config).runs.find((r) => r.direction === 'toSuite')!
    expect(runPartySize(pickup, byId(appointments))).toBe(6)
    expect(isOverCapacity(pickup, byId(appointments), config)).toBe(true)
  })
})

describe('reconciliation', () => {
  it('is stable — running it twice changes nothing', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '08:10' })]
    const first = group(appointments).runs
    const second = reconcileRuns(appointments, first, settings()).runs
    expect(second).toEqual(first)
  })

  it('adds a late-added appointment to the existing suggestion', () => {
    const a = appt({ startTime: '08:00' })
    const first = group([a]).runs
    const b = appt({ startTime: '08:05' })
    const { runs } = reconcileRuns([a, b], first, settings())
    const pickups = runs.filter((r) => r.direction === 'toSuite')
    expect(pickups).toHaveLength(1)
    expect(pickups[0].passengers).toHaveLength(2)
    expectInvariants([a, b], runs)
  })

  it('never re-absorbs a run the driver split by hand', () => {
    const a = appt({ startTime: '08:00' })
    const b = appt({ startTime: '08:05' })
    const grouped = group([a, b]).runs
    const pickup = grouped.find((r) => r.direction === 'toSuite')!

    const split = splitAppointmentOut(grouped, pickup.id, b.id).runs
    const settled = reconcileRuns([a, b], split, settings()).runs

    const pickups = settled.filter((r) => r.direction === 'toSuite')
    expect(pickups).toHaveLength(2)
    expect(pickups.every((r) => r.pinned)).toBe(true)
    expectInvariants([a, b], settled)
  })

  it('drops a deleted appointment and removes the run it emptied', () => {
    const a = appt({ startTime: '08:00' })
    const runs = group([a]).runs
    expect(runs).toHaveLength(2)
    const { runs: after } = reconcileRuns([], runs, settings())
    expect(after).toHaveLength(0)
  })

  it('removes the return run for a no-show and says so', () => {
    const a = appt({ startTime: '08:00' })
    const b = appt({ startTime: '13:00' })
    const runs = group([a, b]).runs
    const noShown = { ...a, status: 'noShow' as const }

    const { runs: after, notices } = reconcileRuns([noShown, b], runs, settings())

    const returns = after.filter((r) => r.direction === 'toConventionCenter')
    expect(returns.some((r) => r.passengers.some((p) => p.appointmentId === a.id))).toBe(false)
    expect(notices.join(' ')).toContain('marked no-show')
    // Their pickup run keeps them on the manifest, flagged.
    const pickup = after.find(
      (r) => r.direction === 'toSuite' && r.passengers.some((p) => p.appointmentId === a.id),
    )
    expect(pickup?.passengers.find((p) => p.appointmentId === a.id)?.state).toBe('noShow')
    expectInvariants([noShown, b], after)
  })

  it('restores a return run when a no-show is undone', () => {
    const a = appt({ startTime: '08:00' })
    const runs = group([a]).runs
    const afterNoShow = reconcileRuns([{ ...a, status: 'noShow' }], runs, settings()).runs
    const restored = reconcileRuns([a], afterNoShow, settings()).runs
    expect(restored.filter((r) => r.direction === 'toConventionCenter')).toHaveLength(1)
    expectInvariants([a], restored)
  })
})

describe('split / merge / move', () => {
  it('splits without losing or duplicating anyone', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '08:00' }), appt({ startTime: '08:00' })]
    const runs = group(appointments).runs
    const pickup = runs.find((r) => r.direction === 'toSuite')!

    const { runs: after } = splitAppointmentOut(runs, pickup.id, appointments[1].id)
    const settled = reconcileRuns(appointments, after, settings()).runs

    expect(settled.filter((r) => r.direction === 'toSuite')).toHaveLength(2)
    expectInvariants(appointments, settled)
  })

  it('refuses to split a run that only has one account', () => {
    const a = appt()
    const runs = group([a]).runs
    const pickup = runs.find((r) => r.direction === 'toSuite')!
    const result = splitAppointmentOut(runs, pickup.id, a.id)
    expect(result.runs).toEqual(runs)
    expect(result.notices[0]).toContain('one account')
  })

  it('merges two runs back into one', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '09:00' })]
    const runs = group(appointments).runs
    const pickups = runs.filter((r) => r.direction === 'toSuite')
    expect(pickups).toHaveLength(2)

    const { runs: after } = mergeRuns(runs, pickups[0].id, pickups[1].id)
    const settled = reconcileRuns(appointments, after, settings()).runs

    const merged = settled.filter((r) => r.direction === 'toSuite')
    expect(merged).toHaveLength(1)
    expect(merged[0].passengers).toHaveLength(2)
    // The pickup has to happen in time for the earliest meeting.
    expect(merged[0].scheduledTime).toBe('08:00')
    expectInvariants(appointments, settled)
  })

  it('will not merge across directions or days', () => {
    const appointments = [appt({ startTime: '08:00' })]
    const runs = group(appointments).runs
    const result = mergeRuns(runs, runs[0].id, runs[1].id)
    expect(result.runs).toEqual(runs)
    expect(result.notices[0]).toContain('opposite directions')
  })

  it('moves an appointment between runs without orphaning it', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '08:00' }), appt({ startTime: '10:00' })]
    const runs = group(appointments).runs
    const [first, second] = runs.filter((r) => r.direction === 'toSuite')

    const { runs: after } = moveAppointment(runs, appointments[0].id, first.id, second.id)
    const settled = reconcileRuns(appointments, after, settings()).runs

    expectInvariants(appointments, settled)
    const target = settled.find((r) => r.id === second.id)!
    expect(target.passengers.map((p) => p.appointmentId)).toContain(appointments[0].id)
  })

  it('cleans up a run left empty by a move', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '10:00' })]
    const runs = group(appointments).runs
    const [first, second] = runs.filter((r) => r.direction === 'toSuite')

    const { runs: after, notices } = moveAppointment(runs, appointments[0].id, first.id, second.id)
    expect(after.find((r) => r.id === first.id)).toBeUndefined()
    expect(notices.join(' ')).toContain('Empty run removed')
    expectInvariants(appointments, reconcileRuns(appointments, after, settings()).runs)
  })
})

describe('leave-by and capacity math', () => {
  it('follows start − drive − buffer for a single-stop pickup', () => {
    const config = settings({ driveTimeMinutes: 12, bufferMinutes: 10 })
    const a = appt({ startTime: '08:00' })
    const pickup = group([a], config).runs.find((r) => r.direction === 'toSuite')!
    expect(leadMinutes(pickup, byId([a]), config)).toBe(22)
    expect(runLeaveByInstant(pickup, byId([a]), config).toISOString()).toBe(
      '2026-08-10T14:38:00.000Z', // 07:38 Pacific
    )
  })

  it('adds the per-stop allowance when a run has two pickup points', () => {
    const config = settings({ extraMinutesPerStop: 5 })
    const appointments = [
      appt({ startTime: '08:00', pickupLocation: 'LVCC' }),
      appt({ startTime: '08:00', pickupLocation: 'Bellagio' }),
    ]
    const pickup = group(appointments, config).runs.find((r) => r.direction === 'toSuite')!
    expect(runStops(pickup, byId(appointments), config)).toEqual(['LVCC', 'Bellagio'])
    expect(leadMinutes(pickup, byId(appointments), config)).toBe(12 + 10 + 5)
  })

  it('doubles the drive when round-trip leave-by is on', () => {
    const config = settings({ roundTripLeaveBy: true })
    const a = appt({ startTime: '08:00' })
    const pickup = group([a], config).runs.find((r) => r.direction === 'toSuite')!
    expect(leadMinutes(pickup, byId([a]), config)).toBe(12 * 2 + 10)
  })

  it('only subtracts the buffer for a return run, which starts at the suite', () => {
    const config = settings()
    const a = appt({ startTime: '08:00' })
    const back = group([a], config).runs.find((r) => r.direction === 'toConventionCenter')!
    expect(leadMinutes(back, byId([a]), config)).toBe(config.bufferMinutes)
  })

  it('ignores no-shows when counting heads', () => {
    const config = settings({ vehicleCapacity: 4 })
    const appointments = [appt({ partySize: 3 }), appt({ partySize: 3, status: 'noShow' })]
    const { runs } = group(appointments, config)
    const pickup = runs.find((r) => r.direction === 'toSuite')!
    expect(runPartySize(pickup, byId(appointments))).toBe(3)
    expect(isOverCapacity(pickup, byId(appointments), config)).toBe(false)
  })
})

describe('conflicts', () => {
  it('flags two runs that overlap, and offers a merge for same-direction pairs', () => {
    // A tight window keeps these two apart, but their drive windows still collide:
    // 07:38–08:00 against 07:53–08:15.
    const config = settings({ groupWindowMinutes: 10 })
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '08:15' })]
    const runs = group(appointments, config).runs.filter((r) => r.direction === 'toSuite')
    expect(runs).toHaveLength(2)

    const conflicts = findConflicts(runs, byId(appointments), config)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].mergeable).toBe(true)
  })

  it('leaves well-separated runs alone', () => {
    const appointments = [appt({ startTime: '08:00' }), appt({ startTime: '15:00' })]
    const config = settings()
    const runs = group(appointments, config).runs
    expect(findConflicts(runs, byId(appointments), config)).toHaveLength(0)
  })
})
