import { describe, expect, it } from 'vitest'
import { formatDelta } from './progress'
import {
  appendResult,
  buildCourseProgressReport,
  buildLearnerProgressReport,
  type ResultRecord,
} from './progress'
import { resolveReportWindow } from './report-window'

const base = {
  organizationId: 'org',
  courseId: 'course-1',
  classId: 'class-1',
  teacherUserId: 'teacher',
  sessionQuestionId: 'q1',
  enteredProbeFlow: false,
  probeEventCount: 0,
}

function rec(
  partial: Partial<ResultRecord> & Pick<ResultRecord, 'id' | 'learnerUserId' | 'effectiveColor' | 'finalizedAt' | 'learningSessionId'>,
): ResultRecord {
  return { ...base, ...partial }
}

describe('course progress projections', () => {
  it('aggregates learner course metrics in a custom window', () => {
    let ledger: ResultRecord[] = []
    ledger = appendResult(ledger, rec({
      id: '1',
      learnerUserId: 'l1',
      learningSessionId: 's1',
      effectiveColor: 'green',
      finalizedAt: '2026-07-10T10:00:00.000Z',
    }))
    ledger = appendResult(ledger, rec({
      id: '2',
      learnerUserId: 'l1',
      learningSessionId: 's1',
      effectiveColor: 'red',
      finalizedAt: '2026-07-10T10:05:00.000Z',
    }))
    ledger = appendResult(ledger, rec({
      id: '3',
      learnerUserId: 'l2',
      learningSessionId: 's1',
      effectiveColor: 'purple',
      finalizedAt: '2026-07-10T10:06:00.000Z',
    }))
    // outside window
    ledger = appendResult(ledger, rec({
      id: '4',
      learnerUserId: 'l1',
      learningSessionId: 's0',
      effectiveColor: 'red',
      finalizedAt: '2026-06-01T10:00:00.000Z',
    }))

    const window = resolveReportWindow({
      kind: 'custom',
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    })
    const report = buildCourseProgressReport(ledger, 'course-1', window, {
      learnerIds: ['l1', 'l2'],
    })

    expect(report.overall.current.find((m) => m.key === 'rfc')?.sampleSize).toBe(3)
    const l1 = report.byLearner.find((x) => x.learnerUserId === 'l1')!
    expect(l1.attemptCount).toBe(2)
    expect(l1.comparison.current.find((m) => m.key === 'rac')?.value).toBeCloseTo(0.25)
  })

  it('shows no trend when prior window empty', () => {
    const ledger = [
      rec({
        id: '1',
        learnerUserId: 'l1',
        learningSessionId: 's1',
        effectiveColor: 'green',
        finalizedAt: '2026-07-10T10:00:00.000Z',
      }),
    ]
    const window = resolveReportWindow({
      kind: 'custom',
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-07-15T00:00:00.000Z',
    })
    const report = buildLearnerProgressReport(ledger, 'l1', window, { courseId: 'course-1' })
    expect(report.comparison.previous).toBeNull()
    expect(formatDelta('rac', report.comparison.deltas.rac)).toBe('no trend')
  })
})
