import { describe, expect, it, vi } from 'vitest'
import type { RosterState } from '../modules/roster/types'
import {
  loadLiveCapture,
  loadLiveLedger,
  recordLiveColor,
  SUPABASE_IN_FILTER_BATCH_SIZE,
  withTimeout,
} from './live-assessment'
import type { AssessmentAttempt, CaptureSessionState } from '../modules/assessment/session-capture'

const mocked = vi.hoisted(() => ({
  supabase: null as unknown,
}))

vi.mock('./supabase', () => ({
  getSupabase: () => mocked.supabase,
}))

type QueryState = {
  table: string
  select: string
  filters: Array<{ column: string; values: string[] }>
}

describe('loadLiveLedger', () => {
  it('batches large snapshot attempt_id filters so Supabase URLs stay bounded', async () => {
    const attemptIds = Array.from(
      { length: SUPABASE_IN_FILTER_BATCH_SIZE * 2 + 5 },
      (_, index) => `attempt-${index}`,
    )
    const attemptIdBatchSizes: number[] = []

    mocked.supabase = {
      from(table: string) {
        const state: QueryState = { table, select: '', filters: [] }
        const builder = {
          select(select: string) {
            state.select = select
            return builder
          },
          in(column: string, values: string[]) {
            state.filters.push({ column, values: [...values] })
            if (table === 'assessment_attempt_snapshots' && column === 'attempt_id') {
              attemptIdBatchSizes.push(values.length)
            }
            return builder
          },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            resolve({ data: rowsFor(state), error: null })
          },
        }
        return builder
      },
    }

    const roster = {
      organization: { id: 'org-1' },
      classes: [{ id: 'class-1', courseId: 'course-1' }],
      users: [],
      courses: [],
      enrollments: [],
    } as unknown as RosterState

    const result = await loadLiveLedger(roster)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(attemptIds.length)
    expect(attemptIdBatchSizes).toEqual([100, 100, 5])

    function rowsFor(state: QueryState): unknown[] {
      if (state.table === 'learning_sessions') return [{ id: 'session-1', class_id: 'class-1' }]
      if (state.table === 'assessment_attempts') {
        return attemptIds.map((id) => ({
          id,
          learning_session_id: 'session-1',
          session_question_id: `question-${id}`,
          learner_user_id: `learner-${id}`,
          teacher_user_id: 'teacher-1',
        }))
      }
      if (state.table === 'assessment_attempt_snapshots') {
        const batch = state.filters.find((filter) => filter.column === 'attempt_id')?.values ?? []
        return batch.map((attemptId) => ({
          attempt_id: attemptId,
          status: 'finalized',
          provisional_color: 'green',
          effective_color: 'green',
          effective_score: 2,
          probe_count: 0,
          max_probe_count: 2,
          entered_probe_flow: false,
          finalized_at: '2026-07-16T04:00:00.000Z',
          updated_at: '2026-07-16T04:00:00.000Z',
        }))
      }
      return []
    }
  })
})

describe('withTimeout', () => {
  it('resolves if promise finishes before timeout', async () => {
    const res = await withTimeout(Promise.resolve('ok'), 100, 'timed out')
    expect(res).toBe('ok')
  })

  it('rejects if promise exceeds timeout', async () => {
    vi.useFakeTimers()
    try {
      const pendingPromise = new Promise<string>(() => {})
      const timeoutPromise = withTimeout(pendingPromise, 50, 'RPC timed out')
      vi.advanceTimersByTime(51)
      await expect(timeoutPromise).rejects.toThrow('RPC timed out')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('loadLiveCapture questionIndex preservation', () => {
  it('preserves existing questionIndex from fallback instead of jumping to the end', async () => {
    const existingState: CaptureSessionState = {
      learningSessionId: 'sess-1',
      teacherUserId: 't-1',
      learnerIds: ['l-1', 'l-2'],
      sessionStatus: 'open',
      questions: [
        {
          id: 'q-1',
          learningSessionId: 'sess-1',
          sequenceNumber: 1,
          externalRef: null,
          assignedLearnerUserId: 'l-1',
        },
        {
          id: 'q-2',
          learningSessionId: 'sess-1',
          sequenceNumber: 2,
          externalRef: null,
          assignedLearnerUserId: 'l-2',
        },
        {
          id: 'q-3',
          learningSessionId: 'sess-1',
          sequenceNumber: 3,
          externalRef: null,
          assignedLearnerUserId: 'l-1',
        },
      ],
      attempts: [],
      maxProbeCount: 2,
      position: {
        mode: 'question_first',
        questionIndex: 0, // Teacher is currently viewing question 0
        learnerIndex: 0,
      },
    }

    mocked.supabase = {
      from(_table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({
                      data: [
                        { id: 'q-1', learning_session_id: 'sess-1', sequence_number: 1, external_ref: null },
                        { id: 'q-2', learning_session_id: 'sess-1', sequence_number: 2, external_ref: null },
                        { id: 'q-3', learning_session_id: 'sess-1', sequence_number: 3, external_ref: null },
                      ],
                      error: null,
                    })
                  },
                  then(resolve: (val: unknown) => void) {
                    resolve({
                      data: [
                        { id: 'att-1', learning_session_id: 'sess-1', session_question_id: 'q-1', learner_user_id: 'l-1', teacher_user_id: 't-1' },
                        { id: 'att-2', learning_session_id: 'sess-1', session_question_id: 'q-2', learner_user_id: 'l-2', teacher_user_id: 't-1' },
                        { id: 'att-3', learning_session_id: 'sess-1', session_question_id: 'q-3', learner_user_id: 'l-1', teacher_user_id: 't-1' },
                      ],
                      error: null,
                    })
                  },
                }
              },
              in() {
                return Promise.resolve({
                  data: [
                    { attempt_id: 'att-1', status: 'draft', provisional_color: null, effective_color: null, effective_score: null, probe_count: 0, max_probe_count: 2, entered_probe_flow: false, finalized_at: null, updated_at: '2026-07-16T04:00:00Z' },
                    { attempt_id: 'att-2', status: 'draft', provisional_color: null, effective_color: null, effective_score: null, probe_count: 0, max_probe_count: 2, entered_probe_flow: false, finalized_at: null, updated_at: '2026-07-16T04:00:00Z' },
                    { attempt_id: 'att-3', status: 'draft', provisional_color: null, effective_color: null, effective_score: null, probe_count: 0, max_probe_count: 2, entered_probe_flow: false, finalized_at: null, updated_at: '2026-07-16T04:00:00Z' },
                  ],
                  error: null,
                })
              },
            }
          },
        }
      },
    }

    const result = await loadLiveCapture({
      learningSessionId: 'sess-1',
      teacherUserId: 't-1',
      learnerIds: ['l-1', 'l-2'],
      sessionStatus: 'open',
      maxProbeCount: 2,
      fallback: existingState,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.position.questionIndex).toBe(0)
    expect(result.data.position.learnerIndex).toBe(0)
  })
})

describe('recordLiveColor fallback on hanging RPC', () => {
  it('falls back to local mutation when RPC hangs or times out', async () => {
    const attempt: AssessmentAttempt = {
      id: 'att-1',
      learningSessionId: 'sess-1',
      sessionQuestionId: 'q-1',
      learnerUserId: 'l-1',
      teacherUserId: 't-1',
      snapshot: {
        status: 'draft',
        provisionalColor: null,
        effectiveColor: null,
        effectiveScore: null,
        probeCount: 0,
        maxProbeCount: 2,
        enteredProbeFlow: false,
        finalizedAt: null,
      },
    }

    // Mock RPC that rejects with timeout or error
    mocked.supabase = {
      rpc() {
        return Promise.reject(new Error('RPC timed out'))
      },
    }

    const result = await recordLiveColor(attempt, 'orange')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.snapshot.status).toBe('finalized')
    expect(result.data.snapshot.effectiveColor).toBe('orange')
  })
})
