import { describe, expect, it } from 'vitest'
import {
  cancelScheduledSession,
  deleteScheduledSession,
  completeLearningSession,
  createScheduledSession,
  emptySchedulingState,
  nextTeachingDayNumber,
  recordAttendance,
  rescheduleSession,
  reindexSessionNumbers,
  startLearningSession,
} from './session-lifecycle'

const classId = 'class-1'
const learners = ['l1', 'l2', 'l3']

describe('session lifecycle and attendance', () => {
  it('starts a session from schedule without changing planned start', () => {
    let state = emptySchedulingState()
    const created = createScheduledSession(state, {
      classId,
      plannedStart: '2026-07-15T09:00:00.000Z',
      durationMinutes: 60,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    state = created.state
    const planned = created.value.plannedStart
    expect(created.value.sessionNumber).toBe(1)

    const started = startLearningSession(state, {
      classId,
      scheduledSessionId: created.value.id,
      at: '2026-07-15T09:05:00.000Z',
    })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.state.scheduledSessions[0]?.plannedStart).toBe(planned)
    expect(started.value.status).toBe('open')
    expect(started.value.sessionNumber).toBe(1)
  })

  it('rejects duplicate starts for same occurrence / open class session', () => {
    let state = emptySchedulingState()
    const created = createScheduledSession(state, {
      classId,
      plannedStart: '2026-07-15T09:00:00.000Z',
      durationMinutes: 60,
    })
    if (!created.ok) throw new Error(created.error)
    state = created.state

    const first = startLearningSession(state, {
      classId,
      scheduledSessionId: created.value.id,
    })
    if (!first.ok) throw new Error(first.error)
    state = first.state

    const dup = startLearningSession(state, {
      classId,
      scheduledSessionId: created.value.id,
    })
    expect(dup.ok).toBe(false)

    const secondOpen = startLearningSession(state, { classId })
    expect(secondOpen.ok).toBe(false)
  })

  it('accepts an explicit learner-history display session number', () => {
    const started = startLearningSession(emptySchedulingState(), {
      classId,
      participantLearnerIds: ['learner-1'],
      sessionNumber: 4,
    })

    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.value.sessionNumber).toBe(4)
  })

  it('completes from the participant list without separate attendance records', () => {
    const started = startLearningSession(emptySchedulingState(), {
      classId,
      participantLearnerIds: learners,
    })
    if (!started.ok) throw new Error(started.error)

    const done = completeLearningSession(started.state, started.value.id, learners)
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.value.status).toBe('completed')
    expect(done.value.completedAt).toBeTruthy()

    const afterDone = recordAttendance(done.state, {
      learningSessionId: started.value.id,
      learnerUserId: learners[0]!,
      status: 'late',
    })
    expect(afterDone.ok).toBe(false)
  })

  it('cancels and reschedules without deleting original history', () => {
    let state = emptySchedulingState()
    const created = createScheduledSession(state, {
      classId,
      plannedStart: '2026-07-20T09:00:00.000Z',
      durationMinutes: 45,
    })
    if (!created.ok) throw new Error(created.error)
    state = created.state

    const rescheduled = rescheduleSession(
      state,
      created.value.id,
      '2026-07-21T09:00:00.000Z',
    )
    expect(rescheduled.ok).toBe(true)
    if (!rescheduled.ok) return
    state = rescheduled.state
    expect(state.scheduledSessions).toHaveLength(2)
    expect(rescheduled.value.original.status).toBe('rescheduled')
    expect(rescheduled.value.replacement.rescheduledFromId).toBe(created.value.id)
    expect(rescheduled.value.original.plannedStart).toBe('2026-07-20T09:00:00.000Z')

    const cancel = cancelScheduledSession(state, rescheduled.value.replacement.id)
    expect(cancel.ok).toBe(true)
    if (!cancel.ok) return
    expect(cancel.state.scheduledSessions.find((s) => s.id === created.value.id)).toBeTruthy()
  })

  it('deletes a scheduled slot and reindexes day numbers', () => {
    let state = emptySchedulingState()
    const a = createScheduledSession(state, {
      classId,
      plannedStart: '2026-07-20T09:00:00.000Z',
      durationMinutes: 60,
      sessionNumber: 1,
    })
    if (!a.ok) throw new Error(a.error)
    state = a.state
    const b = createScheduledSession(state, {
      classId,
      plannedStart: '2026-07-22T09:00:00.000Z',
      durationMinutes: 60,
      sessionNumber: 2,
    })
    if (!b.ok) throw new Error(b.error)
    state = reindexSessionNumbers(b.state, classId)

    const del = deleteScheduledSession(state, a.value.id)
    expect(del.ok).toBe(true)
    if (!del.ok) return
    expect(del.state.scheduledSessions).toHaveLength(1)
    expect(del.state.scheduledSessions[0]?.sessionNumber).toBe(1)
  })

  it('assigns Day 2 after Day 1 even when a 15-slot course plan exists (not Day 16)', () => {
    let state = emptySchedulingState()
    // Simulate applied course plan with 15 placeholders
    for (let i = 1; i <= 15; i++) {
      const created = createScheduledSession(state, {
        classId,
        plannedStart: `2026-08-${String(i).padStart(2, '0')}T09:00:00.000Z`,
        durationMinutes: 60,
        sessionNumber: i,
      })
      if (!created.ok) throw new Error(created.error)
      state = created.state
    }
    state = reindexSessionNumbers(state, classId)
    expect(state.scheduledSessions).toHaveLength(15)

    // Live Day 1 from first plan slot
    const day1 = startLearningSession(state, {
      classId,
      scheduledSessionId: state.scheduledSessions[0]!.id,
      at: '2026-08-01T09:05:00.000Z',
    })
    if (!day1.ok) throw new Error(day1.error)
    expect(day1.value.sessionNumber).toBe(1)
    state = day1.state

    // Complete day 1 so we can open day 2
    for (const learnerId of learners) {
      const att = recordAttendance(state, {
        learningSessionId: day1.value.id,
        learnerUserId: learnerId,
        status: 'present',
      })
      if (!att.ok) throw new Error(att.error)
      state = att.state
    }
    const done = completeLearningSession(state, day1.value.id, learners)
    if (!done.ok) throw new Error(done.error)
    state = done.state

    expect(nextTeachingDayNumber(state, classId)).toBe(2)

    // Ad-hoc / flexible start must be Day 2, not 16
    const day2 = startLearningSession(state, {
      classId,
      at: '2026-08-02T09:00:00.000Z',
    })
    expect(day2.ok).toBe(true)
    if (!day2.ok) return
    expect(day2.value.sessionNumber).toBe(2)

    // Flexible calendar slot also gets provisional next teaching day (2), not 16
    const flexible = createScheduledSession(state, {
      classId,
      plannedStart: '2026-08-03T10:00:00.000Z',
      durationMinutes: 60,
    })
    expect(flexible.ok).toBe(true)
    if (!flexible.ok) return
    expect(flexible.value.sessionNumber).toBe(2)
  })
})
