export type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
export type LearningSessionStatus = 'open' | 'completed'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
/** Baseline / exit labels for longitudinal RFC comparison */
export type SessionKind = 'regular' | 'pretest' | 'posttest'
/** Input behavior for a Learning Session. */
export type SessionFormat = 'lesson' | 'test'
/** Live-test prompt/audio language. */
export type PromptLanguage = 'vi' | 'en'

export type ScheduledSession = {
  id: string
  classId: string
  plannedStart: string
  durationMinutes: number
  status: ScheduleStatus
  rescheduledFromId: string | null
  /**
   * Teaching Day N for this class (1, 2, 3…).
   * Unstarted plan slots may show a provisional number; live start always uses next
   * teaching day after completed/open sessions (not max of the full course plan).
   */
  sessionNumber: number | null
}

export type LearningSession = {
  id: string
  classId: string
  scheduledSessionId: string | null
  status: LearningSessionStatus
  plannedQuestionCount: number | null
  startedAt: string
  completedAt: string | null
  maxProbeCount: number
  /** Teaching Day N assigned when the live session starts (sequential per class) */
  sessionNumber: number | null
  /**
   * Soft lock: teacher currently authorized to capture for an open session.
   * Null when unlocked / expired (see lockExpiresAt).
   */
  ownerUserId: string | null
  /** ISO expiry for ownerUserId lock; null means no active lock. */
  lockExpiresAt: string | null
  /**
   * Session purpose for baseline comparison (pretest / posttest / regular).
   * Defaults to regular when missing (legacy snapshots).
   */
  sessionKind: SessionKind
  /** Input behavior: current live lesson flow or resource-driven live-test. Legacy sessions default to lesson. */
  sessionFormat?: SessionFormat
  /** For test sessions, selects Vietnamese or English complete sentence prompt/audio. */
  promptLanguage?: PromptLanguage | null
  /** Selected live-test resource for test sessions. */
  liveTestResourceId?: string | null
  /** Selected 10-item live-test block for test sessions. */
  liveTestBlockId?: string | null
  /**
   * Learners included in capture for this session (subset of class roster).
   * Null/empty means “all active enrollments at start” (legacy).
   */
  participantLearnerIds: string[] | null
}

export type AttendanceRecord = {
  id: string
  learningSessionId: string
  learnerUserId: string
  status: AttendanceStatus
  recordedAt: string
}

export type SchedulingState = {
  scheduledSessions: ScheduledSession[]
  learningSessions: LearningSession[]
  attendance: AttendanceRecord[]
}
