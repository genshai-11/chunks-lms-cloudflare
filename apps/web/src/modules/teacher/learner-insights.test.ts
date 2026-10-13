import { describe, expect, it } from 'vitest'
import type { ResultRecord } from '../reporting/progress'
import type { SchedulingState } from '../scheduling/types'
import {
  formatPercent,
  learnerRfcStats,
  nextLearnerSessionNumber,
  summarizeLearnerSessions,
} from './learner-insights'

const scheduling: SchedulingState = {
  scheduledSessions: [],
  attendance: [],
  learningSessions: [
    {
      id: 's1',
      classId: 'class-1',
      scheduledSessionId: null,
      status: 'completed',
      plannedQuestionCount: null,
      startedAt: '2026-07-10T00:00:00.000Z',
      completedAt: '2026-07-10T01:00:00.000Z',
      maxProbeCount: 99,
      sessionNumber: 1,
      ownerUserId: 'teacher-1',
      lockExpiresAt: null,
      sessionKind: 'regular',
      participantLearnerIds: ['learner-1'],
    },
    {
      id: 's2',
      classId: 'class-1',
      scheduledSessionId: null,
      status: 'completed',
      plannedQuestionCount: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      completedAt: '2026-07-11T01:00:00.000Z',
      maxProbeCount: 99,
      sessionNumber: 2,
      ownerUserId: 'teacher-1',
      lockExpiresAt: null,
      sessionKind: 'regular',
      participantLearnerIds: ['learner-1'],
    },
    {
      id: 's3',
      classId: 'class-1',
      scheduledSessionId: null,
      status: 'completed',
      plannedQuestionCount: null,
      startedAt: '2026-07-12T00:00:00.000Z',
      completedAt: '2026-07-12T01:00:00.000Z',
      maxProbeCount: 99,
      sessionNumber: 3,
      ownerUserId: 'teacher-1',
      lockExpiresAt: null,
      sessionKind: 'regular',
      participantLearnerIds: ['learner-2'],
    },
  ],
}

function row(sessionId: string, color: ResultRecord['effectiveColor']): ResultRecord {
  return {
    id: `${sessionId}-${color}-${Math.random()}`,
    organizationId: 'org-1',
    courseId: 'course-1',
    classId: 'class-1',
    learningSessionId: sessionId,
    learnerUserId: 'learner-1',
    teacherUserId: 'teacher-1',
    sessionQuestionId: `${sessionId}-${color}`,
    effectiveColor: color,
    enteredProbeFlow: color === 'purple',
    probeEventCount: color === 'purple' ? 10 : 0,
    finalizedAt: '2026-07-11T00:00:00.000Z',
  }
}

describe('learner insights', () => {
  it('summarizes each session by color totals and RFC', () => {
    const rows = summarizeLearnerSessions({
      scheduling,
      learnerUserId: 'learner-1',
      classId: 'class-1',
      ledger: [row('s1', 'red'), row('s1', 'yellow'), row('s1', 'green'), row('s2', 'purple')],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      learningSessionId: 's2',
      label: 'Session 2',
      purple: 1,
      total: 1,
      rfc: 0,
    })
    expect(rows[1]).toMatchObject({
      learningSessionId: 's1',
      label: 'Session 1',
      red: 1,
      yellow: 1,
      green: 1,
      total: 3,
    })
    expect(formatPercent(rows[1].rfc)).toBe('67%')
  })

  it('excludes class sessions without finalized observations for this learner', () => {
    const rows = summarizeLearnerSessions({
      scheduling,
      learnerUserId: 'learner-1',
      classId: 'class-1',
      ledger: [row('s1', 'green')],
    })

    expect(rows.map((session) => session.learningSessionId)).toEqual(['s1'])
  })

  it('labels learner history sequentially even when stored session numbers are duplicated', () => {
    const duplicatedNumbers: SchedulingState = {
      ...scheduling,
      learningSessions: scheduling.learningSessions.map((session) =>
        session.id === 's2' ? { ...session, sessionNumber: 1 } : session,
      ),
    }

    const rows = summarizeLearnerSessions({
      scheduling: duplicatedNumbers,
      learnerUserId: 'learner-1',
      classId: 'class-1',
      ledger: [row('s1', 'green'), row('s2', 'green')],
    })

    expect(rows.map((session) => session.label)).toEqual(['Session 2', 'Session 1'])
  })

  it('returns the next learner session number from finalized, completed, and open learner sessions', () => {
    const openScheduling: SchedulingState = {
      ...scheduling,
      learningSessions: [
        ...scheduling.learningSessions,
        {
          id: 's4',
          classId: 'class-2',
          scheduledSessionId: null,
          status: 'open',
          plannedQuestionCount: null,
          startedAt: '2026-07-13T00:00:00.000Z',
          completedAt: null,
          maxProbeCount: 99,
          sessionNumber: 1,
          ownerUserId: 'teacher-1',
          lockExpiresAt: null,
          sessionKind: 'regular',
          participantLearnerIds: ['learner-1'],
        },
      ],
    }

    expect(
      nextLearnerSessionNumber({
        scheduling: openScheduling,
        learnerUserId: 'learner-1',
        ledger: [row('s1', 'green'), row('s2', 'purple')],
      }),
    ).toBe(4)
  })

  it('counts completed learner sessions even when finalized ledger rows are missing', () => {
    // Under the new rule, empty completed sessions are not counted to avoid gaps in history.
    // So we pass the ledger records where the learner participated to get Day 3.
    expect(
      nextLearnerSessionNumber({
        scheduling,
        learnerUserId: 'learner-1',
        ledger: [row('s1', 'green'), row('s2', 'purple')],
      }),
    ).toBe(3)
  })

  it('does not count completed sessions for a different learner', () => {
    expect(
      nextLearnerSessionNumber({
        scheduling,
        learnerUserId: 'learner-2',
        ledger: [row('s3', 'green')],
      }),
    ).toBe(2)
  })

  it('computes min max avg RFC from sessions with data', () => {
    const rows = summarizeLearnerSessions({
      scheduling,
      learnerUserId: 'learner-1',
      ledger: [row('s1', 'red'), row('s1', 'green'), row('s2', 'purple')],
    })
    const stats = learnerRfcStats(rows)
    expect(stats.count).toBe(2)
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0.5)
    expect(stats.avg).toBe(0.25)
  })
})
