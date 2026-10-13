import type { ResultColor } from '../result-lifecycle/types'
import type { RosterState } from '../roster/types'
import type { ResultRecord } from '../reporting/progress'
import type { LearningSession, SchedulingState } from '../scheduling/types'
import { effectiveResults } from './effective-results'

export type ArchiveCell = {
  sessionQuestionId: string
  learnerUserId: string
  sequenceHint: number
  color: ResultColor | null
  probeEventCount: number
  enteredProbeFlow: boolean
}

export type SessionArchiveDay = {
  learningSession: LearningSession
  dayLabel: string
  resultCount: number
  attendancePresent: number
  attendanceTotal: number
  cells: ArchiveCell[]
}

/** Completed (and open) learning days for a class with result cells for heatmap. */
export function buildSessionArchive(
  _roster: RosterState,
  scheduling: SchedulingState,
  ledger: ResultRecord[],
  classId: string,
): SessionArchiveDay[] {
  const sessions = scheduling.learningSessions
    .filter((s) => s.classId === classId)
    .slice()
    .sort((a, b) => {
      const an = a.sessionNumber ?? 9999
      const bn = b.sessionNumber ?? 9999
      if (an !== bn) return an - bn
      return a.startedAt.localeCompare(b.startedAt)
    })

  const effective = effectiveResults(ledger).filter((r) => r.classId === classId)

  return sessions.map((ls) => {
    const results = effective.filter((r) => r.learningSessionId === ls.id)
    const attendance = scheduling.attendance.filter((a) => a.learningSessionId === ls.id)
    const present = attendance.filter(
      (a) => a.status === 'present' || a.status === 'late',
    ).length

    // Build cells ordered by first-seen question order in ledger
    const cells: ArchiveCell[] = results
      .slice()
      .sort((a, b) => a.sessionQuestionId.localeCompare(b.sessionQuestionId))
      .map((r, i) => ({
        sessionQuestionId: r.sessionQuestionId,
        learnerUserId: r.learnerUserId,
        sequenceHint: i + 1,
        color: r.effectiveColor,
        probeEventCount: r.probeEventCount,
        enteredProbeFlow: r.enteredProbeFlow,
      }))

    const dayNum = ls.sessionNumber
    const dayLabel =
      dayNum != null
        ? `Day ${dayNum}`
        : new Date(ls.startedAt).toLocaleDateString()

    return {
      learningSession: ls,
      dayLabel,
      resultCount: results.length,
      attendancePresent: present,
      attendanceTotal: attendance.length,
      cells,
    }
  })
}

export function learnerNameMap(roster: RosterState): Map<string, string> {
  return new Map(roster.users.map((u) => [u.id, u.displayName]))
}
