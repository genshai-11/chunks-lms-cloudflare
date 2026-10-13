import type { CaptureSessionState } from '../assessment/session-capture'
import { activeEnrollmentsForClass } from '../roster/service'
import type { RosterState } from '../roster/types'
import type { ResultRecord } from '../reporting/progress'
import type { SchedulingState } from '../scheduling/types'
import { effectiveResults } from './effective-results'
import type { SessionOpsRow } from './types'

function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

function attendanceRate(marked: number, seats: number): number | null {
  if (seats <= 0) return null
  return Math.round((marked / seats) * 100)
}

/**
 * Build operational rows for learning sessions (optionally filter to a calendar day).
 */
export function buildSessionOpsBoard(
  roster: RosterState,
  scheduling: SchedulingState,
  ledger: ResultRecord[],
  options?: {
    day?: Date
    classId?: string
    capture?: CaptureSessionState | null
  },
): SessionOpsRow[] {
  const day = options?.day
  const effective = effectiveResults(ledger)
  const rows: SessionOpsRow[] = []

  for (const ls of scheduling.learningSessions) {
    if (options?.classId && ls.classId !== options.classId) continue
    if (day && !isSameLocalDay(ls.startedAt, day)) continue

    const classRow = roster.classes.find((c) => c.id === ls.classId)
    if (!classRow) continue
    const course = roster.courses.find((c) => c.id === classRow.courseId)
    const seats = activeEnrollmentsForClass(roster, classRow.id).length
    const attendanceMarked = scheduling.attendance.filter(
      (a) => a.learningSessionId === ls.id,
    ).length
    const resultCount = effective.filter((r) => r.learningSessionId === ls.id).length

    let openProbes = 0
    let unfinishedDrafts = 0
    if (
      options?.capture &&
      options.capture.learningSessionId === ls.id &&
      options.capture.sessionStatus === 'open'
    ) {
      for (const a of options.capture.attempts) {
        if (a.snapshot.status === 'probe_open' || a.snapshot.status === 'resolution_required') {
          openProbes += 1
        } else if (a.snapshot.status === 'draft') {
          unfinishedDrafts += 1
        }
      }
    }

    const scheduled = ls.scheduledSessionId
      ? scheduling.scheduledSessions.find((s) => s.id === ls.scheduledSessionId)
      : null

    rows.push({
      learningSessionId: ls.id,
      classId: classRow.id,
      className: classRow.name,
      courseCode: course?.code ?? '—',
      sessionNumber: ls.sessionNumber,
      status: ls.status,
      startedAt: ls.startedAt,
      completedAt: ls.completedAt,
      scheduledStatus: scheduled?.status ?? 'none',
      seats,
      attendanceMarked,
      attendanceRate: attendanceRate(attendanceMarked, seats),
      resultCount,
      openProbes,
      unfinishedDrafts,
    })
  }

  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Scheduled sessions for a day that are not yet started as learning sessions. */
export function buildScheduledToday(
  roster: RosterState,
  scheduling: SchedulingState,
  day = new Date(),
): Array<{
  scheduledId: string
  classId: string
  className: string
  courseCode: string
  plannedStart: string
  sessionNumber: number | null
  status: string
}> {
  return scheduling.scheduledSessions
    .filter((s) => s.status === 'scheduled' && isSameLocalDay(s.plannedStart, day))
    .map((s) => {
      const classRow = roster.classes.find((c) => c.id === s.classId)
      const course = classRow
        ? roster.courses.find((c) => c.id === classRow.courseId)
        : null
      return {
        scheduledId: s.id,
        classId: s.classId,
        className: classRow?.name ?? s.classId,
        courseCode: course?.code ?? '—',
        plannedStart: s.plannedStart,
        sessionNumber: s.sessionNumber,
        status: s.status,
      }
    })
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
}

export function classAttendanceSummary(
  roster: RosterState,
  scheduling: SchedulingState,
  classId: string,
): { sessions: number; avgRate: number | null; fullyMarked: number } {
  const sessions = scheduling.learningSessions.filter((s) => s.classId === classId)
  if (sessions.length === 0) return { sessions: 0, avgRate: null, fullyMarked: 0 }
  const seats = activeEnrollmentsForClass(roster, classId).length
  let sum = 0
  let fullyMarked = 0
  let counted = 0
  for (const ls of sessions) {
    const marked = scheduling.attendance.filter((a) => a.learningSessionId === ls.id).length
    if (seats > 0) {
      sum += marked / seats
      counted += 1
      if (marked >= seats) fullyMarked += 1
    }
  }
  return {
    sessions: sessions.length,
    avgRate: counted > 0 ? Math.round((sum / counted) * 100) : null,
    fullyMarked,
  }
}
