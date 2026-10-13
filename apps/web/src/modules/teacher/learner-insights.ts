import type { ResultRecord } from '../reporting/progress'
import { COLOR_SCORE, SPECTRUM_COLORS, WARM_COLORS } from '../result-lifecycle/types'
import type { LearningSession, SchedulingState } from '../scheduling/types'
import { effectiveResults } from '../ops/effective-results'

export type LearnerSessionSummary = {
  learningSessionId: string
  label: string
  startedAt: string
  status: LearningSession['status']
  red: number
  orange: number
  yellow: number
  green: number
  blue: number
  indigo: number
  purple: number
  total: number
  rfc: number | null
  scoreAvg: number | null
  probeTotal: number
}

const COLORS = SPECTRUM_COLORS

export function summarizeLearnerSessions(input: {
  ledger: ResultRecord[]
  scheduling: SchedulingState
  learnerUserId: string
  classId?: string
}): LearnerSessionSummary[] {
  const effective = effectiveResults(input.ledger)
  const learnerRecords = effective.filter(
    (record) => record.learnerUserId === input.learnerUserId,
  )
  const sessionIdsWithFinalizedObservations = new Set(
    learnerRecords.map((record) => record.learningSessionId),
  )
  const sessions = input.scheduling.learningSessions.filter(
    (session) =>
      (!input.classId || session.classId === input.classId) &&
      sessionIdsWithFinalizedObservations.has(session.id),
  )
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const ids = new Set(sessions.map((session) => session.id))
  const rows = new Map<string, LearnerSessionSummary>()

  for (const session of sessions) {
    rows.set(session.id, emptyRow(session))
  }

  for (const record of learnerRecords) {
    if (!ids.has(record.learningSessionId)) continue
    const session = byId.get(record.learningSessionId)
    if (!session) continue
    const row = rows.get(record.learningSessionId) ?? emptyRow(session)
    row[record.effectiveColor] += 1
    row.total += 1
    row.probeTotal += record.enteredProbeFlow ? record.probeEventCount : 0
    rows.set(record.learningSessionId, row)
  }

  const chronological = Array.from(rows.values())
    .map((row) => {
      const redYellow = WARM_COLORS.reduce((sum, color) => sum + row[color], 0)
      const score = COLORS.reduce((sum, color) => sum + row[color] * COLOR_SCORE[color], 0)
      return {
        ...row,
        rfc: row.total === 0 ? null : redYellow / row.total,
        scoreAvg: row.total === 0 ? null : score / row.total,
      }
    })
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())

  return chronological
    .map((row, index) => ({ ...row, label: `Session ${index + 1}` }))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export function nextLearnerSessionNumber(input: {
  ledger: ResultRecord[]
  scheduling: SchedulingState
  learnerUserId: string
  classId?: string
  enrollments?: { classId: string; learnerUserId: string; status: string }[]
}): number {
  const ids = new Set<string>()
  const effective = effectiveResults(input.ledger)

  for (const record of effective) {
    if (record.learnerUserId === input.learnerUserId) {
      ids.add(record.learningSessionId)
    }
  }

  for (const session of input.scheduling.learningSessions) {
    if (session.status !== 'open' && session.status !== 'completed') continue
    if (input.classId && session.classId !== input.classId) continue

    if (session.participantLearnerIds?.includes(input.learnerUserId)) {
      ids.add(session.id)
    } else if (!session.participantLearnerIds || session.participantLearnerIds.length === 0) {
      const hasResults = effective.some(
        (r) => r.learningSessionId === session.id && r.learnerUserId === input.learnerUserId
      )
      if (hasResults) {
        ids.add(session.id)
      }
    }
  }

  return ids.size + 1
}

export function learnerCurrentSessionNumber(input: {
  ledger: ResultRecord[]
  scheduling: SchedulingState
  learnerUserId: string
  classId?: string
}): number {
  const ids = new Set<string>()
  const effective = effectiveResults(input.ledger)

  for (const record of effective) {
    if (record.learnerUserId === input.learnerUserId) {
      ids.add(record.learningSessionId)
    }
  }

  for (const session of input.scheduling.learningSessions) {
    if (session.status !== 'completed') continue
    if (input.classId && session.classId !== input.classId) continue

    if (session.participantLearnerIds?.includes(input.learnerUserId)) {
      ids.add(session.id)
    } else if (!session.participantLearnerIds || session.participantLearnerIds.length === 0) {
      const hasResults = effective.some(
        (r) => r.learningSessionId === session.id && r.learnerUserId === input.learnerUserId
      )
      if (hasResults) {
        ids.add(session.id)
      }
    }
  }

  return ids.size + 1
}

export function learnerRfcStats(rows: LearnerSessionSummary[]) {
  const values = rows.map((row) => row.rfc).filter((value): value is number => value != null)
  if (values.length === 0) return { min: null, max: null, avg: null, count: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min, max, avg, count: values.length }
}

export function formatPercent(value: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function emptyRow(session: LearningSession): LearnerSessionSummary {
  const label = session.sessionNumber ? `Session ${session.sessionNumber}` : session.id.slice(-6)
  return {
    learningSessionId: session.id,
    label,
    startedAt: session.startedAt,
    status: session.status,
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    indigo: 0,
    purple: 0,
    total: 0,
    rfc: null,
    scoreAvg: null,
    probeTotal: 0,
  }
}
