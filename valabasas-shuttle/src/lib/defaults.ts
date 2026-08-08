import type { Settings } from '../types'

export const LVCC = 'Las Vegas Convention Center, 3150 Paradise Rd, Las Vegas, NV 89109'

export const DEFAULT_SETTINGS: Settings = {
  // Left blank on purpose: the app nags for it on first open and every screen
  // that needs it, rather than shipping a wrong address that silently misroutes.
  suiteAddress: '',
  conventionCenterAddress: LVCC,
  defaultDurationMinutes: 60,
  driveTimeMinutes: 12,
  bufferMinutes: 10,
  vehicleCapacity: 6,
  groupWindowMinutes: 20,
  extraMinutesPerStop: 5,
  roundTripLeaveBy: false,
  driverName: '',
  vehicleDescription: 'black Sprinter van',
  templates: {
    etaConventionCenter:
      "Hi {contact}, this is {me} with Valabasas — I'm about {minutes} minutes out from the convention center. I'll be in a {vehicle}.",
    onTheWay: 'Heading your way now, see you in about {minutes} minutes.',
    outsideNow: "I'm outside now whenever you're ready.",
    returnReady: "All set — I'll take you back to the convention center whenever you're ready.",
  },
  keepScreenAwake: true,
  leaveByAlerts: true,
}

/** Amber at this many minutes to leave-by, red once it's gone. */
export const LEAVE_BY_WARNING_MINUTES = 15
