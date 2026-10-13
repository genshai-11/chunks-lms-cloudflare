import { newId } from '../roster/seed'
import { materializeCourseSchedule } from './recurrence'
import type { Class } from '../roster/types'
import { normalizeCourseSchedule } from '../roster/schedule'
import type {
  AttendanceRecord,
  AttendanceStatus,
  LearningSession,
  ScheduledSession,
  SchedulingState,
} from './types'

export type SchedulingResult<T> =
  | { ok: true; value: T; state: SchedulingState }
  | { ok: false; error: string }

export function emptySchedulingState(): SchedulingState {
  return { scheduledSessions: [], learningSessions: [], attendance: [] }
}

/**
 * Highest teaching day already used for this class (open or completed live sessions).
 * Does NOT count future planned schedule slots — those are calendar placeholders only.
 */
export function maxTeachingDayNumber(state: SchedulingState, classId: string): number {
  return state.learningSessions
    .filter((ls) => ls.classId === classId && ls.sessionNumber != null && ls.sessionNumber > 0)
    .reduce((m, ls) => Math.max(m, ls.sessionNumber ?? 0), 0)
}

/** Next Day N for a live class (Day 1, then 2, …) — ignores unused course-plan slots. */
export function nextTeachingDayNumber(state: SchedulingState, classId: string): number {
  return maxTeachingDayNumber(state, classId) + 1
}

/**
 * Re-number *unstarted* planned slots for a class by plannedStart.
 * Preserves sessionNumber on slots that already have a live Learning Session
 * (teaching Day N must not jump when the course plan has 15 placeholders).
 */
export function reindexSessionNumbers(
  state: SchedulingState,
  classId: string,
): SchedulingState {
  const linkedScheduledIds = new Set(
    state.learningSessions
      .filter((ls) => ls.classId === classId && ls.scheduledSessionId)
      .map((ls) => ls.scheduledSessionId as string),
  )
  const teachingByScheduled = new Map<string, number>()
  for (const ls of state.learningSessions) {
    if (ls.classId !== classId || !ls.scheduledSessionId) continue
    if (ls.sessionNumber != null && ls.sessionNumber > 0) {
      teachingByScheduled.set(ls.scheduledSessionId, ls.sessionNumber)
    }
  }

  const maxTaught = maxTeachingDayNumber(state, classId)
  let planCursor = maxTaught

  const ordered = state.scheduledSessions
    .filter((s) => s.classId === classId && s.status !== 'cancelled' && s.status !== 'rescheduled')
    .slice()
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))

  const numberById = new Map<string, number>()
  for (const s of ordered) {
    if (linkedScheduledIds.has(s.id) && teachingByScheduled.has(s.id)) {
      numberById.set(s.id, teachingByScheduled.get(s.id)!)
      continue
    }
    if (linkedScheduledIds.has(s.id)) {
      // Live session exists but no number yet — leave for startLearningSession
      numberById.set(s.id, s.sessionNumber ?? planCursor + 1)
      continue
    }
    // Future / unstarted plan slots: continue after last taught day
    planCursor += 1
    numberById.set(s.id, planCursor)
  }

  return {
    ...state,
    scheduledSessions: state.scheduledSessions.map((s) => {
      if (s.classId !== classId) return s
      if (s.status === 'cancelled' || s.status === 'rescheduled') {
        return { ...s, sessionNumber: s.sessionNumber }
      }
      return { ...s, sessionNumber: numberById.get(s.id) ?? s.sessionNumber }
    }),
    // Never rewrite learning-session day numbers from plan reindex
    learningSessions: state.learningSessions,
  }
}

export function createScheduledSession(
  state: SchedulingState,
  input: {
    classId: string
    plannedStart: string
    durationMinutes: number
    sessionNumber?: number | null
  },
): SchedulingResult<ScheduledSession> {
  if (input.durationMinutes < 1) {
    return { ok: false, error: 'Duration must be positive' }
  }
  const hasExplicitNumber = input.sessionNumber !== undefined && input.sessionNumber !== null
  const session: ScheduledSession = {
    id: newId('sched'),
    classId: input.classId,
    plannedStart: input.plannedStart,
    durationMinutes: input.durationMinutes,
    status: 'scheduled',
    rescheduledFromId: null,
    // Flexible slot: provisional next teaching day (not max of a 15-slot course plan).
    // Live start always re-assigns from learningSessions only.
    sessionNumber: hasExplicitNumber
      ? input.sessionNumber!
      : nextTeachingDayNumber(state, input.classId),
  }
  const withRow = {
    ...state,
    scheduledSessions: [...state.scheduledSessions, session],
  }

  // Course-plan batch passes explicit numbers and reindexes once at the end.
  // Flexible teacher adds must not renumber the whole plan (that caused Day 16).
  if (hasExplicitNumber) {
    return { ok: true, value: session, state: withRow }
  }
  return { ok: true, value: session, state: withRow }
}

/**
 * Materialize course auto-schedule into Scheduled Sessions for a class.
 * Skips dates that already have a scheduled (non-cancelled) session same day.
 */
export function applyClassScheduleToClass(
  state: SchedulingState,
  input: {
    classId: string
    classRow: Class
  },
): SchedulingResult<ScheduledSession[]> {
  const { classId, classRow } = input
  const schedule = normalizeCourseSchedule(classRow.schedule)
  if (!classRow.startsOn || !schedule) {
    return { ok: false, error: 'Class needs a start date and auto-schedule pattern' }
  }

  const plan = materializeCourseSchedule(classRow.startsOn, schedule)

  if (plan.occurrences.length === 0) {
    return { ok: false, error: 'No sessions generated from course schedule' }
  }

  // Key by full plannedStart so multi-time same day is allowed
  const existingStarts = new Set(
    state.scheduledSessions
      .filter((s) => s.classId === classId && s.status !== 'cancelled')
      .map((s) => s.plannedStart),
  )

  const created: ScheduledSession[] = []
  let next = state
  for (const occ of plan.occurrences) {
    if (existingStarts.has(occ.plannedStart)) continue
    const r = createScheduledSession(next, {
      classId,
      plannedStart: occ.plannedStart,
      durationMinutes: occ.durationMinutes,
      sessionNumber: occ.sequence + 1,
    })
    if (!r.ok) return r
    next = r.state
    const row = r.state.scheduledSessions.find((s) => s.plannedStart === occ.plannedStart)
    if (row) created.push(row)
    existingStarts.add(occ.plannedStart)
  }

  next = reindexSessionNumbers(next, classId)
  return { ok: true, value: created, state: next }
}

export function cancelScheduledSession(
  state: SchedulingState,
  scheduledSessionId: string,
): SchedulingResult<ScheduledSession> {
  const session = state.scheduledSessions.find((s) => s.id === scheduledSessionId)
  if (!session) return { ok: false, error: 'Scheduled session not found' }
  if (session.status === 'completed') {
    return { ok: false, error: 'Cannot cancel a completed occurrence' }
  }
  const updated: ScheduledSession = { ...session, status: 'cancelled' }
  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      scheduledSessions: state.scheduledSessions.map((s) =>
        s.id === scheduledSessionId ? updated : s,
      ),
    },
  }
}

/**
 * Hard-delete a planned slot from the class list.
 * Blocks if a learning session already ran (or is open) against this schedule id.
 * Cancelled / rescheduled / pure scheduled slots without live history can be removed.
 */
export function deleteScheduledSession(
  state: SchedulingState,
  scheduledSessionId: string,
): SchedulingResult<{ deletedId: string }> {
  const session = state.scheduledSessions.find((s) => s.id === scheduledSessionId)
  if (!session) return { ok: false, error: 'Scheduled session not found' }

  const linked = state.learningSessions.find((ls) => ls.scheduledSessionId === scheduledSessionId)
  if (linked) {
    return {
      ok: false,
      error:
        linked.status === 'open'
          ? 'Finish or abandon the live session before deleting this slot'
          : 'Cannot delete — a completed live session is linked (cancel is not enough; keep history)',
    }
  }

  if (session.status === 'completed') {
    return { ok: false, error: 'Cannot delete a completed schedule row' }
  }

  const classId = session.classId
  const removed: SchedulingState = {
    ...state,
    scheduledSessions: state.scheduledSessions.filter((s) => s.id !== scheduledSessionId),
  }
  const reindexed = reindexSessionNumbers(removed, classId)
  return { ok: true, value: { deletedId: scheduledSessionId }, state: reindexed }
}

/**
 * Reschedule: mark original as rescheduled; create replacement linked back.
 * Original planned start is never rewritten.
 */
export function rescheduleSession(
  state: SchedulingState,
  scheduledSessionId: string,
  newPlannedStart: string,
): SchedulingResult<{ original: ScheduledSession; replacement: ScheduledSession }> {
  const original = state.scheduledSessions.find((s) => s.id === scheduledSessionId)
  if (!original) return { ok: false, error: 'Scheduled session not found' }
  if (original.status !== 'scheduled') {
    return { ok: false, error: 'Only future scheduled occurrences can be rescheduled' }
  }

  const marked: ScheduledSession = { ...original, status: 'rescheduled' }
  const replacement: ScheduledSession = {
    id: newId('sched'),
    classId: original.classId,
    plannedStart: newPlannedStart,
    durationMinutes: original.durationMinutes,
    status: 'scheduled',
    rescheduledFromId: original.id,
    sessionNumber: original.sessionNumber,
  }

  const nextState = reindexSessionNumbers(
    {
      ...state,
      scheduledSessions: [
        ...state.scheduledSessions.map((s) => (s.id === original.id ? marked : s)),
        replacement,
      ],
    },
    original.classId,
  )
  const replacementFinal =
    nextState.scheduledSessions.find((s) => s.id === replacement.id) ?? replacement

  return {
    ok: true,
    value: { original: marked, replacement: replacementFinal },
    state: nextState,
  }
}

/**
 * Start a Learning Session from a Scheduled Session (or ad-hoc).
 * Planned start on the schedule row is unchanged.
 */
export function startLearningSession(
  state: SchedulingState,
  input: {
    classId: string
    scheduledSessionId?: string | null
    at?: string
    maxProbeCount?: number
    plannedQuestionCount?: number | null
    /** Soft lock owner (teacher user id) */
    ownerUserId?: string | null
    lockTtlMs?: number
    sessionKind?: import('./types').SessionKind
    sessionFormat?: import('./types').SessionFormat
    promptLanguage?: import('./types').PromptLanguage | null
    liveTestResourceId?: string | null
    liveTestBlockId?: string | null
    /** Explicit display ordinal for learner-first single sessions. Defaults to next class day. */
    sessionNumber?: number | null
    /** Subset of class learners for this capture; null = all enrolled at start */
    participantLearnerIds?: string[] | null
  },
): SchedulingResult<LearningSession> {
  const at = input.at ?? new Date().toISOString()
  let scheduledSessionId = input.scheduledSessionId ?? null

  if (scheduledSessionId) {
    const scheduled = state.scheduledSessions.find((s) => s.id === scheduledSessionId)
    if (!scheduled) return { ok: false, error: 'Scheduled session not found' }
    if (scheduled.status === 'cancelled' || scheduled.status === 'rescheduled') {
      return { ok: false, error: 'Cannot start a cancelled or rescheduled occurrence' }
    }
    const existing = state.learningSessions.find(
      (ls) => ls.scheduledSessionId === scheduledSessionId && ls.status === 'open',
    )
    if (existing) {
      return { ok: false, error: 'Learning Session already started for this occurrence' }
    }
  }

  const openForClass = state.learningSessions.find(
    (ls) => ls.classId === input.classId && ls.status === 'open',
  )
  if (openForClass) {
    return { ok: false, error: 'Class already has an open Learning Session' }
  }

  // Teaching Day N is sequential for live work: after Day 1, next live is Day 2 —
  // never "max planned course slots + 1" (that produced Day 16 with a 15-day plan).
  const sessionNumber = input.sessionNumber ?? nextTeachingDayNumber(state, input.classId)

  const ownerUserId = input.ownerUserId ?? null
  const ttl = input.lockTtlMs ?? 5 * 60 * 1000
  const participants = input.participantLearnerIds?.length
    ? [...new Set(input.participantLearnerIds)]
    : null

  const session: LearningSession = {
    id: newId('ls'),
    classId: input.classId,
    scheduledSessionId,
    status: 'open',
    plannedQuestionCount: input.plannedQuestionCount ?? null,
    startedAt: at,
    completedAt: null,
    maxProbeCount: input.maxProbeCount ?? 2,
    sessionNumber,
    ownerUserId,
    lockExpiresAt: ownerUserId
      ? new Date(new Date(at).getTime() + ttl).toISOString()
      : null,
    sessionKind: input.sessionKind ?? 'regular',
    sessionFormat: input.sessionFormat ?? 'lesson',
    promptLanguage: input.sessionFormat === 'test' ? (input.promptLanguage ?? 'vi') : null,
    liveTestResourceId: input.sessionFormat === 'test' ? (input.liveTestResourceId ?? null) : null,
    liveTestBlockId: input.sessionFormat === 'test' ? (input.liveTestBlockId ?? null) : null,
    participantLearnerIds: participants,
  }

  // Stamp the linked calendar slot with the real teaching day
  const scheduledSessions = scheduledSessionId
    ? state.scheduledSessions.map((s) =>
        s.id === scheduledSessionId ? { ...s, sessionNumber } : s,
      )
    : state.scheduledSessions

  return {
    ok: true,
    value: session,
    state: {
      ...state,
      scheduledSessions,
      learningSessions: [...state.learningSessions, session],
    },
  }
}

/** Refresh soft lock for the teacher currently capturing. */
export function touchLearningSessionLock(
  state: SchedulingState,
  learningSessionId: string,
  ownerUserId: string,
  at = new Date().toISOString(),
  ttlMs = 5 * 60 * 1000,
): SchedulingResult<LearningSession> {
  const session = state.learningSessions.find((s) => s.id === learningSessionId)
  if (!session) return { ok: false, error: 'Learning Session not found' }
  if (session.status !== 'open') return { ok: false, error: 'Session is not open' }
  if (
    session.ownerUserId &&
    session.ownerUserId !== ownerUserId &&
    session.lockExpiresAt &&
    new Date(session.lockExpiresAt) > new Date(at)
  ) {
    return { ok: false, error: 'Session locked by another teacher' }
  }
  const next: LearningSession = {
    ...session,
    ownerUserId,
    lockExpiresAt: new Date(new Date(at).getTime() + ttlMs).toISOString(),
  }
  return {
    ok: true,
    value: next,
    state: {
      ...state,
      learningSessions: state.learningSessions.map((s) => (s.id === learningSessionId ? next : s)),
    },
  }
}

export function recordAttendance(
  state: SchedulingState,
  input: {
    learningSessionId: string
    learnerUserId: string
    status: AttendanceStatus
    at?: string
  },
): SchedulingResult<AttendanceRecord> {
  const session = state.learningSessions.find((s) => s.id === input.learningSessionId)
  if (!session) return { ok: false, error: 'Learning Session not found' }
  if (session.status === 'completed') {
    return { ok: false, error: 'Cannot change attendance on completed session' }
  }

  const existing = state.attendance.find(
    (a) =>
      a.learningSessionId === input.learningSessionId && a.learnerUserId === input.learnerUserId,
  )
  const record: AttendanceRecord = {
    id: existing?.id ?? newId('att'),
    learningSessionId: input.learningSessionId,
    learnerUserId: input.learnerUserId,
    status: input.status,
    recordedAt: input.at ?? new Date().toISOString(),
  }

  const attendance = existing
    ? state.attendance.map((a) => (a.id === existing.id ? record : a))
    : [...state.attendance, record]

  return { ok: true, value: record, state: { ...state, attendance } }
}

export function completeLearningSession(
  state: SchedulingState,
  learningSessionId: string,
  _participantLearnerIds: string[],
  at = new Date().toISOString(),
): SchedulingResult<LearningSession> {
  const session = state.learningSessions.find((s) => s.id === learningSessionId)
  if (!session) return { ok: false, error: 'Learning Session not found' }
  if (session.status === 'completed') {
    return { ok: false, error: 'Session already completed' }
  }

  const completed: LearningSession = {
    ...session,
    ownerUserId: null,
    lockExpiresAt: null,
    status: 'completed',
    completedAt: at,
  }

  let scheduledSessions = state.scheduledSessions
  if (session.scheduledSessionId) {
    scheduledSessions = state.scheduledSessions.map((s) =>
      s.id === session.scheduledSessionId ? { ...s, status: 'completed' as const } : s,
    )
  }

  return {
    ok: true,
    value: completed,
    state: {
      ...state,
      learningSessions: state.learningSessions.map((s) =>
        s.id === learningSessionId ? completed : s,
      ),
      scheduledSessions,
    },
  }
}
