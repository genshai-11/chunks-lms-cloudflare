import {
  compareEqualDurationWindows,
  type FinalizedAttempt,
  type MetricObservation,
  type WindowComparison,
} from '../metrics/calculate'
import type { ResultColor } from '../result-lifecycle/types'
import {
  isInWindow,
  precedingEqualDurationWindow,
  type ReportWindow,
} from './report-window'

/** Append-only effective result eligible for metrics (finalized or corrected). */
export type ResultRecord = {
  id: string
  organizationId: string
  courseId: string
  classId: string
  learningSessionId: string
  learnerUserId: string
  teacherUserId: string
  sessionQuestionId: string
  effectiveColor: ResultColor
  enteredProbeFlow: boolean
  probeEventCount: number
  /** When the effective final/corrected result became eligible */
  finalizedAt: string
}

export type ProgressFilters = {
  courseId?: string
  classId?: string
  learnerUserId?: string
  learningSessionId?: string
}

export type LearnerProgressReport = {
  learnerUserId: string
  window: ReportWindow
  comparison: WindowComparison
  attemptCount: number
  attendanceSummary?: { present: number; late: number; absent: number; excused: number }
}

export type CourseProgressReport = {
  courseId: string
  window: ReportWindow
  overall: WindowComparison
  byLearner: LearnerProgressReport[]
}

function toFinalized(record: ResultRecord): FinalizedAttempt {
  return {
    effectiveColor: record.effectiveColor,
    enteredProbeFlow: record.enteredProbeFlow,
    probeEventCount: record.probeEventCount,
    learnerId: record.learnerUserId,
  }
}

export function filterResults(
  records: ResultRecord[],
  window: ReportWindow,
  filters: ProgressFilters = {},
): ResultRecord[] {
  return records.filter((r) => {
    if (filters.courseId && r.courseId !== filters.courseId) return false
    if (filters.classId && r.classId !== filters.classId) return false
    if (filters.learnerUserId && r.learnerUserId !== filters.learnerUserId) return false
    if (filters.learningSessionId && r.learningSessionId !== filters.learningSessionId) {
      return false
    }
    if (window.learningSessionId && r.learningSessionId !== window.learningSessionId) {
      return false
    }
    return isInWindow(r.finalizedAt, window)
  })
}

export function buildCourseProgressReport(
  records: ResultRecord[],
  courseId: string,
  window: ReportWindow,
  options?: { learnerIds?: string[] },
): CourseProgressReport {
  const filters: ProgressFilters = { courseId }
  const current = filterResults(records, window, filters)
  const priorWindow = precedingEqualDurationWindow(window)
  const previous = filterResults(records, priorWindow, filters)

  const overall = compareEqualDurationWindows(
    current.map(toFinalized),
    previous.length === 0 ? null : previous.map(toFinalized),
  )

  const learnerIds =
    options?.learnerIds ??
    [...new Set(current.map((r) => r.learnerUserId).concat(previous.map((r) => r.learnerUserId)))]

  const byLearner: LearnerProgressReport[] = learnerIds.map((learnerUserId) => {
    const cur = filterResults(records, window, { courseId, learnerUserId })
    const prev = filterResults(records, priorWindow, { courseId, learnerUserId })
    return {
      learnerUserId,
      window,
      comparison: compareEqualDurationWindows(
        cur.map(toFinalized),
        prev.length === 0 ? null : prev.map(toFinalized),
      ),
      attemptCount: cur.length,
    }
  })

  return { courseId, window, overall, byLearner }
}

export function buildLearnerProgressReport(
  records: ResultRecord[],
  learnerUserId: string,
  window: ReportWindow,
  filters: Omit<ProgressFilters, 'learnerUserId'> = {},
): LearnerProgressReport {
  const current = filterResults(records, window, { ...filters, learnerUserId })
  const priorWindow = precedingEqualDurationWindow(window)
  const previous = filterResults(records, priorWindow, { ...filters, learnerUserId })

  return {
    learnerUserId,
    window,
    comparison: compareEqualDurationWindows(
      current.map(toFinalized),
      previous.length === 0 ? null : previous.map(toFinalized),
    ),
    attemptCount: current.length,
  }
}

export function formatMetricValue(m: MetricObservation): string {
  if (m.value === null) return '—'
  if (m.unit === 'ratio') return `${(m.value * 100).toFixed(1)}%`
  if (m.unit === 'count') return String(Math.round(m.value))
  return m.value.toFixed(2)
}

/** Trend label: null prior → no trend (never fake zero). */
export function formatDelta(key: string, delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return 'no trend'
  const sign = delta > 0 ? '+' : ''
  if (key === 'rfc' || key === 'rac' || key.includes('rate') || key === 'awareness_recovery') {
    return `${sign}${delta.toFixed(1)} pp`
  }
  return `${sign}${delta.toFixed(2)}`
}

export function appendResult(
  ledger: ResultRecord[],
  record: Omit<ResultRecord, 'id'> & { id?: string },
): ResultRecord[] {
  const row: ResultRecord = {
    ...record,
    id: record.id ?? `res-${ledger.length + 1}-${record.finalizedAt}`,
  }
  // Corrections: same attempt identity would replace effective view via latest finalizedAt;
  // ledger stays append-only for audit; reporting uses latest per attempt if needed.
  return [...ledger, row]
}
