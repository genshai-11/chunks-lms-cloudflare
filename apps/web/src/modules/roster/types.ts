export type CourseStatus = 'active' | 'archived'
export type ClassStatus = 'active' | 'ended'
export type EnrollmentStatus = 'active' | 'ended'

export type Organization = {
  id: string
  name: string
}

export type AccountStatus = 'active' | 'inactive'

export type DomainUser = {
  id: string
  displayName: string
  email: string | null
  /** Optional normalized login identifier for staff; never grants authorization. */
  username?: string | null
  /** Optional image URL or data URL for avatar */
  avatarUrl: string | null
  roles: Array<'admin' | 'teacher' | 'learner'>
  /** Admin can deactivate teacher/learner accounts without deleting history */
  accountStatus: AccountStatus
  allowMultiClass?: boolean
}

/**
 * One meeting window on a weekday.
 * Same weekday may appear more than once (multi-time per day).
 * Different weekdays can have different start times.
 */
export type CourseDaySlot = {
  /** 0=Sunday … 6=Saturday */
  weekday: number
  /** Local start time HH:mm */
  startTime: string
  /** Optional override; falls back to schedule.durationMinutes */
  durationMinutes?: number
}

/**
 * Weekly meeting pattern for auto-scheduling.
 * Prefer `slots` for per-day / multi-time schedules.
 * Legacy `weekdays` + single `startTime` still accepted and normalized.
 */
export type CourseSchedule = {
  /** Dynamic day+time slots (source of truth when present) */
  slots: CourseDaySlot[]
  /**
   * @deprecated Prefer slots — kept for backward compat / derived summary
   */
  weekdays: number[]
  /**
   * @deprecated Prefer per-slot startTime
   */
  startTime: string
  durationMinutes: number
  /** Number of class meetings to generate (default 15) */
  sessionCount: number
  timeZone: string
}

export type Course = {
  id: string
  organizationId: string
  code: string
  name: string
  status: CourseStatus
}

export type Class = {
  id: string
  courseId: string
  name: string
  capacity: number
  teacherUserId: string
  status: ClassStatus
  startsOn: string | null
  /** Auto-filled from start + schedule when using auto-schedule */
  endsOn: string | null
  schedule: CourseSchedule | null
}

export type Enrollment = {
  id: string
  classId: string
  learnerUserId: string
  status: EnrollmentStatus
  startedAt: string
  endedAt: string | null
}

export type RosterState = {
  organization: Organization
  users: DomainUser[]
  courses: Course[]
  classes: Class[]
  enrollments: Enrollment[]
}

export type RosterResult<T> = { ok: true; value: T; state: RosterState } | { ok: false; error: string }
