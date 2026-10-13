import { describe, expect, it } from 'vitest'
import {
  assignedLearnerIndex,
  goToQuestionIndex,
  nextPosition,
  previousPosition,
  switchCaptureMode,
  type CapturePosition,
} from './capture-mode'

describe('capture mode navigation (one learner per sentence)', () => {
  it('assigns learners round-robin by question index', () => {
    expect(assignedLearnerIndex(0, 2)).toBe(0)
    expect(assignedLearnerIndex(1, 2)).toBe(1)
    expect(assignedLearnerIndex(2, 2)).toBe(0)
    expect(assignedLearnerIndex(99, 2)).toBe(1)
  })

  it('preserves question and learner indices when switching modes', () => {
    const pos: CapturePosition = {
      mode: 'question_first',
      questionIndex: 2,
      learnerIndex: 1,
    }
    const switched = switchCaptureMode(pos)
    expect(switched.mode).toBe('learner_first')
    expect(switched.questionIndex).toBe(2)
    expect(switched.learnerIndex).toBe(1)
  })

  it('advances to next question and its assigned learner in question-first mode', () => {
    const pos: CapturePosition = {
      mode: 'question_first',
      questionIndex: 0,
      learnerIndex: 0,
    }
    const next = nextPosition(pos, 3, 3)
    expect(next).toEqual({ mode: 'question_first', questionIndex: 1, learnerIndex: 1 })
  })

  it('in learner-first, strides by learner count for the same learner', () => {
    const pos: CapturePosition = {
      mode: 'learner_first',
      questionIndex: 0,
      learnerIndex: 0,
    }
    const next = nextPosition(pos, 6, 3)
    expect(next).toEqual({ mode: 'learner_first', questionIndex: 3, learnerIndex: 0 })
  })

  it('previousPosition walks back in question-first mode', () => {
    const pos: CapturePosition = {
      mode: 'question_first',
      questionIndex: 2,
      learnerIndex: 2,
    }
    const prev = previousPosition(pos, 5, 3)
    expect(prev).toEqual({ mode: 'question_first', questionIndex: 1, learnerIndex: 1 })
  })

  it('goToQuestionIndex clamps and syncs learner', () => {
    const pos: CapturePosition = {
      mode: 'question_first',
      questionIndex: 0,
      learnerIndex: 0,
    }
    expect(goToQuestionIndex(pos, 4, 5, 2)).toEqual({
      mode: 'question_first',
      questionIndex: 4,
      learnerIndex: 0,
    })
  })
})
