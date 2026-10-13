import { describe, expect, it } from 'vitest'
import { assignedLearnerIndex } from './capture-mode'
import {
  addSessionQuestion,
  attemptCountsByLearner,
  attemptsForQuestion,
  createCaptureSession,
  markSessionCompleted,
  recordColorForCurrent,
  resolveProbeForCurrent,
  setCaptureMode,
  sessionColorSummary,
} from './session-capture'

const learners = ['learner-1', 'learner-2', 'learner-3']

describe('one-result-per-sentence assignment', () => {
  it('creates exactly one Assessment Attempt per Session Question', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
    })
    const q = addSessionQuestion(state)
    expect(q.ok).toBe(true)
    if (!q.ok) return
    state = q.state
    expect(attemptsForQuestion(state, q.value.id)).toHaveLength(1)
    expect(q.value.assignedLearnerUserId).toBe('learner-1')
  })

  it('round-robins learners so 100 questions / 2 learners ≈ 50 each', () => {
    const pair = ['a', 'b']
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 't',
      learnerIds: pair,
    })
    for (let i = 0; i < 100; i++) {
      const q = addSessionQuestion(state)
      expect(q.ok).toBe(true)
      if (!q.ok) return
      state = q.state
      expect(q.value.assignedLearnerUserId).toBe(pair[assignedLearnerIndex(i, 2)])
    }
    const counts = attemptCountsByLearner(state)
    expect(counts.a).toBe(50)
    expect(counts.b).toBe(50)
    expect(state.attempts).toHaveLength(100)
    expect(state.questions).toHaveLength(100)
  })

  it('supports mode switch without rewriting attempts', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
      mode: 'question_first',
    })
    const q1 = addSessionQuestion(state)
    if (!q1.ok) throw new Error(q1.error)
    state = q1.state
    const q2 = addSessionQuestion(state)
    if (!q2.ok) throw new Error(q2.error)
    state = q2.state

    const beforeIds = state.attempts.map((a) => a.id).sort()
    state = setCaptureMode(state, 'learner_first')
    const afterIds = state.attempts.map((a) => a.id).sort()
    expect(afterIds).toEqual(beforeIds)
    expect(state.position.mode).toBe('learner_first')
  })

  it('rejects new capture after session completion', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
    })
    const q = addSessionQuestion(state)
    if (!q.ok) throw new Error(q.error)
    state = markSessionCompleted(q.state)

    const capture = recordColorForCurrent(state, 'green')
    expect(capture.ok).toBe(false)
    expect(capture.ok === false && capture.error).toMatch(/completed/i)

    const addQ = addSessionQuestion(state)
    expect(addQ.ok).toBe(false)
  })

  it('records color only for the assigned learner on that question', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
      mode: 'question_first',
    })
    const q = addSessionQuestion(state)
    if (!q.ok) throw new Error(q.error)
    state = q.state

    const r = recordColorForCurrent(state, 'red')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    state = r.state
    expect(r.value.learnerUserId).toBe('learner-1')
    expect(r.value.snapshot.effectiveColor).toBe('red')
    expect(attemptsForQuestion(state, q.value.id)).toHaveLength(1)
  })

  it('records Orange as the primary 1 result instead of direct Yellow', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
      mode: 'question_first',
    })
    const q = addSessionQuestion(state)
    if (!q.ok) throw new Error(q.error)

    const r = recordColorForCurrent(q.state, 'orange')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.snapshot.status).toBe('finalized')
    expect(r.value.snapshot.effectiveColor).toBe('orange')
  })

  it('separates effective final color from recorded 7-color probe steps', () => {
    let state = createCaptureSession({
      learningSessionId: 'ls-1',
      teacherUserId: 'teacher-1',
      learnerIds: learners,
      mode: 'question_first',
    })
    const q = addSessionQuestion(state)
    if (!q.ok) throw new Error(q.error)
    state = q.state

    const green = recordColorForCurrent(state, 'green')
    if (!green.ok) throw new Error(green.error)
    state = green.state
    const blue1 = resolveProbeForCurrent(state, 'continue')
    if (!blue1.ok) throw new Error(blue1.error)
    state = blue1.state
    const blue2 = resolveProbeForCurrent(state, 'continue')
    if (!blue2.ok) throw new Error(blue2.error)
    state = blue2.state
    const indigo = resolveProbeForCurrent(state, 'done')
    if (!indigo.ok) throw new Error(indigo.error)
    state = indigo.state

    const summary = sessionColorSummary(state)
    expect(summary.byColor.green).toBe(0)
    expect(summary.byColor.indigo).toBe(1)
    expect(summary.recordedByColor.green).toBe(1)
    expect(summary.recordedByColor.blue).toBe(2)
    expect(summary.recordedByColor.indigo).toBe(1)
    expect(summary.totalRecords).toBe(4)
  })
})
