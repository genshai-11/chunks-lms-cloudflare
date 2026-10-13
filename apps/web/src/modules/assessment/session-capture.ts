import { newId } from '../roster/seed'
import {
  applyLifecycleCommand,
  createDraftSnapshot,
} from '../result-lifecycle/state-machine'
import type { AssessmentSnapshot, ProvisionalColor, ResultColor } from '../result-lifecycle/types'
import { PRIMARY_CAPTURE_COLORS, SPECTRUM_COLORS } from '../result-lifecycle/types'
import {
  assignedLearnerIndex,
  goToQuestionIndex,
  nextPosition,
  previousPosition,
  switchCaptureMode,
  syncPositionToAssignment,
  type CaptureMode,
  type CapturePosition,
} from './capture-mode'
import { probeChunksNumber } from './probe-metrics'

export type SessionQuestion = {
  id: string
  learningSessionId: string
  sequenceNumber: number
  externalRef: string | null
  /** Exactly one learner is observed for this sentence/question. */
  assignedLearnerUserId: string
}

export type AssessmentAttempt = {
  id: string
  learningSessionId: string
  sessionQuestionId: string
  learnerUserId: string
  teacherUserId: string
  snapshot: AssessmentSnapshot
}

export type CaptureSessionState = {
  learningSessionId: string
  teacherUserId: string
  learnerIds: string[]
  sessionStatus: 'open' | 'completed'
  questions: SessionQuestion[]
  attempts: AssessmentAttempt[]
  position: CapturePosition
  maxProbeCount: number
}

export type CaptureResult<T> =
  | { ok: true; value: T; state: CaptureSessionState }
  | { ok: false; error: string }

export function createCaptureSession(input: {
  learningSessionId: string
  teacherUserId: string
  learnerIds: string[]
  mode?: CaptureMode
  maxProbeCount?: number
}): CaptureSessionState {
  return {
    learningSessionId: input.learningSessionId,
    teacherUserId: input.teacherUserId,
    learnerIds: [...input.learnerIds],
    sessionStatus: 'open',
    questions: [],
    attempts: [],
    maxProbeCount: input.maxProbeCount ?? 2,
    position: {
      mode: input.mode ?? 'question_first',
      questionIndex: 0,
      learnerIndex: 0,
    },
  }
}

/**
 * Add one Session Question and create exactly one Assessment Attempt
 * for the round-robin assigned learner.
 * With N questions and M learners, each learner gets ~N/M attempts.
 */
export function addSessionQuestion(
  state: CaptureSessionState,
  input?: { externalRef?: string | null },
): CaptureResult<SessionQuestion> {
  if (state.sessionStatus === 'completed') {
    return { ok: false, error: 'Cannot add questions to a completed Learning Session' }
  }
  if (state.learnerIds.length === 0) {
    return { ok: false, error: 'No learners to assign for observation' }
  }

  const questionIndex = state.questions.length
  const sequenceNumber = questionIndex + 1
  const learnerIdx = assignedLearnerIndex(questionIndex, state.learnerIds.length)
  const assignedLearnerUserId = state.learnerIds[learnerIdx]!

  const question: SessionQuestion = {
    id: newId('q'),
    learningSessionId: state.learningSessionId,
    sequenceNumber,
    externalRef: input?.externalRef ?? null,
    assignedLearnerUserId,
  }

  const attempt: AssessmentAttempt = {
    id: newId('att'),
    learningSessionId: state.learningSessionId,
    sessionQuestionId: question.id,
    learnerUserId: assignedLearnerUserId,
    teacherUserId: state.teacherUserId,
    snapshot: createDraftSnapshot(state.maxProbeCount),
  }

  return {
    ok: true,
    value: question,
    state: {
      ...state,
      questions: [...state.questions, question],
      attempts: [...state.attempts, attempt],
      position: {
        ...state.position,
        questionIndex,
        learnerIndex: learnerIdx,
      },
    },
  }
}

export function setCaptureMode(
  state: CaptureSessionState,
  mode: CaptureMode,
): CaptureSessionState {
  if (state.position.mode === mode) return state
  const switched = switchCaptureMode(state.position)
  return {
    ...state,
    position: syncPositionToAssignment(
      { ...switched, mode },
      state.learnerIds.length,
    ),
  }
}

export function currentAttempt(state: CaptureSessionState): AssessmentAttempt | null {
  const question = state.questions[state.position.questionIndex]
  if (!question) return null
  return (
    state.attempts.find(
      (a) =>
        a.sessionQuestionId === question.id &&
        a.learnerUserId === question.assignedLearnerUserId,
    ) ?? null
  )
}

export function recordColorForCurrent(
  state: CaptureSessionState,
  color: ProvisionalColor,
  at = new Date().toISOString(),
): CaptureResult<AssessmentAttempt> {
  if (state.sessionStatus === 'completed') {
    return {
      ok: false,
      error: 'Cannot capture on completed Learning Session; use correction on existing results',
    }
  }

  const attempt = currentAttempt(state)
  if (!attempt) return { ok: false, error: 'No current Assessment Attempt' }

  // Draft → provisional (or green probe). Finalized → correction (change result).
  if (
    attempt.snapshot.status === 'finalized' ||
    attempt.snapshot.status === 'corrected'
  ) {
    return correctColorForCurrent(state, color, 'Changed during observation', at)
  }

  if (
    attempt.snapshot.status === 'probe_open' ||
    attempt.snapshot.status === 'resolution_required'
  ) {
    return {
      ok: false,
      error: 'Resolve green probe first (Fail / Continue / Done)',
    }
  }

  const result = applyLifecycleCommand(attempt.snapshot, {
    type: 'record_provisional',
    color,
    at,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const updated: AssessmentAttempt = { ...attempt, snapshot: result.snapshot }
  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      attempts: state.attempts.map((a) => (a.id === attempt.id ? updated : a)),
    },
  }
}

export function isPrimaryCaptureColor(color: ResultColor): color is ProvisionalColor {
  return PRIMARY_CAPTURE_COLORS.includes(color as ProvisionalColor)
}

/** Change a finalized result while still in an open session (audit-preserving correction). */
export function correctColorForCurrent(
  state: CaptureSessionState,
  color: ResultColor,
  reason = 'Changed during observation',
  at = new Date().toISOString(),
): CaptureResult<AssessmentAttempt> {
  if (state.sessionStatus === 'completed') {
    return { ok: false, error: 'Session completed — correct from reports if needed' }
  }
  const attempt = currentAttempt(state)
  if (!attempt) return { ok: false, error: 'No current Assessment Attempt' }

  const result = applyLifecycleCommand(attempt.snapshot, {
    type: 'correct',
    color,
    reason,
    at,
    actorId: state.teacherUserId,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const updated: AssessmentAttempt = { ...attempt, snapshot: result.snapshot }
  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      attempts: state.attempts.map((a) => (a.id === attempt.id ? updated : a)),
    },
  }
}

export function resolveProbeForCurrent(
  state: CaptureSessionState,
  outcome: 'fail' | 'continue' | 'done',
  at = new Date().toISOString(),
): CaptureResult<AssessmentAttempt> {
  const attempt = currentAttempt(state)
  if (!attempt) return { ok: false, error: 'No current Assessment Attempt' }

  const result = applyLifecycleCommand(attempt.snapshot, {
    type: 'resolve_probe',
    outcome,
    at,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const updated: AssessmentAttempt = { ...attempt, snapshot: result.snapshot }
  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      attempts: state.attempts.map((a) => (a.id === attempt.id ? updated : a)),
    },
  }
}

export function advancePosition(state: CaptureSessionState): CaptureSessionState {
  return {
    ...state,
    position: nextPosition(state.position, state.questions.length, state.learnerIds.length),
  }
}

export function retreatPosition(state: CaptureSessionState): CaptureSessionState {
  return {
    ...state,
    position: previousPosition(
      state.position,
      state.questions.length,
      state.learnerIds.length,
    ),
  }
}

export function jumpToQuestion(
  state: CaptureSessionState,
  questionIndex: number,
): CaptureSessionState {
  return {
    ...state,
    position: goToQuestionIndex(
      state.position,
      questionIndex,
      state.questions.length,
      state.learnerIds.length,
    ),
  }
}

export function markSessionCompleted(state: CaptureSessionState): CaptureSessionState {
  return { ...state, sessionStatus: 'completed' }
}

/** Session rollup for observe summary / heatmap. */
export function sessionColorSummary(state: CaptureSessionState): {
  done: number
  total: number
  byColor: Record<ResultColor | 'open' | 'draft', number>
  recordedByColor: Record<ResultColor, number>
  primaryRecords: number
  probeRecords: number
  totalRecords: number
  maxProbeDepth: number
} {
  const byColor = {
    ...Object.fromEntries(SPECTRUM_COLORS.map((color) => [color, 0])),
    open: 0,
    draft: 0,
  } as Record<ResultColor | 'open' | 'draft', number>
  const recordedByColor = Object.fromEntries(SPECTRUM_COLORS.map((color) => [color, 0])) as Record<
    ResultColor,
    number
  >
  let done = 0
  let maxProbeDepth = 0
  let primaryRecords = 0
  let probeRecords = 0
  for (const a of state.attempts) {
    maxProbeDepth = Math.max(maxProbeDepth, probeChunksNumber(a.snapshot) ?? 0)
    const s = a.snapshot.status
    if (s === 'finalized' || s === 'corrected') {
      done += 1
      const c = a.snapshot.effectiveColor
      if (c) byColor[c] += 1
      primaryRecords += 1
      if (a.snapshot.enteredProbeFlow) {
        recordedByColor.green += 1
        if (c === 'yellow') {
          recordedByColor.yellow += 1
          recordedByColor.blue += Math.max(0, a.snapshot.probeCount)
          probeRecords += Math.max(0, a.snapshot.probeCount) + 1
        } else if (c === 'indigo') {
          recordedByColor.indigo += 1
          recordedByColor.blue += Math.max(0, a.snapshot.probeCount - 1)
          probeRecords += Math.max(0, a.snapshot.probeCount)
        } else {
          recordedByColor.blue += Math.max(0, a.snapshot.probeCount)
          probeRecords += Math.max(0, a.snapshot.probeCount)
        }
      } else if (c) {
        recordedByColor[c] += 1
      }
    } else if (s === 'probe_open' || s === 'resolution_required') {
      byColor.open += 1
      primaryRecords += 1
      recordedByColor.green += 1
      probeRecords += Math.max(0, a.snapshot.probeCount)
      recordedByColor.blue += Math.max(0, a.snapshot.probeCount)
    } else {
      byColor.draft += 1
    }
  }
  return {
    done,
    total: state.attempts.length,
    byColor,
    recordedByColor,
    primaryRecords,
    probeRecords,
    totalRecords: primaryRecords + probeRecords,
    maxProbeDepth,
  }
}

export function attemptsForQuestion(
  state: CaptureSessionState,
  questionId: string,
): AssessmentAttempt[] {
  return state.attempts.filter((a) => a.sessionQuestionId === questionId)
}

/** Count of finalized attempts per learner (for balance UI). */
export function attemptCountsByLearner(state: CaptureSessionState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const id of state.learnerIds) counts[id] = 0
  for (const a of state.attempts) {
    counts[a.learnerUserId] = (counts[a.learnerUserId] ?? 0) + 1
  }
  return counts
}
