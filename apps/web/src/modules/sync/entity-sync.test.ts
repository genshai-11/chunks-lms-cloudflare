import { describe, expect, it } from 'vitest'
import type { LearningSession, SchedulingState } from '../scheduling/types'
import {
  acquireSessionLock,
  canHoldSessionLock,
  dedupeById,
  mergeScheduling,
  protectedLearningSessionIds,
  prunableIds,
  releaseSessionLock,
} from './entity-sync'

function ls(partial: Partial<LearningSession> & { id: string; classId: string }): LearningSession {
  return {
    scheduledSessionId: null,
    status: 'open',
    plannedQuestionCount: null,
    startedAt: '2026-07-11T10:00:00.000Z',
    completedAt: null,
    maxProbeCount: 2,
    sessionNumber: 1,
    ownerUserId: null,
    lockExpiresAt: null,
    sessionKind: 'regular',
    participantLearnerIds: null,
    ...partial,
  }
}

describe('prunableIds / protected sessions', () => {
  it('dedupes rows by id before bulk upsert', () => {
    expect(
      dedupeById([
        { id: 's1', value: 1 },
        { id: 's1', value: 2 },
        { id: 's2', value: 3 },
      ]),
    ).toEqual([
      { id: 's1', value: 2 },
      { id: 's2', value: 3 },
    ])
  })

  it('never prunes protected open session ids', () => {
    const protectedIds = protectedLearningSessionIds(
      {
        scheduledSessions: [],
        learningSessions: [ls({ id: 'open-1', classId: 'c1', status: 'open' })],
        attendance: [],
      },
      ['remote-open'],
    )
    expect(protectedIds.has('open-1')).toBe(true)
    expect(protectedIds.has('remote-open')).toBe(true)
    expect(prunableIds(['a'], ['a', 'open-1', 'gone'], protectedIds)).toEqual(['gone'])
  })
})

describe('mergeScheduling', () => {
  it('imports remote open session when local has none for class', () => {
    const local: SchedulingState = {
      scheduledSessions: [],
      learningSessions: [],
      attendance: [],
    }
    const remote: SchedulingState = {
      scheduledSessions: [],
      learningSessions: [ls({ id: 'r1', classId: 'c1', status: 'open', ownerUserId: 't1' })],
      attendance: [],
    }
    const merged = mergeScheduling(local, remote)
    expect(merged.learningSessions).toHaveLength(1)
    expect(merged.learningSessions[0]!.id).toBe('r1')
  })

  it('does not reopen a locally completed session from stale remote data', () => {
    const local: SchedulingState = {
      scheduledSessions: [],
      learningSessions: [
        ls({
          id: 'same-session',
          classId: 'c1',
          status: 'completed',
          completedAt: '2026-07-11T11:00:00.000Z',
        }),
      ],
      attendance: [],
    }
    const remote: SchedulingState = {
      scheduledSessions: [],
      learningSessions: [
        ls({ id: 'same-session', classId: 'c1', status: 'open', ownerUserId: 'teacher-1' }),
      ],
      attendance: [],
    }

    const merged = mergeScheduling(local, remote)

    expect(merged.learningSessions).toHaveLength(1)
    expect(merged.learningSessions[0]?.status).toBe('completed')
  })

  it('keeps local completed and adds remote-only scheduled', () => {
    const local: SchedulingState = {
      scheduledSessions: [],
      learningSessions: [
        ls({
          id: 'l1',
          classId: 'c1',
          status: 'completed',
          completedAt: '2026-07-11T11:00:00.000Z',
        }),
      ],
      attendance: [],
    }
    const remote: SchedulingState = {
      scheduledSessions: [
        {
          id: 's1',
          classId: 'c1',
          plannedStart: '2026-07-12T10:00:00.000Z',
          durationMinutes: 60,
          status: 'scheduled',
          rescheduledFromId: null,
          sessionNumber: 2,
        },
      ],
      learningSessions: [
        ls({
          id: 'l1',
          classId: 'c1',
          status: 'completed',
          completedAt: '2026-07-11T11:00:00.000Z',
        }),
      ],
      attendance: [],
    }
    const merged = mergeScheduling(local, remote)
    expect(merged.scheduledSessions.map((s) => s.id)).toContain('s1')
    expect(merged.learningSessions.find((s) => s.id === 'l1')?.status).toBe('completed')
  })
})

describe('session locks', () => {
  it('acquires and blocks other teachers until expiry', () => {
    const open = ls({ id: 's1', classId: 'c1' })
    const locked = acquireSessionLock(open, 'teacher-a', '2026-07-11T10:00:00.000Z', 60_000)
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    expect(locked.session.ownerUserId).toBe('teacher-a')
    expect(canHoldSessionLock(locked.session, 'teacher-b', '2026-07-11T10:00:30.000Z')).toBe(false)
    expect(canHoldSessionLock(locked.session, 'teacher-a', '2026-07-11T10:00:30.000Z')).toBe(true)
    // after expiry
    expect(canHoldSessionLock(locked.session, 'teacher-b', '2026-07-11T10:02:00.000Z')).toBe(true)
    const released = releaseSessionLock(locked.session)
    expect(released.ownerUserId).toBeNull()
  })
})
