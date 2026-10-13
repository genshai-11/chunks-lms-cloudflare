export type CaptureMode = 'question_first' | 'learner_first'

export type CapturePosition = {
  mode: CaptureMode
  questionIndex: number
  learnerIndex: number
}

/**
 * Each Session Question maps to exactly one Learner (round-robin by question index).
 * Example: 100 questions, 2 learners → learner A gets Q0,Q2,Q4… (~50); B gets Q1,Q3… (~50).
 */
export function assignedLearnerIndex(questionIndex: number, learnerCount: number): number {
  if (learnerCount <= 0) return 0
  return ((questionIndex % learnerCount) + learnerCount) % learnerCount
}

/**
 * Switch UI mode without rewriting attempts.
 * question-first: walk questions in sequence (each already bound to one learner).
 * learner-first: walk that learner’s assigned questions, then the next learner.
 */
export function switchCaptureMode(position: CapturePosition): CapturePosition {
  return {
    ...position,
    mode: position.mode === 'question_first' ? 'learner_first' : 'question_first',
  }
}

export function nextPosition(
  position: CapturePosition,
  questionCount: number,
  learnerCount: number,
): CapturePosition {
  if (questionCount <= 0 || learnerCount <= 0) return position

  if (position.mode === 'question_first') {
    if (position.questionIndex >= questionCount - 1) {
      return {
        ...position,
        questionIndex: questionCount - 1,
        learnerIndex: assignedLearnerIndex(questionCount - 1, learnerCount),
      }
    }
    const questionIndex = position.questionIndex + 1
    return {
      ...position,
      questionIndex,
      learnerIndex: assignedLearnerIndex(questionIndex, learnerCount),
    }
  }

  // learner-first: next question assigned to same learner (stride = learnerCount)
  const nextSameLearner = position.questionIndex + learnerCount
  if (nextSameLearner < questionCount) {
    return {
      ...position,
      questionIndex: nextSameLearner,
      learnerIndex: position.learnerIndex,
    }
  }

  // next learner’s first assigned question = learnerIndex
  const nextLearner = position.learnerIndex + 1
  if (nextLearner >= learnerCount) {
    return position
  }
  if (nextLearner >= questionCount) {
    return position
  }
  return {
    ...position,
    learnerIndex: nextLearner,
    questionIndex: nextLearner,
  }
}

/** Go back one step (mirror of nextPosition). */
export function previousPosition(
  position: CapturePosition,
  questionCount: number,
  learnerCount: number,
): CapturePosition {
  if (questionCount <= 0 || learnerCount <= 0) return position

  if (position.mode === 'question_first') {
    if (position.questionIndex <= 0) {
      return {
        ...position,
        questionIndex: 0,
        learnerIndex: assignedLearnerIndex(0, learnerCount),
      }
    }
    const questionIndex = position.questionIndex - 1
    return {
      ...position,
      questionIndex,
      learnerIndex: assignedLearnerIndex(questionIndex, learnerCount),
    }
  }

  // learner-first: previous question for same learner
  const prevSameLearner = position.questionIndex - learnerCount
  if (prevSameLearner >= 0) {
    return {
      ...position,
      questionIndex: prevSameLearner,
      learnerIndex: position.learnerIndex,
    }
  }

  // previous learner’s last assigned question
  const prevLearner = position.learnerIndex - 1
  if (prevLearner < 0) {
    return {
      ...position,
      questionIndex: 0,
      learnerIndex: 0,
    }
  }
  // last index for prevLearner: prevLearner + k*learnerCount < questionCount
  let q = prevLearner
  while (q + learnerCount < questionCount) q += learnerCount
  return {
    ...position,
    learnerIndex: prevLearner,
    questionIndex: q,
  }
}

/** Jump to a specific question (syncs assigned learner). */
export function goToQuestionIndex(
  position: CapturePosition,
  questionIndex: number,
  questionCount: number,
  learnerCount: number,
): CapturePosition {
  if (questionCount <= 0) return position
  const qi = Math.max(0, Math.min(questionIndex, questionCount - 1))
  return {
    ...position,
    questionIndex: qi,
    learnerIndex: assignedLearnerIndex(qi, learnerCount),
  }
}

/** Sync position.learnerIndex to the learner bound to the current question. */
export function syncPositionToAssignment(
  position: CapturePosition,
  learnerCount: number,
): CapturePosition {
  return {
    ...position,
    learnerIndex: assignedLearnerIndex(position.questionIndex, learnerCount),
  }
}
