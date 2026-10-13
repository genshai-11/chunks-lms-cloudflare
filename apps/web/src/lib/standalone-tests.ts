import { cacheKey, cachedQuery, clearRequestCache } from './request-cache'
export { clearRequestCache } from './request-cache'
import { getSupabase } from './supabase'
import type {
  PromptLanguage,
  StandaloneAssignmentStatus,
  StandaloneRunStatus,
} from '../modules/standalone-tests/types'
import type { ProvisionalColor } from '../modules/result-lifecycle/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type StandaloneTestAssignmentRow = {
  id: string
  organizationId: string
  learnerUserId: string
  packageVersionId: string
  assignedByUserId: string
  assignmentNumber: number
  status: StandaloneAssignmentStatus
  assignedAt: string
}

export type StandaloneAssignmentProgress = {
  assignmentId: string
  completedQuestions: number
  totalQuestions: number
}

export type StandaloneTestRunRow = {
  id: string
  assignmentId: string
  learnerUserId: string
  testSectionId: string
  measurementSnapshotId: string
  attemptNumber: number
  promptLanguage: PromptLanguage
  voiceId: string
  sessionNumber: number
  targetCvrOhm: number
  cciSourceId: string
  cciName: string
  cciValue: number
  itemCpd: number
  status: StandaloneRunStatus
}

function client() {
  return getSupabase() as any
}

function assignment(row: any): StandaloneTestAssignmentRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    learnerUserId: row.learner_user_id,
    packageVersionId: row.package_version_id,
    assignedByUserId: row.assigned_by_user_id,
    assignmentNumber: row.assignment_number,
    status: row.status,
    assignedAt: row.assigned_at,
  }
}

function run(row: any): StandaloneTestRunRow {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    learnerUserId: row.learner_user_id,
    testSectionId: row.test_section_id,
    measurementSnapshotId: row.section_measurement_snapshot_id,
    attemptNumber: row.attempt_number,
    promptLanguage: row.prompt_language,
    voiceId: row.voice_id,
    sessionNumber: row.session_number,
    targetCvrOhm: Number(row.target_cvr_ohm),
    cciSourceId: row.cci_source_id,
    cciName: row.cci_name,
    cciValue: Number(row.cci_value),
    itemCpd: Number(row.item_cpd),
    status: row.status,
  }
}

export async function listStandaloneAssignments(
  learnerUserId?: string,
): Promise<Result<StandaloneTestAssignmentRow[]>> {
  return cachedQuery(
    cacheKey(['standalone', 'assignments', learnerUserId ?? 'all']),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      let query = sb
        .from('standalone_test_assignments')
        .select('*')
        .order('assigned_at', { ascending: false })
      if (learnerUserId) query = query.eq('learner_user_id', learnerUserId)
      const { data, error } = await query
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: (data ?? []).map(assignment) }
    },
    { ttlMs: 30_000, persist: true }
  )
}

export async function listStandaloneRuns(
  assignmentId: string,
): Promise<Result<StandaloneTestRunRow[]>> {
  return cachedQuery(
    cacheKey(['standalone', 'runs', assignmentId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('standalone_test_runs')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('session_number')
        .order('attempt_number')
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: (data ?? []).map(run) }
    },
    { ttlMs: 15_000, persist: true },
  )
}

export async function getStandaloneRun(
  runId: string,
): Promise<Result<StandaloneTestRunRow | null>> {
  return cachedQuery(
    cacheKey(['standalone', 'run', runId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('standalone_test_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data ? run(data) : null }
    },
    { ttlMs: 15_000, persist: true },
  )
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb.rpc(name, args)
  if (error) return { ok: false, error: error.message }
  clearRequestCache('standalone')
  return { ok: true, data: data as T }
}

export const createStandaloneAssignment = (learnerUserId: string, packageVersionId: string) =>
  rpc<string>('create_standalone_test_assignment', {
    p_learner_user_id: learnerUserId,
    p_package_version_id: packageVersionId,
  })

export const prepareStandaloneRun = (
  assignmentId: string,
  sectionId: string,
  language: PromptLanguage,
  voiceId: string,
) =>
  rpc<{
    runId: string
    status?: 'draft' | 'ready' | 'in_progress'
    canStart: boolean
    readinessToken: string
    approvedItemAudioCount: number
    sessionNumber: number
    targetCvrOhm: number
    cciName: string
    cciValue: number
    itemCpd: number
  }>('prepare_standalone_test_run', {
    p_assignment_id: assignmentId,
    p_test_section_id: sectionId,
    p_language: language,
    p_voice_id: voiceId,
  })

export const startStandaloneRun = (runId: string, readinessToken: string) =>
  rpc<{ runId: string; status: 'in_progress'; itemCount: number }>('start_standalone_test_run', {
    p_run_id: runId,
    p_readiness_token: readinessToken,
  })

export const recordStandaloneResult = (
  runItemId: string,
  color: ProvisionalColor,
) =>
  rpc<{ attemptId: string; status: string; effectiveColor: string | null; probeCount: number }>(
    'record_standalone_provisional_result',
    { p_run_item_id: runItemId, p_color: color },
  )

export const resolveStandaloneProbe = (attemptId: string, outcome: 'fail' | 'continue' | 'done') =>
  rpc<{ attemptId: string; status: string; effectiveColor: string | null; probeCount: number }>(
    'resolve_standalone_probe',
    { p_attempt_id: attemptId, p_outcome: outcome },
  )

export const completeStandaloneRun = (runId: string) =>
  rpc<{ runId: string; status: 'completed'; finalizedItems: number }>(
    'complete_standalone_test_run',
    { p_run_id: runId },
  )

export const stopStandaloneRun = (runId: string) =>
  rpc<{ runId: string; status: 'completed'; partial: boolean; finalizedItems: number; totalItems: number }>(
    'stop_standalone_test_run',
    { p_run_id: runId },
  )

export const getLearnerStandaloneResults = (learnerUserId: string) =>
  rpc<{
    learnerUserId: string
    runCount: number
    averageLearnerCpdScore: number | null
    runs: Array<Record<string, unknown>>
  }>('get_learner_standalone_test_results', {
    p_learner_user_id: learnerUserId,
    p_package_id: null,
  })

export async function getStandaloneRunRuntime(runId: string): Promise<
  Result<{
    id: string
    status: string
    promptLanguage: 'vi' | 'en'
    voiceId: string
    introNarrationVariantId: string | null
  }>
> {
  return cachedQuery(
    cacheKey(['standalone', 'runtime', runId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('standalone_test_runs')
        .select('id, status, prompt_language, voice_id, intro_narration_variant_id')
        .eq('id', runId)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'Standalone Test Run not found' }
      return {
        ok: true,
        data: {
          id: data.id,
          status: data.status,
          promptLanguage: data.prompt_language,
          voiceId: data.voice_id,
          introNarrationVariantId: data.intro_narration_variant_id,
        },
      }
    },
    { ttlMs: 15_000, persist: true },
  )
}

export async function listStandaloneRunItems(
  runId: string,
): Promise<Result<Array<Record<string, unknown>>>> {
  return cachedQuery(
    cacheKey(['standalone', 'run-items', runId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('standalone_test_run_items')
        .select('*, test_items(prompt_vi, prompt_en), standalone_test_attempts(*, standalone_test_attempt_snapshots(*))')
        .eq('run_id', runId)
        .order('item_order')
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data ?? [] }
    },
    { ttlMs: 10_000, persist: true }
  )
}

export async function findLatestApprovedNarrationVariant(input: {
  target: 'package_start' | 'part_intro' | 'package_end' | 'section_intro' | 'test_item'
  language: PromptLanguage
  packageVersionId?: string | null
  part?: number | null
  testSectionId?: string | null
  testItemId?: string | null
}): Promise<Result<{ id: string; audioAssetId: string; voiceId?: string } | null>> {
  return cachedQuery(
    cacheKey([
      'standalone',
      'narration-variant',
      input.target,
      input.language,
      input.packageVersionId,
      input.part,
      input.testSectionId,
      input.testItemId,
    ]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      let query = sb
        .from('narration_variants')
        .select('id, audio_asset_id, voice_id')
        .eq('narration_target', input.target)
        .eq('language', input.language)
        .eq('approval_status', 'approved')
        .not('audio_asset_id', 'is', null)
        .order('approved_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (input.target === 'package_start' || input.target === 'package_end' || input.target === 'part_intro') {
        if (!input.packageVersionId) return { ok: true, data: null }
        query = query.eq('package_version_id', input.packageVersionId)
        if (input.target === 'part_intro') query = query.eq('provider_metadata->>part', String(input.part ?? 1))
      } else if (input.target === 'section_intro') {
        if (!input.testSectionId) return { ok: true, data: null }
        query = query.eq('test_section_id', input.testSectionId)
      } else {
        if (!input.testItemId) return { ok: true, data: null }
        query = query.eq('test_item_id', input.testItemId)
      }

      const { data, error } = await query.maybeSingle()
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data ? { id: data.id, audioAssetId: data.audio_asset_id, voiceId: data.voice_id } : null }
    },
    { ttlMs: 60_000, persist: true },
  )
}

export async function deleteStandaloneAssignment(assignmentId: string): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb.from('standalone_test_assignments').delete().eq('id', assignmentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function getStandaloneAssignmentAnalysis(assignmentId: string): Promise<
  Result<{
    assignment: StandaloneTestAssignmentRow | null
    runs: StandaloneTestRunRow[]
    items: Array<Record<string, unknown>>
  }>
> {
  const assignments = await listStandaloneAssignments()
  if (!assignments.ok) return assignments
  const runs = await listStandaloneRuns(assignmentId)
  if (!runs.ok) return runs
  const itemResults = await Promise.all(runs.data.map((r) => listStandaloneRunItems(r.id)))
  const items: Array<Record<string, unknown>> = []
  for (let i = 0; i < runs.data.length; i += 1) {
    const result = itemResults[i]
    if (!result?.ok) return result ?? { ok: false, error: 'Could not load run items' }
    for (const item of result.data) {
      items.push({
        ...item,
        parent_run_id: runs.data[i]!.id,
        session_number: runs.data[i]!.sessionNumber,
        prompt_language: runs.data[i]!.promptLanguage,
        voice_id: runs.data[i]!.voiceId,
        target_cvr_ohm: runs.data[i]!.targetCvrOhm,
        cci_name: runs.data[i]!.cciName,
        cci_value: runs.data[i]!.cciValue,
        item_cpd: runs.data[i]!.itemCpd,
      })
    }
  }
  return {
    ok: true,
    data: {
      assignment: assignments.data.find((a) => a.id === assignmentId) ?? null,
      runs: runs.data,
      items,
    },
  }
}

export async function getBatchStandaloneAssignmentProgress(
  assignmentIds: string[],
): Promise<Result<Record<string, StandaloneAssignmentProgress>>> {
  if (assignmentIds.length === 0) return { ok: true, data: {} }
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  // 1. Fetch runs for all requested assignments in 1 query
  const { data: runs, error: runsErr } = await sb
    .from('standalone_test_runs')
    .select('id, assignment_id')
    .in('assignment_id', assignmentIds)

  if (runsErr) return { ok: false, error: runsErr.message }
  if (!runs || runs.length === 0) {
    const emptyResult: Record<string, StandaloneAssignmentProgress> = {}
    for (const id of assignmentIds) {
      emptyResult[id] = { assignmentId: id, completedQuestions: 0, totalQuestions: 0 }
    }
    return { ok: true, data: emptyResult }
  }

  const runToAssignment = new Map<string, string>()
  const runIds: string[] = []
  for (const r of runs) {
    runToAssignment.set(r.id, r.assignment_id)
    runIds.push(r.id)
  }

  // 2. Fetch run items count in 1 lightweight query (only id, run_id - NO heavy prompt joins)
  const { data: runItems, error: itemsErr } = await sb
    .from('standalone_test_run_items')
    .select('id, run_id')
    .in('run_id', runIds)

  if (itemsErr) return { ok: false, error: itemsErr.message }

  // 3. Fetch completed attempts in 1 query (only run_id and snapshot status)
  const { data: attempts, error: attemptsErr } = await sb
    .from('standalone_test_attempts')
    .select('run_id, standalone_test_attempt_snapshots(status)')
    .in('run_id', runIds)

  if (attemptsErr) return { ok: false, error: attemptsErr.message }

  const totals = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const id of assignmentIds) {
    totals.set(id, 0)
    completed.set(id, 0)
  }

  for (const item of runItems ?? []) {
    const aId = runToAssignment.get(item.run_id)
    if (aId) totals.set(aId, (totals.get(aId) ?? 0) + 1)
  }

  for (const att of attempts ?? []) {
    const snapshot = (att as any)?.standalone_test_attempt_snapshots
    const status = Array.isArray(snapshot) ? snapshot[0]?.status : snapshot?.status
    if (['finalized', 'corrected'].includes(status)) {
      const aId = runToAssignment.get(att.run_id)
      if (aId) completed.set(aId, (completed.get(aId) ?? 0) + 1)
    }
  }

  const result: Record<string, StandaloneAssignmentProgress> = {}
  for (const id of assignmentIds) {
    result[id] = {
      assignmentId: id,
      completedQuestions: completed.get(id) ?? 0,
      totalQuestions: totals.get(id) ?? 0,
    }
  }
  return { ok: true, data: result }
}

export async function getStandaloneAssignmentProgress(
  assignmentId: string,
): Promise<Result<StandaloneAssignmentProgress>> {
  const batch = await getBatchStandaloneAssignmentProgress([assignmentId])
  if (!batch.ok) return batch
  return {
    ok: true,
    data: batch.data[assignmentId] ?? { assignmentId, completedQuestions: 0, totalQuestions: 0 },
  }
}

export type StandaloneTestRunBundleItem = {
  id: string
  run_id: string
  test_item_id: string
  item_order: number
  parent_run_id: string
  session_number: number
  prompt_language: 'vi' | 'en'
  voice_id: string
  test_section_id: string
  prompt_vi: string | null
  prompt_en: string | null
  spoken_script_vi: string | null
  spoken_script_en: string | null
  tc: number | null
  tl: number | null
  lc: number | null
  cvr: number
  cci: number
  cpd: number
  attempt_id: string | null
  attempt_status: string
  effective_color: string | null
  entered_probe_flow: boolean
  probe_count: number
  finalized_at: string | null
}

export type StandaloneTestRunBundle = {
  runDetails: StandaloneTestRunRow
  allRuns: StandaloneTestRunRow[]
  packageTitle: string
  packageKind: 'standard' | 'mini'
  racMetricLabel: '%c' | '%r'
  packageAudio: {
    packageStartVariantId: string | null
    partIntroVariantIds: Record<string, string | null>
    packageEndVariantId: string | null
  }
  sessionIntroVariantIds: Record<string, string | null>
  items: StandaloneTestRunBundleItem[]
}

export async function getStandaloneTestRunBundle(
  runId: string,
  assignmentId?: string,
): Promise<Result<StandaloneTestRunBundle>> {
  return cachedQuery(
    cacheKey(['standalone', 'run-bundle', runId, assignmentId ?? '']),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb.rpc('get_standalone_test_run_bundle', {
        p_run_id: runId,
        p_assignment_id: assignmentId ?? null,
      })
      if (error) return { ok: false, error: error.message }
      type RpcBundleResponse = {
        ok: boolean
        error?: string
        data?: {
          runDetails: unknown
          allRuns: unknown[]
          packageTitle?: string
          packageKind?: 'standard' | 'mini'
          racMetricLabel?: '%c' | '%r'
          packageAudio?: StandaloneTestRunBundle['packageAudio']
          sessionIntroVariantIds?: Record<string, string | null>
          items?: StandaloneTestRunBundleItem[]
        }
      }
      const response = data as unknown as RpcBundleResponse | null
      if (!response || !response.ok || !response.data) {
        return { ok: false, error: response?.error ?? 'Failed to load test run bundle' }
      }
      const payload = response.data
      const rawRuns = payload.allRuns ?? []
      return {
        ok: true,
        data: {
          runDetails: run(payload.runDetails),
          allRuns: rawRuns.map(run),
          packageTitle: payload.packageTitle ?? 'Standalone Test',
          packageKind: payload.packageKind ?? 'standard',
          racMetricLabel: (payload.racMetricLabel as '%c' | '%r') ?? '%c',
          packageAudio: payload.packageAudio ?? {
            packageStartVariantId: null,
            partIntroVariantIds: {},
            packageEndVariantId: null,
          },
          sessionIntroVariantIds: payload.sessionIntroVariantIds ?? {},
          items: payload.items ?? [],
        },
      }
    },
    { ttlMs: 15_000, persist: true },
  )
}
