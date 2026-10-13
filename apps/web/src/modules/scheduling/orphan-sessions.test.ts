import { describe, expect, it } from 'vitest'
import type { RosterState } from '../roster/types'
import type { SchedulingState } from './types'
import { closeOrphanOpenSessions, openSessionParticipantNames } from './orphan-sessions'

const roster: RosterState = {
  organization: { id: 'org-1', name: 'Org' },
  users: [
    {
      id: 'teacher-1',
      displayName: 'Teacher',
      email: 'teacher@example.com',
      avatarUrl: null,
      roles: ['teacher'],
      accountStatus: 'active',
    },
    {
      id: 'learner-1',
      displayName: 'Lucy 01',
      email: 'lucy@example.com',
      avatarUrl: null,
      roles: ['learner'],
      accountStatus: 'active',
    },
  ],
  courses: [{ id: 'course-1', organizationId: 'org-1', code: 'ERE', name: 'ERE', status: 'active' }],
  classes: [
    {
      id: 'class-1',
      courseId: 'course-1',
      teacherUserId: 'teacher-1',
      name: 'ERE',
      capacity: 1,
      status: 'active',
      startsOn: null,
      endsOn: null,
      schedule: null,
    },
  ],
  enrollments: [
    {
      id: 'enroll-1',
      classId: 'class-1',
      learnerUserId: 'learner-1',
      status: 'active',
      startedAt: '2026-07-14T00:00:00.000Z',
      endedAt: null,
    },
  ],
}

function scheduling(participantLearnerIds: string[] | null): SchedulingState {
  return {
    scheduledSessions: [],
    attendance: [],
    learningSessions: [
      {
        id: 'session-1',
        classId: 'class-1',
        scheduledSessionId: null,
        status: 'open',
        plannedQuestionCount: null,
        startedAt: '2026-07-14T01:00:00.000Z',
        completedAt: null,
        maxProbeCount: 2,
        sessionNumber: 1,
        ownerUserId: 'teacher-1',
        lockExpiresAt: '2026-07-14T01:05:00.000Z',
        sessionKind: 'regular',
        participantLearnerIds,
      },
    ],
  }
}

describe('orphan open session cleanup', () => {
  it('closes an open session whose participant learner no longer exists', () => {
    const result = closeOrphanOpenSessions(
      roster,
      scheduling(['8f20e89a-2c0d-4a0b-83b8-7038f1f36c90']),
      '2026-07-14T02:00:00.000Z',
    )

    expect(result.changed).toBe(true)
    expect(result.closed).toHaveLength(1)
    expect(result.state.learningSessions[0]).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-14T02:00:00.000Z',
      ownerUserId: null,
      lockExpiresAt: null,
    })
  })

  it('keeps an open session with the active learner participant', () => {
    const result = closeOrphanOpenSessions(roster, scheduling(['learner-1']))
    expect(result.changed).toBe(false)
    expect(result.state.learningSessions[0]?.status).toBe('open')
  })

  it('reports missing participant display names', () => {
    const session = scheduling(['8f20e89a-2c0d-4a0b-83b8-7038f1f36c90']).learningSessions[0]!
    expect(openSessionParticipantNames(roster, session)).toEqual({
      names: ['8f20e8'],
      hasMissing: true,
    })
  })
})
