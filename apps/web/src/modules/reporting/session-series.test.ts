import { describe, expect, it } from 'vitest'
import {
  buildSessionMetricSeries,
  resolveSessionDayNumber,
  sessionDayBadge,
  sessionDayHash,
  sessionLabel,
} from './session-series'
import type { ResultRecord } from './progress'
import type { LearningSession } from '../scheduling/types'

const sessions: LearningSession[] = [
  {
    id: 'ls-1',
    classId: 'c1',
    scheduledSessionId: 's1',
    status: 'completed',
    plannedQuestionCount: null,
    startedAt: '2026-07-01T09:00:00.000Z',
    completedAt: '2026-07-01T10:00:00.000Z',
    maxProbeCount: 2,
    sessionNumber: 1,
    ownerUserId: null,
    lockExpiresAt: null,
    sessionKind: 'regular',
    participantLearnerIds: null,
  },
  {
    id: 'ls-2',
    classId: 'c1',
    scheduledSessionId: 's2',
    status: 'completed',
    plannedQuestionCount: null,
    startedAt: '2026-07-02T09:00:00.000Z',
    completedAt: '2026-07-02T10:00:00.000Z',
    maxProbeCount: 2,
    sessionNumber: 2,
    ownerUserId: null,
    lockExpiresAt: null,
    sessionKind: 'regular',
    participantLearnerIds: null,
  },
]

function rec(
  partial: Pick<ResultRecord, 'learningSessionId' | 'effectiveColor' | 'learnerUserId'>,
): ResultRecord {
  return {
    id: `r-${partial.learningSessionId}-${partial.learnerUserId}`,
    organizationId: 'org',
    courseId: 'course',
    classId: 'c1',
    teacherUserId: 't1',
    sessionQuestionId: 'q1',
    enteredProbeFlow: false,
    probeEventCount: 0,
    finalizedAt: '2026-07-01T10:00:00.000Z',
    ...partial,
  }
}

describe('session metric series', () => {
  it('labels day numbers and URL hash', () => {
    expect(sessionLabel(3)).toBe('Day 3')
    expect(sessionLabel(3, undefined, 15)).toBe('Day 3 / 15')
    expect(sessionDayBadge(3, 15)).toBe('#Day 3/15')
    expect(sessionDayHash(3)).toBe('#day-3')
  })

  it('resolves day number from sessionNumber or schedule order', () => {
    expect(
      resolveSessionDayNumber(
        {
          id: 'ls-1',
          classId: 'c1',
          sessionNumber: 4,
          scheduledSessionId: null,
          startedAt: '2026-07-01T09:00:00.000Z',
        },
        { scheduledSessions: [], learningSessions: [] },
      ),
    ).toBe(4)
  })

  it('builds one point per session with metrics', () => {
    const ledger: ResultRecord[] = [
      rec({ learningSessionId: 'ls-1', effectiveColor: 'green', learnerUserId: 'l1' }),
      rec({ learningSessionId: 'ls-1', effectiveColor: 'purple', learnerUserId: 'l2' }),
      rec({ learningSessionId: 'ls-2', effectiveColor: 'red', learnerUserId: 'l1' }),
    ]
    const points = buildSessionMetricSeries({
      ledger,
      learningSessions: sessions,
      metricKeys: ['rac', 'rfc'],
    })
    expect(points).toHaveLength(2)
    expect(points[0]!.sessionNumber).toBe(1)
    expect(points[0]!.label).toBe('Day 1')
    expect(points[0]!.metrics.rac).toBe(0.75)
    expect(points[1]!.sessionNumber).toBe(2)
    expect(points[1]!.metrics.rfc).toBe(1)
  })
})
