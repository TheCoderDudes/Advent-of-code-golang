export type AppointmentStatus = 'scheduled' | 'noShow' | 'cancelled'

export interface Appointment {
  id: string
  accountName: string
  contactName: string
  /** E.164 (+1XXXXXXXXXX) when we could normalise it, otherwise ''. */
  phone: string
  partySize: number
  /** yyyy-MM-dd, always a Los Angeles wall-clock date. */
  date: string
  /** HH:mm, always Los Angeles wall-clock time. */
  startTime: string
  durationMinutes: number
  pickupLocation: string
  /** Where the return leg drops them. Empty means "same as pickup". */
  dropoffLocation: string
  notes: string
  status: AppointmentStatus
}

export type RunDirection = 'toSuite' | 'toConventionCenter'

/**
 * Upcoming -> En route to pickup -> Arrived -> Passengers onboard -> Complete.
 * 'arrived' exists so the multi-account boarding checklist has somewhere to live.
 */
export type RunStatus = 'upcoming' | 'driving' | 'arrived' | 'onboard' | 'complete'

export type PassengerState = 'waiting' | 'onboard' | 'dropped' | 'noShow'

export interface RunPassenger {
  appointmentId: string
  state: PassengerState
}

export interface Run {
  id: string
  direction: RunDirection
  /** yyyy-MM-dd, Los Angeles. */
  date: string
  /**
   * HH:mm, Los Angeles.
   * Pickup runs: target arrival at the suite (the earliest appointment start).
   * Return runs: departure from the suite (the latest appointment end).
   */
  scheduledTime: string
  passengers: RunPassenger[]
  status: RunStatus
  notes: string
  /** ISO instant the run was completed, used for the "running behind" readout. */
  completedAt?: string
  /**
   * True once the driver has split/merged/moved this run by hand. Pinned runs are
   * left alone by auto-grouping so the app never undoes a manual decision.
   */
  pinned: boolean
}

export interface MessageTemplates {
  etaConventionCenter: string
  onTheWay: string
  outsideNow: string
  returnReady: string
}

export interface Settings {
  suiteAddress: string
  conventionCenterAddress: string
  defaultDurationMinutes: number
  driveTimeMinutes: number
  bufferMinutes: number
  vehicleCapacity: number
  groupWindowMinutes: number
  extraMinutesPerStop: number
  /**
   * When on, leave-by for a pickup run also subtracts the drive *to* the pickup
   * point, not just the drive back to the suite.
   */
  roundTripLeaveBy: boolean
  driverName: string
  vehicleDescription: string
  templates: MessageTemplates
  keepScreenAwake: boolean
  leaveByAlerts: boolean
}

export interface AppState {
  appointments: Appointment[]
  runs: Run[]
  settings: Settings
  /** yyyy-MM-dd currently being viewed. */
  selectedDate: string
  /** Run the driver pinned as "active"; falls back to the automatic pick. */
  activeRunId: string | null
  /** One-off messages surfaced as a toast (e.g. "return run removed"). */
  notices: string[]
  /** Set once the driver has seen the first-run empty state. */
  hasOnboarded: boolean
}
