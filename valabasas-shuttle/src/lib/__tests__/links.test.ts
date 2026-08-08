import { describe, expect, it } from 'vitest'
import { buildNavTarget, renderTemplate, smsUrl, telUrl } from '../links'
import { navPlanForRun } from '../navigation'
import { reconcileRuns } from '../runs'
import { byId } from '../runs'
import { appt, settings } from './factory'

const LVCC = 'Las Vegas Convention Center, 3150 Paradise Rd, Las Vegas, NV 89109'
const SUITE = 'Wynn Las Vegas, 3131 S Las Vegas Blvd, Las Vegas, NV 89109'

describe('map links', () => {
  it('uses the app scheme with a web fallback for a single stop', () => {
    const target = buildNavTarget([LVCC], 'Navigate')!
    expect(target.appUrl).toBe(
      'comgooglemaps://?daddr=Las%20Vegas%20Convention%20Center%2C%203150%20Paradise%20Rd%2C%20Las%20Vegas%2C%20NV%2089109&directionsmode=driving',
    )
    expect(target.webUrl).toContain('https://www.google.com/maps/dir/?api=1&destination=')
    expect(target.webUrl).toContain('&travelmode=driving')
    expect(target.webUrl).not.toContain('waypoints')
  })

  it('switches to the waypoints web URL once there is more than one stop', () => {
    const target = buildNavTarget(['Bellagio', 'Wynn', SUITE], 'Navigate')!
    expect(target.appUrl).toBeUndefined()
    expect(target.webUrl).toContain('destination=Wynn%20Las%20Vegas')
    expect(target.webUrl).toContain('waypoints=Bellagio%7CWynn&')
  })

  it('returns nothing when there is no address at all', () => {
    expect(buildNavTarget([], 'Navigate')).toBeNull()
    expect(buildNavTarget(['  '], 'Navigate')).toBeNull()
  })
})

describe('nav plan follows the run', () => {
  const config = settings({ suiteAddress: SUITE })

  it('drives to the pickup first, then the suite once everyone is aboard', () => {
    const a = appt({ pickupLocation: LVCC })
    const runs = reconcileRuns([a], [], config).runs
    const pickup = runs.find((r) => r.direction === 'toSuite')!
    const lookup = byId([a])

    expect(navPlanForRun(pickup, lookup, config).target?.stops).toEqual([LVCC])
    expect(
      navPlanForRun({ ...pickup, status: 'onboard' }, lookup, config).target?.stops,
    ).toEqual([SUITE])
  })

  it('drives to the suite first on a return run, then to the drop-off', () => {
    const a = appt({ pickupLocation: LVCC })
    const runs = reconcileRuns([a], [], config).runs
    const back = runs.find((r) => r.direction === 'toConventionCenter')!
    const lookup = byId([a])

    expect(navPlanForRun(back, lookup, config).target?.stops).toEqual([SUITE])
    expect(navPlanForRun({ ...back, status: 'onboard' }, lookup, config).target?.stops).toEqual([
      LVCC,
    ])
  })

  it('builds a multi-stop route when the run has two pickup addresses', () => {
    const appointments = [
      appt({ startTime: '08:00', pickupLocation: LVCC }),
      appt({ startTime: '08:00', pickupLocation: 'Bellagio Valet' }),
    ]
    const runs = reconcileRuns(appointments, [], config).runs
    const pickup = runs.find((r) => r.direction === 'toSuite')!
    const plan = navPlanForRun(pickup, byId(appointments), config)
    expect(plan.target?.stops).toEqual([LVCC, 'Bellagio Valet'])
    expect(plan.target?.appUrl).toBeUndefined()
    expect(plan.target?.webUrl).toContain('waypoints=')
  })

  it('asks for the suite address instead of navigating nowhere', () => {
    const a = appt()
    const noSuite = settings({ suiteAddress: '' })
    const runs = reconcileRuns([a], [], noSuite).runs
    const back = runs.find((r) => r.direction === 'toConventionCenter')!
    const plan = navPlanForRun(back, byId([a]), noSuite)
    expect(plan.target).toBeNull()
    expect(plan.blockedReason).toContain('Settings')
  })
})

describe('tel and sms links', () => {
  it('builds a tel: link', () => {
    expect(telUrl('+17025550118')).toBe('tel:+17025550118')
  })

  it('disables itself when there is no number', () => {
    expect(telUrl('')).toBeNull()
    expect(smsUrl('', 'hello')).toBeNull()
  })

  it('uses the iOS &body= form', () => {
    expect(smsUrl('+17025550118', 'See you in 10')).toBe(
      'sms:+17025550118&body=See%20you%20in%2010',
    )
  })
})

describe('templates', () => {
  const config = settings({ driverName: 'Shehab', vehicleDescription: 'black Sprinter van' })

  it('fills every placeholder', () => {
    const text = renderTemplate(config.templates.etaConventionCenter, {
      contact: 'Marcus',
      minutes: 15,
    }, config)
    expect(text).toBe(
      "Hi Marcus, this is Shehab with Valabasas — I'm about 15 minutes out from the convention center. I'll be in a black Sprinter van.",
    )
  })

  it('degrades politely when the driver has not filled in their name', () => {
    const bare = settings({ driverName: '', vehicleDescription: '' })
    const text = renderTemplate(bare.templates.etaConventionCenter, { minutes: 5 }, bare)
    expect(text).toContain('this is your driver')
    expect(text).toContain('in a vehicle')
    expect(text).toContain('Hi there')
  })
})
