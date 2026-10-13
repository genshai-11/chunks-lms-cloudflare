import { describe, expect, it } from 'vitest'
import { createSeedRoster } from '../roster/seed'
import { activeEnrollmentsForClass } from '../roster/service'
import {
  completeLearningSession,
  createScheduledSession,
  emptySchedulingState,
  recordAttendance,
  startLearningSession,
} from '../scheduling/session-lifecycle'
import { appendResult, type ResultRecord } from '../reporting/progress'
import { buildSessionOpsBoard, buildScheduledToday } from './board'
import { correctFinalizedResult, filterAuditEvents } from './audit'
import { effectiveResults, resultKey } from './effective-results'
import { buildSessionArchive } from './session-archive'

function seedSession() {
  const roster = createSeedRoster()
  const classRow = roster.classes[0]!
  let scheduling = emptySchedulingState()
  const planned = createScheduledSession(scheduling, {
    classId: classRow.id,
    plannedStart: new Date().toISOString(),
    durationMinutes: 60,
    sessionNumber: 1,
  })
  if (!planned.ok) throw new Error(planned.error)
  scheduling = planned.state
  const started = startLearningSession(scheduling, {
    classId: classRow.id,
    scheduledSessionId: planned.value.id,
    at: new Date().toISOString(),
  })
  if (!started.ok) throw new Error(started.error)
  scheduling = started.state
  const learners = activeEnrollmentsForClass(roster, classRow.id)
  for (const e of learners) {
    const att = recordAttendance(scheduling, {
      learningSessionId: started.value.id,
      learnerUserId: e.learnerUserId,
      status: 'present',
      at: new Date().toISOString(),
    })
    if (!att.ok) throw new Error(att.error)
    scheduling = att.state
  }
  return { roster, scheduling, classRow, learningSession: started.value, learners }
}

describe('effectiveResults', () => {
  it('keeps latest row per attempt key', () => {
    const base = {
      organizationId: 'o',
      courseId: 'c',
      classId: 'cl',
      learningSessionId: 's1',
      learnerUserId: 'l1',
      teacherUserId: 't1',
      sessionQuestionId: 'q1',
      enteredProbeFlow: false,
      probeEventCount: 0,
    }
    let ledger: ResultRecord[] = []
    ledger = appendResult(ledger, {
      ...base,
      effectiveColor: 'red',
      finalizedAt: '2026-07-01T10:00:00.000Z',
    })
    ledger = appendResult(ledger, {
      ...base,
      effectiveColor: 'green',
      finalizedAt: '2026-07-01T11:00:00.000Z',
    })
    const eff = effectiveResults(ledger)
    expect(eff).toHaveLength(1)
    expect(eff[0]!.effectiveColor).toBe('green')
  })
})

describe('ops board', () => {
  it('builds session ops with attendance rate', () => {
    const { roster, scheduling, classRow, learningSession, learners } = seedSession()
    const board = buildSessionOpsBoard(roster, scheduling, [], { classId: classRow.id })
    expect(board).toHaveLength(1)
    expect(board[0]!.learningSessionId).toBe(learningSession.id)
    expect(board[0]!.attendanceMarked).toBe(learners.length)
    expect(board[0]!.attendanceRate).toBe(100)
  })

  it('lists scheduled today', () => {
    const roster = createSeedRoster()
    let scheduling = emptySchedulingState()
    const planned = createScheduledSession(scheduling, {
      classId: roster.classes[0]!.id,
      plannedStart: new Date().toISOString(),
      durationMinutes: 45,
    })
    if (!planned.ok) throw new Error(planned.error)
    scheduling = planned.state
    const today = buildScheduledToday(roster, scheduling, new Date())
    expect(today.some((s) => s.scheduledId === planned.value.id)).toBe(true)
  })
})

describe('audit correction', () => {
  it('appends corrected result and audit event with reason', () => {
    const { roster, classRow, learningSession, learners } = seedSession()
    const learner = learners[0]!
    let ledger: ResultRecord[] = []
    ledger = appendResult(ledger, {
      organizationId: roster.organization.id,
      courseId: classRow.courseId,
      classId: classRow.id,
      learningSessionId: learningSession.id,
      learnerUserId: learner.learnerUserId,
      teacherUserId: classRow.teacherUserId,
      sessionQuestionId: 'q-1',
      effectiveColor: 'yellow',
      enteredProbeFlow: true,
      probeEventCount: 1,
      finalizedAt: '2026-07-11T10:00:00.000Z',
    })
    const key = resultKey(ledger[0]!)
    const corrected = correctFinalizedResult(ledger, [], {
      resultKey: key,
      color: 'purple',
      reason: 'Mis-tap during observe',
      actorId: 'admin-1',
      at: '2026-07-11T12:00:00.000Z',
    })
    expect(corrected.ok).toBe(true)
    if (!corrected.ok) return
    expect(effectiveResults(corrected.ledger)[0]!.effectiveColor).toBe('purple')
    expect(corrected.audit[0]!.type).toBe('result_corrected')
    expect(corrected.audit[0]!.reason).toBe('Mis-tap during observe')
    expect(corrected.audit[0]!.previousColor).toBe('yellow')

    const filtered = filterAuditEvents(corrected.audit, { type: 'result_corrected' })
    expect(filtered).toHaveLength(1)
  })

  it('rejects empty reason', () => {
    const r = correctFinalizedResult([], [], {
      resultKey: 'x',
      color: 'red',
      reason: '   ',
      actorId: 'a',
    })
    expect(r.ok).toBe(false)
  })
})

describe('session archive', () => {
  it('lists completed days with result cells', () => {
    const { roster, scheduling, classRow, learningSession, learners } = seedSession()
    const completed = completeLearningSession(
      scheduling,
      learningSession.id,
      learners.map((e) => e.learnerUserId),
      new Date().toISOString(),
    )
    expect(completed.ok).toBe(true)
    if (!completed.ok) return
    let ledger: ResultRecord[] = []
    ledger = appendResult(ledger, {
      organizationId: roster.organization.id,
      courseId: classRow.courseId,
      classId: classRow.id,
      learningSessionId: learningSession.id,
      learnerUserId: learners[0]!.learnerUserId,
      teacherUserId: classRow.teacherUserId,
      sessionQuestionId: 'q-1',
      effectiveColor: 'green',
      enteredProbeFlow: false,
      probeEventCount: 0,
      finalizedAt: learningSession.startedAt,
    })
    const archive = buildSessionArchive(roster, completed.state, ledger, classRow.id)
    expect(archive).toHaveLength(1)
    expect(archive[0]!.resultCount).toBe(1)
    expect(archive[0]!.cells[0]!.color).toBe('green')
  })
})
