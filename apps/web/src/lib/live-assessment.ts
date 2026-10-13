/**
 * Live observation capture.
 *
 * Strategy: **local-first**. Domain capture always works in the browser so teachers
 * are never blocked by cloud lag/RLS. When Supabase is reachable we also:
 *   1) upsert the open learning_session
 *   2) try RPC create/record/resolve
 * Local domain results still feed the progress ledger via appendFinalizedFromCapture.
 */
import {
  addSessionQuestion,
  type AssessmentAttempt,
  type CaptureSessionState,
  type SessionQuestion,
} from '../modules/assessment/session-capture'
import { isPrimaryCaptureColor } from '../modules/assessment/session-capture'
import type { CaptureMode } from '../modules/assessment/capture-mode'
import {
  applyLifecycleCommand,
  createDraftSnapshot,
} from '../modules/result-lifecycle/state-machine'
import type { AssessmentSnapshot, ProvisionalColor, ResultColor } from '../modules/result-lifecycle/types'
import type { RosterState } from '../modules/roster/types'
import type { ResultRecord } from '../modules/reporting/progress'
import type { LearningSession } from '../modules/scheduling/types'
import { newId } from '../modules/roster/seed'
import { getSupabase } from './supabase'

type DbSnapshot = {
  attempt_id: string
  status: AssessmentSnapshot['status']
  provisional_color: ProvisionalColor | null
  effective_color: ResultColor | null
  effective_score: number | null
  probe_count: number
  max_probe_count: number
  entered_probe_flow: boolean
  finalized_at: string | null
  updated_at: string
}

type DbQuestion = {
  id: string
  learning_session_id: string
  sequence_number: number
  external_ref: string | null
}

type DbAttempt = {
  id: string
  learning_session_id: string
  session_question_id: string
  learner_user_id: string
  teacher_user_id: string
}

type DbCreateQuestionAttemptResponse = {
  question: DbQuestion
  attempt: DbAttempt
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function client() {
  return getSupabase() as any
}

export const LIVE_RPC_TIMEOUT_MS = 7000

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = LIVE_RPC_TIMEOUT_MS,
  timeoutMsg: string = 'Operation timed out',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMsg))
    }, ms)
    promise
      .then((res) => {
        clearTimeout(timer)
        resolve(res)
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

export const SUPABASE_IN_FILTER_BATCH_SIZE = 100

export function chunkForSupabaseInFilter<T>(
  values: readonly T[],
  batchSize = SUPABASE_IN_FILTER_BATCH_SIZE,
): T[][] {
  const uniqueValues = [...new Set(values)]
  const chunks: T[][] = []
  for (let i = 0; i < uniqueValues.length; i += batchSize) {
    chunks.push(uniqueValues.slice(i, i + batchSize))
  }
  return chunks
}

export async function selectInBatches<T>(
  sb: any,
  options: {
    table: string
    select: string
    column: string
    values: readonly string[]
    batchSize?: number
    apply?: (query: any) => any
  },
): Promise<Result<T[]>> {
  const batches = chunkForSupabaseInFilter(options.values, options.batchSize)
  const rows: T[] = []
  for (const batch of batches) {
    let query = sb.from(options.table).select(options.select).in(options.column, batch)
    query = options.apply ? options.apply(query) : query
    const result = await query
    if (result.error) return { ok: false, error: result.error.message }
    rows.push(...((result.data ?? []) as T[]))
  }
  return { ok: true, data: rows }
}

function snapshotFromDb(row: DbSnapshot): AssessmentSnapshot {
  return {
    status: row.status,
    provisionalColor: row.provisional_color,
    effectiveColor: row.effective_color,
    effectiveScore: row.effective_score,
    probeCount: row.probe_count,
    maxProbeCount: row.max_probe_count,
    enteredProbeFlow: row.entered_probe_flow,
    finalizedAt: row.finalized_at,
  }
}

function attemptFromDb(row: DbAttempt, snapshot: DbSnapshot): AssessmentAttempt {
  return {
    id: row.id,
    learningSessionId: row.learning_session_id,
    sessionQuestionId: row.session_question_id,
    learnerUserId: row.learner_user_id,
    teacherUserId: row.teacher_user_id,
    snapshot: snapshotFromDb(snapshot),
  }
}

function localAddQuestion(
  capture: CaptureSessionState,
  externalRef?: string | null,
  learnerUserId?: string | null,
): Result<CaptureSessionState> {
  if (!learnerUserId) {
    const r = addSessionQuestion(capture, { externalRef: externalRef ?? null })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, data: r.state }
  }
  if (capture.sessionStatus === 'completed') {
    return { ok: false, error: 'Cannot add questions to a completed Learning Session' }
  }
  const learnerIndex = capture.learnerIds.indexOf(learnerUserId)
  if (learnerIndex < 0) return { ok: false, error: 'Learner is not in this live session' }
  const questionIndex = capture.questions.length
  const question: SessionQuestion = {
    id: newId('q'),
    learningSessionId: capture.learningSessionId,
    sequenceNumber: questionIndex + 1,
    externalRef: externalRef ?? null,
    assignedLearnerUserId: learnerUserId,
  }
  const attempt: AssessmentAttempt = {
    id: newId('att'),
    learningSessionId: capture.learningSessionId,
    sessionQuestionId: question.id,
    learnerUserId,
    teacherUserId: capture.teacherUserId,
    snapshot: createDraftSnapshot(capture.maxProbeCount),
  }
  return {
    ok: true,
    data: {
      ...capture,
      questions: [...capture.questions, question],
      attempts: [...capture.attempts, attempt],
      position: { ...capture.position, questionIndex, learnerIndex },
    },
  }
}

function localMutateAttempt(
  attempt: AssessmentAttempt,
  command: Parameters<typeof applyLifecycleCommand>[1],
): Result<AssessmentAttempt> {
  const r = applyLifecycleCommand(attempt.snapshot, command)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, data: { ...attempt, snapshot: r.snapshot } }
}

/**
 * Force-upsert one open learning session so RPCs can find it.
 * Does not depend on full workspace debounce sync.
 */
export async function ensureLearningSessionOnServer(
  session: LearningSession,
): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  const classCheck = await sb.from('classes').select('id').eq('id', session.classId).maybeSingle()
  if (classCheck.error) return { ok: false, error: classCheck.error.message }
  if (!classCheck.data) {
    return {
      ok: false,
      error: 'Class is not on the server yet. Open Teacher → Classes, then Sync.',
    }
  }

  // scheduled_session_id must exist or be null (FK)
  let scheduledId = session.scheduledSessionId
  if (scheduledId) {
    const sched = await sb
      .from('scheduled_sessions')
      .select('id')
      .eq('id', scheduledId)
      .maybeSingle()
    if (sched.error || !sched.data) scheduledId = null
  }

  const fullRow = {
    id: session.id,
    class_id: session.classId,
    scheduled_session_id: scheduledId,
    status: session.status,
    planned_question_count: session.plannedQuestionCount,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    max_probe_count: session.maxProbeCount,
    session_number: session.sessionNumber,
    owner_user_id: session.ownerUserId,
    lock_expires_at: session.lockExpiresAt,
    session_kind: session.sessionKind ?? 'regular',
    session_format: session.sessionFormat ?? 'lesson',
    prompt_language: session.sessionFormat === 'test' ? (session.promptLanguage ?? 'vi') : null,
    live_test_resource_id: session.sessionFormat === 'test' ? session.liveTestResourceId : null,
    live_test_block_id: session.sessionFormat === 'test' ? session.liveTestBlockId : null,
    participant_learner_ids: session.participantLearnerIds,
  }

  let { error } = await sb.from('learning_sessions').upsert(fullRow, { onConflict: 'id' })
  if (error) {
    // Retry minimal columns (older schema / optional columns)
    const minimal = {
      id: fullRow.id,
      class_id: fullRow.class_id,
      scheduled_session_id: fullRow.scheduled_session_id,
      status: fullRow.status,
      planned_question_count: fullRow.planned_question_count,
      started_at: fullRow.started_at,
      completed_at: fullRow.completed_at,
      max_probe_count: fullRow.max_probe_count,
    }
    const retry = await sb.from('learning_sessions').upsert(minimal, { onConflict: 'id' })
    if (retry.error) {
      return { ok: false, error: `learning_sessions upsert: ${retry.error.message}` }
    }
  }

  return { ok: true, data: true as const }
}

export async function loadLiveCapture(input: {
  learningSessionId: string
  teacherUserId: string
  learnerIds: string[]
  sessionStatus: 'open' | 'completed'
  maxProbeCount: number
  mode?: CaptureMode
  /** Keep existing local board when cloud is empty/unavailable */
  fallback?: CaptureSessionState | null
}): Promise<Result<CaptureSessionState>> {
  const compatibleFallback =
    input.fallback &&
    input.fallback.learningSessionId === input.learningSessionId &&
    input.fallback.learnerIds.length === input.learnerIds.length &&
    input.learnerIds.every((id) => input.fallback?.learnerIds.includes(id))
      ? input.fallback
      : null

  const sb = client()
  if (!sb) {
    if (compatibleFallback) return { ok: true, data: compatibleFallback }
    return { ok: false, error: 'Supabase is not configured' }
  }

  const [questionsResult, attemptsResult] = await Promise.all([
    sb
      .from('session_questions')
      .select('*')
      .eq('learning_session_id', input.learningSessionId)
      .order('sequence_number'),
    sb.from('assessment_attempts').select('*').eq('learning_session_id', input.learningSessionId),
  ])

  // Cloud read failed → keep local board
  if (questionsResult.error || attemptsResult.error) {
    if (compatibleFallback) return { ok: true, data: compatibleFallback }
    return {
      ok: false,
      error: questionsResult.error?.message ?? attemptsResult.error?.message ?? 'load failed',
    }
  }

  const dbQuestions = (questionsResult.data ?? []) as DbQuestion[]
  const dbAttempts = (attemptsResult.data ?? []) as DbAttempt[]

  // Cloud empty but we already have local questions → keep local (local-first)
  if (dbQuestions.length === 0 && compatibleFallback && compatibleFallback.questions.length > 0) {
    return { ok: true, data: compatibleFallback }
  }

  const attemptIds = dbAttempts.map((attempt) => attempt.id)
  let snapshots: DbSnapshot[] = []
  if (attemptIds.length > 0) {
    const snapshotResult = await selectInBatches<DbSnapshot>(sb, {
      table: 'assessment_attempt_snapshots',
      select: '*',
      column: 'attempt_id',
      values: attemptIds,
    })
    if (!snapshotResult.ok) {
      if (compatibleFallback) return { ok: true, data: compatibleFallback }
      return snapshotResult
    }
    snapshots = snapshotResult.data
  }

  const snapshotByAttempt = new Map(snapshots.map((snapshot) => [snapshot.attempt_id, snapshot]))
  const attemptByQuestion = new Map(
    dbAttempts.map((attempt) => [attempt.session_question_id, attempt]),
  )
  const questions: SessionQuestion[] = dbQuestions.flatMap((question) => {
    const attempt = attemptByQuestion.get(question.id)
    return attempt
      ? [
          {
            id: question.id,
            learningSessionId: question.learning_session_id,
            sequenceNumber: question.sequence_number,
            externalRef: question.external_ref,
            assignedLearnerUserId: attempt.learner_user_id,
          },
        ]
      : []
  })
  const attempts = dbAttempts.flatMap((attempt) => {
    const snapshot = snapshotByAttempt.get(attempt.id)
    return snapshot ? [attemptFromDb(attempt, snapshot)] : []
  })

  // Prefer richer board (local vs cloud)
  if (compatibleFallback && compatibleFallback.questions.length > questions.length) {
    return { ok: true, data: compatibleFallback }
  }
  const preferredQuestionIndex =
    compatibleFallback &&
    compatibleFallback.position.questionIndex >= 0 &&
    compatibleFallback.position.questionIndex < questions.length
      ? compatibleFallback.position.questionIndex
      : Math.max(0, questions.length - 1)
  const preferredLearnerIndex =
    compatibleFallback &&
    compatibleFallback.position.learnerIndex >= 0 &&
    compatibleFallback.position.learnerIndex < input.learnerIds.length
      ? compatibleFallback.position.learnerIndex
      : questions.length > 0
        ? Math.max(
            0,
            input.learnerIds.indexOf(
              questions[preferredQuestionIndex]?.assignedLearnerUserId ??
                questions.at(-1)!.assignedLearnerUserId,
            ),
          )
        : 0

  return {
    ok: true,
    data: {
      learningSessionId: input.learningSessionId,
      teacherUserId: input.teacherUserId,
      learnerIds: [...input.learnerIds],
      sessionStatus: input.sessionStatus,
      questions,
      attempts,
      maxProbeCount: input.maxProbeCount,
      position: {
        mode: input.mode ?? compatibleFallback?.position.mode ?? 'question_first',
        questionIndex: preferredQuestionIndex,
        learnerIndex: preferredLearnerIndex,
      },
    },
  }
}

export async function createLiveQuestion(input: {
  capture: CaptureSessionState
  externalRef?: string | null
  /** Open learning session — used only as retry context when the RPC says the session is missing. */
  openSession?: LearningSession | null
  /** Explicit learner target for split-screen observe. Defaults to round-robin. */
  learnerUserId?: string | null
}): Promise<Result<CaptureSessionState>> {
  if (input.capture.learnerIds.length === 0) return { ok: false, error: 'No active learners' }

  const sb = client()

  // No supabase → pure local
  if (!sb) return localAddQuestion(input.capture, input.externalRef, input.learnerUserId)

  const learnerIndex = input.learnerUserId
    ? Math.max(0, input.capture.learnerIds.indexOf(input.learnerUserId))
    : input.capture.questions.length % input.capture.learnerIds.length
  const learnerUserId = input.learnerUserId ?? input.capture.learnerIds[learnerIndex]!
  if (!input.capture.learnerIds.includes(learnerUserId)) {
    return { ok: false, error: 'Learner is not in this live session' }
  }

  async function callCreateRpc(): Promise<Result<CaptureSessionState>> {
    try {
      const result = (await withTimeout(
        sb.rpc('create_session_question_attempt', {
          p_learning_session_id: input.capture.learningSessionId,
          p_teacher_user_id: input.capture.teacherUserId,
          p_learner_user_id: learnerUserId,
          p_external_ref: input.externalRef ?? null,
        }),
        LIVE_RPC_TIMEOUT_MS,
        'create_session_question_attempt RPC timed out',
      )) as { data: unknown; error: { message: string } | null }

      if (result.error) return { ok: false, error: result.error.message }
      const row = result.data as DbCreateQuestionAttemptResponse
      const question: SessionQuestion = {
        id: row.question.id,
        learningSessionId: row.question.learning_session_id,
        sequenceNumber: row.question.sequence_number,
        externalRef: row.question.external_ref,
        assignedLearnerUserId: row.attempt.learner_user_id,
      }
      const attempt: AssessmentAttempt = {
        id: row.attempt.id,
        learningSessionId: row.attempt.learning_session_id,
        sessionQuestionId: row.attempt.session_question_id,
        learnerUserId: row.attempt.learner_user_id,
        teacherUserId: row.attempt.teacher_user_id,
        // The insert trigger creates the same draft snapshot server-side. Avoid a reload round-trip.
        snapshot: createDraftSnapshot(input.capture.maxProbeCount),
      }

      return {
        ok: true,
        data: {
          ...input.capture,
          questions: [...input.capture.questions, question],
          attempts: [...input.capture.attempts, attempt],
          position: {
            ...input.capture.position,
            questionIndex: input.capture.questions.length,
            learnerIndex,
          },
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  const created = await callCreateRpc()
  if (created.ok) return created

  // Retry once after ensuring the open learning session exists. This keeps the normal path to one RPC.
  if (input.openSession) {
    const ensured = await withTimeout(
      ensureLearningSessionOnServer(input.openSession),
      LIVE_RPC_TIMEOUT_MS,
      'ensureLearningSessionOnServer timed out',
    ).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))
    if (ensured.ok) {
      const retried = await callCreateRpc()
      if (retried.ok) return retried
      console.warn('[live] create_session_question_attempt:', retried.error)
    } else {
      console.warn('[live] ensure session:', ensured.error)
    }
  } else {
    console.warn('[live] create_session_question_attempt:', created.error)
  }

  return localAddQuestion(input.capture, input.externalRef, input.learnerUserId)
}

async function mutateSnapshot(
  attempt: AssessmentAttempt,
  rpc: string,
  params: Record<string, unknown>,
  localCommand: Parameters<typeof applyLifecycleCommand>[1],
): Promise<Result<AssessmentAttempt>> {
  const sb = client()
  if (!sb) return localMutateAttempt(attempt, localCommand)

  let result: { data: unknown; error: { message: string } | null }
  try {
    result = await withTimeout(
      sb.rpc(rpc, params),
      LIVE_RPC_TIMEOUT_MS,
      `${rpc} RPC timed out after ${LIVE_RPC_TIMEOUT_MS}ms`,
    )
  } catch (err) {
    console.warn(`[live] ${rpc} call timed out or failed:`, err)
    return localMutateAttempt(attempt, localCommand)
  }
  if (result.error) {
    console.warn(`[live] ${rpc}:`, result.error.message)
    return localMutateAttempt(attempt, localCommand)
  }
  const row = result.data as DbSnapshot
  const snap = snapshotFromDb(row)
  // Fail (Yellow) preserves the exact probeCount before resolve, even if remote RPC is unmigrated
  if (localCommand.type === 'resolve_probe' && localCommand.outcome === 'fail') {
    snap.probeCount = attempt.snapshot.probeCount
  }
  return { ok: true, data: { ...attempt, snapshot: snap } }
}

export async function recordLiveColor(
  attempt: AssessmentAttempt,
  color: ResultColor,
): Promise<Result<AssessmentAttempt>> {
  const at = new Date().toISOString()
  if (attempt.snapshot.status === 'finalized' || attempt.snapshot.status === 'corrected') {
    return mutateSnapshot(
      attempt,
      'correct_final_result',
      {
        p_attempt_id: attempt.id,
        p_color: color,
        p_reason: 'Changed during live observation',
        p_actor_user_id: attempt.teacherUserId,
      },
      {
        type: 'correct',
        color,
        reason: 'Changed during observation',
        at,
        actorId: attempt.teacherUserId,
      },
    )
  }
  if (!isPrimaryCaptureColor(color)) {
    return { ok: false, error: 'Primary capture only accepts Red, Orange, Green, or Purple' }
  }
  return mutateSnapshot(
    attempt,
    'record_provisional_result',
    {
      p_attempt_id: attempt.id,
      p_color: color,
      p_actor_user_id: attempt.teacherUserId,
    },
    { type: 'record_provisional', color, at },
  )
}

export async function resolveLiveProbe(
  attempt: AssessmentAttempt,
  outcome: 'fail' | 'continue' | 'done',
): Promise<Result<AssessmentAttempt>> {
  const at = new Date().toISOString()
  return mutateSnapshot(
    attempt,
    'resolve_probe',
    {
      p_attempt_id: attempt.id,
      p_outcome: outcome,
      p_actor_user_id: attempt.teacherUserId,
    },
    { type: 'resolve_probe', outcome, at },
  )
}

export async function loadLiveLedger(roster: RosterState): Promise<Result<ResultRecord[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const classBySession = new Map<string, { classId: string; courseId: string }>()
  const classById = new Map(roster.classes.map((row) => [row.id, row]))
  const classIds = roster.classes.map((row) => row.id)
  if (classIds.length === 0) return { ok: true, data: [] }

  const sessionsResult = await selectInBatches<{ id: string; class_id: string }>(sb, {
    table: 'learning_sessions',
    select: 'id,class_id',
    column: 'class_id',
    values: classIds,
  })
  if (!sessionsResult.ok) return sessionsResult
  for (const session of sessionsResult.data) {
    const klass = classById.get(session.class_id as string)
    if (klass)
      classBySession.set(session.id as string, { classId: klass.id, courseId: klass.courseId })
  }
  const sessionIds = [...classBySession.keys()]
  if (sessionIds.length === 0) return { ok: true, data: [] }

  const attemptsResult = await selectInBatches<DbAttempt>(sb, {
    table: 'assessment_attempts',
    select: 'id,learning_session_id,session_question_id,learner_user_id,teacher_user_id',
    column: 'learning_session_id',
    values: sessionIds,
  })
  if (!attemptsResult.ok) return attemptsResult
  const attempts = attemptsResult.data
  if (attempts.length === 0) return { ok: true, data: [] }

  const snapshotsResult = await selectInBatches<DbSnapshot>(sb, {
    table: 'assessment_attempt_snapshots',
    select:
      'attempt_id,status,provisional_color,effective_color,effective_score,probe_count,max_probe_count,entered_probe_flow,finalized_at,updated_at',
    column: 'attempt_id',
    values: attempts.map((row) => row.id),
    apply: (query) => query.in('status', ['finalized', 'corrected']),
  })
  if (!snapshotsResult.ok) return snapshotsResult
  const snapshots = snapshotsResult.data
  const attemptById = new Map(attempts.map((row) => [row.id, row]))
  const rows: ResultRecord[] = []
  for (const snapshot of snapshots) {
    const attempt = attemptById.get(snapshot.attempt_id)
    const scope = attempt ? classBySession.get(attempt.learning_session_id) : null
    if (!attempt || !scope || !snapshot.effective_color || !snapshot.finalized_at) continue
    rows.push({
      id: snapshot.attempt_id,
      organizationId: roster.organization.id,
      courseId: scope.courseId,
      classId: scope.classId,
      learningSessionId: attempt.learning_session_id,
      learnerUserId: attempt.learner_user_id,
      teacherUserId: attempt.teacher_user_id,
      sessionQuestionId: attempt.session_question_id,
      effectiveColor: snapshot.effective_color,
      enteredProbeFlow: snapshot.entered_probe_flow,
      probeEventCount: snapshot.probe_count,
      finalizedAt: snapshot.finalized_at,
    })
  }
  return { ok: true, data: rows }
}

export function replaceLiveAttempt(
  capture: CaptureSessionState,
  attempt: AssessmentAttempt,
): CaptureSessionState {
  return {
    ...capture,
    attempts: capture.attempts.map((current) => (current.id === attempt.id ? attempt : current)),
  }
}

export async function syncCaptureSessionToServer(
  capture: CaptureSessionState,
): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  try {
    if (capture.questions.length === 0) return { ok: true, data: true }

    const dbQuestions: DbQuestion[] = capture.questions.map((q) => ({
      id: q.id,
      learning_session_id: q.learningSessionId,
      sequence_number: q.sequenceNumber,
      external_ref: q.externalRef,
    }))

    const dbAttempts: DbAttempt[] = capture.attempts.map((a) => ({
      id: a.id,
      learning_session_id: a.learningSessionId,
      session_question_id: a.sessionQuestionId,
      learner_user_id: a.learnerUserId,
      teacher_user_id: a.teacherUserId,
    }))

    const dbSnapshots: DbSnapshot[] = capture.attempts.map((a) => ({
      attempt_id: a.id,
      status: a.snapshot.status,
      provisional_color: a.snapshot.provisionalColor,
      effective_color: a.snapshot.effectiveColor,
      effective_score: a.snapshot.effectiveScore,
      probe_count: a.snapshot.probeCount,
      max_probe_count: a.snapshot.maxProbeCount,
      entered_probe_flow: a.snapshot.enteredProbeFlow,
      finalized_at: a.snapshot.finalizedAt,
      updated_at: new Date().toISOString(),
    }))

    // 1. Upsert questions
    const qRes = await sb.from('session_questions').upsert(dbQuestions, { onConflict: 'id' })
    if (qRes.error) return { ok: false, error: `session_questions sync: ${qRes.error.message}` }

    // 2. Upsert attempts
    const aRes = await sb.from('assessment_attempts').upsert(dbAttempts, { onConflict: 'id' })
    if (aRes.error) return { ok: false, error: `assessment_attempts sync: ${aRes.error.message}` }

    // 3. Upsert snapshots
    const sRes = await sb.from('assessment_attempt_snapshots').upsert(dbSnapshots, { onConflict: 'attempt_id' })
    if (sRes.error) return { ok: false, error: `assessment_attempt_snapshots sync: ${sRes.error.message}` }

    return { ok: true, data: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'capture sync failed' }
  }
}
