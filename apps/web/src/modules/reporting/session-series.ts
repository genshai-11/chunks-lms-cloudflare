/**
 * Per-session metric series for dashboards and dynamic charts.
 * Course with 15 buổi → each learning session carries sessionNumber 1..15.
 */
import { calculateMetrics, type MetricKey, type MetricObservation } from '../metrics/calculate'
import type { MetricSettingsState } from '../metrics/settings'
import { getEnabledMetricKeys } from '../metrics/settings'
import type { LearningSession } from '../scheduling/types'
import type { ResultRecord } from './progress'

export type SessionMetricPoint = {
  learningSessionId: string
  /** Buổi # (1-based) */
  sessionNumber: number
  label: string
  startedAt: string
  attemptCount: number
  metrics: Partial<Record<MetricKey, number | null>>
  sampleSizes: Partial<Record<MetricKey, number>>
}

export type SessionCompareRow = {
  key: MetricKey
  label: string
  unit: MetricObservation['unit']
  bySession: Array<{ sessionNumber: number; label: string; value: number | null; n: number }>
}

function toFinalized(r: ResultRecord) {
  return {
    effectiveColor: r.effectiveColor,
    enteredProbeFlow: r.enteredProbeFlow,
    probeEventCount: r.probeEventCount,
    learnerId: r.learnerUserId,
  }
}

/**
 * Human label for a class meeting: "Day 1" … "Day 15" (sessionNumber is 1-based).
 * Optional totalDays → "Day 3 / 15".
 */
export function sessionLabel(
  sessionNumber: number | null | undefined,
  startedAt?: string,
  totalDays?: number | null,
): string {
  if (sessionNumber != null) {
    if (totalDays != null && totalDays > 0) return `Day ${sessionNumber} / ${totalDays}`
    return `Day ${sessionNumber}`
  }
  if (startedAt) {
    return new Date(startedAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })
  }
  return 'Day —'
}

/** Compact badge form: "#Day 1" */
export function sessionDayBadge(
  sessionNumber: number | null | undefined,
  totalDays?: number | null,
): string {
  if (sessionNumber == null) return '#Day —'
  if (totalDays != null && totalDays > 0) return `#Day ${sessionNumber}/${totalDays}`
  return `#Day ${sessionNumber}`
}

/** URL hash for observe, e.g. "#day-3" */
export function sessionDayHash(sessionNumber: number | null | undefined): string {
  if (sessionNumber == null || sessionNumber < 1) return '#day'
  return `#day-${sessionNumber}`
}

/**
 * Resolve 1-based day index for a live Learning Session
 * (sessionNumber → linked schedule → order among class sessions).
 */
export function resolveSessionDayNumber(
  openSession: {
    id: string
    classId: string
    sessionNumber: number | null
    scheduledSessionId: string | null
    startedAt: string
  },
  ctx: {
    scheduledSessions: Array<{
      id: string
      classId: string
      sessionNumber: number | null
      status: string
    }>
    learningSessions: Array<{
      id: string
      classId: string
      sessionNumber: number | null
      startedAt: string
    }>
  },
): number {
  if (openSession.sessionNumber != null && openSession.sessionNumber > 0) {
    return openSession.sessionNumber
  }
  if (openSession.scheduledSessionId) {
    const sched = ctx.scheduledSessions.find((s) => s.id === openSession.scheduledSessionId)
    if (sched?.sessionNumber != null && sched.sessionNumber > 0) return sched.sessionNumber
  }
  const ordered = ctx.learningSessions
    .filter((s) => s.classId === openSession.classId)
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const idx = ordered.findIndex((s) => s.id === openSession.id)
  return idx >= 0 ? idx + 1 : 1
}

/**
 * Build ordered metric points for each learning session that has results.
 */
export function buildSessionMetricSeries(input: {
  ledger: ResultRecord[]
  learningSessions: LearningSession[]
  courseId?: string
  classId?: string
  learnerUserId?: string
  metricKeys?: MetricKey[]
}): SessionMetricPoint[] {
  const sessions = input.learningSessions
    .filter((s) => !input.classId || s.classId === input.classId)
    .slice()
    .sort((a, b) => {
      const na = a.sessionNumber ?? 9999
      const nb = b.sessionNumber ?? 9999
      if (na !== nb) return na - nb
      return a.startedAt.localeCompare(b.startedAt)
    })

  const points: SessionMetricPoint[] = []
  let fallbackNum = 1

  for (const s of sessions) {
    const records = input.ledger.filter((r) => {
      if (r.learningSessionId !== s.id) return false
      if (input.courseId && r.courseId !== input.courseId) return false
      if (input.classId && r.classId !== input.classId) return false
      if (input.learnerUserId && r.learnerUserId !== input.learnerUserId) return false
      return true
    })
    if (records.length === 0) continue

    const num = s.sessionNumber ?? fallbackNum++
    const obs = calculateMetrics(records.map(toFinalized))
    const metrics: SessionMetricPoint['metrics'] = {}
    const sampleSizes: SessionMetricPoint['sampleSizes'] = {}
    for (const o of obs) {
      if (input.metricKeys && !input.metricKeys.includes(o.key)) continue
      metrics[o.key] = o.value
      sampleSizes[o.key] = o.sampleSize
    }

    points.push({
      learningSessionId: s.id,
      sessionNumber: num,
      label: sessionLabel(num, s.startedAt),
      startedAt: s.startedAt,
      attemptCount: records.length,
      metrics,
      sampleSizes,
    })
  }

  return points
}

export function buildSessionCompareTable(
  points: SessionMetricPoint[],
  settings: MetricSettingsState,
): SessionCompareRow[] {
  const keys = getEnabledMetricKeys(settings)
  return keys.map((key) => {
    const meta = settings.metrics.find((m) => m.key === key)
    return {
      key,
      label: meta?.label ?? key,
      unit: meta?.definition.includes('/') ? 'ratio' : 'score',
      bySession: points.map((p) => ({
        sessionNumber: p.sessionNumber,
        label: p.label,
        value: p.metrics[key] ?? null,
        n: p.sampleSizes[key] ?? p.attemptCount,
      })),
    }
  })
}

/** Chart-ready rows: one object per session with metric fields as numbers. */
export function toChartRows(
  points: SessionMetricPoint[],
  metricKeys: MetricKey[],
): Array<Record<string, string | number | null>> {
  return points.map((p) => {
    const row: Record<string, string | number | null> = {
      name: p.label,
      sessionNumber: p.sessionNumber,
      attempts: p.attemptCount,
    }
    for (const k of metricKeys) {
      const v = p.metrics[k]
      // ratios → percent for readable charts
      if (v == null) row[k] = null
      else if (
        k === 'rfc' ||
        k === 'rac' ||
        k.includes('rate') ||
        k === 'awareness_recovery' ||
        k === 'purple_mastery_rate'
      ) {
        row[k] = Math.round(v * 1000) / 10
      } else {
        row[k] = Math.round(v * 100) / 100
      }
    }
    return row
  })
}
