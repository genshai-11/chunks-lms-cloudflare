/**
 * Load assessment events + snapshots from Supabase and run divergence diagnostics.
 */
import type { RosterState } from '../modules/roster/types'
import {
  findSnapshotDivergences,
  type Divergence,
  type EventSummary,
  type SnapshotSummary,
} from '../modules/reporting/reconciliation'
import { getSupabase } from './supabase'
import { loadLiveLedger, selectInBatches } from './live-assessment'
import type { ResultRecord } from '../modules/reporting/progress'
import { effectiveResults } from '../modules/ops/effective-results'

export type ReconciliationReport = {
  checkedAt: string
  attemptCount: number
  eventRowCount: number
  divergences: Divergence[]
  ok: boolean
}

function client() {
  return getSupabase() as any
}

/**
 * Rebuild ledger from finalized/corrected snapshots (server projection).
 * Prefer this over client capture append-only when cloud is configured.
 */
export async function rebuildLedgerFromCloud(
  roster: RosterState,
): Promise<{ ok: true; data: ResultRecord[] } | { ok: false; error: string }> {
  const loaded = await loadLiveLedger(roster)
  if (!loaded.ok) return loaded
  return { ok: true, data: effectiveResults(loaded.data) }
}

/** Fetch event/snapshot summaries for org classes and detect divergence. */
export async function runCloudReconciliation(
  roster: RosterState,
): Promise<{ ok: true; data: ReconciliationReport } | { ok: false; error: string }> {
  const sb = client()
  if (!sb) {
    return {
      ok: true,
      data: {
        checkedAt: new Date().toISOString(),
        attemptCount: 0,
        eventRowCount: 0,
        divergences: [],
        ok: true,
      },
    }
  }

  try {
    const classIds = roster.classes.map((c) => c.id)
    if (classIds.length === 0) {
      return {
        ok: true,
        data: {
          checkedAt: new Date().toISOString(),
          attemptCount: 0,
          eventRowCount: 0,
          divergences: [],
          ok: true,
        },
      }
    }

    const sessionsRes = await selectInBatches<{ id: string }>(sb, {
      table: 'learning_sessions',
      select: 'id',
      column: 'class_id',
      values: classIds,
    })
    if (!sessionsRes.ok) return sessionsRes
    const sessionIds = sessionsRes.data.map((s) => s.id)
    if (sessionIds.length === 0) {
      return {
        ok: true,
        data: {
          checkedAt: new Date().toISOString(),
          attemptCount: 0,
          eventRowCount: 0,
          divergences: [],
          ok: true,
        },
      }
    }

    const attemptsRes = await selectInBatches<{ id: string }>(sb, {
      table: 'assessment_attempts',
      select: 'id',
      column: 'learning_session_id',
      values: sessionIds,
    })
    if (!attemptsRes.ok) return attemptsRes
    const attemptIds = attemptsRes.data.map((a) => a.id)
    if (attemptIds.length === 0) {
      return {
        ok: true,
        data: {
          checkedAt: new Date().toISOString(),
          attemptCount: 0,
          eventRowCount: 0,
          divergences: [],
          ok: true,
        },
      }
    }

    const eventsRes = await selectInBatches<{
      attempt_id: string
      event_type: string
      payload: unknown
      created_at: string
    }>(sb, {
      table: 'assessment_events',
      select: 'attempt_id, event_type, payload, created_at',
      column: 'attempt_id',
      values: attemptIds,
      apply: (query) => query.order('created_at', { ascending: true }),
    })
    if (!eventsRes.ok) return eventsRes

    const snapsRes = await selectInBatches<{
      attempt_id: string
      status: string
      effective_color: string | null
    }>(sb, {
      table: 'assessment_attempt_snapshots',
      select: 'attempt_id, status, effective_color',
      column: 'attempt_id',
      values: attemptIds,
    })
    if (!snapsRes.ok) return snapsRes

    const eventsByAttempt = new Map<string, { lastFinalColor: string | null; eventCount: number }>()
    for (const id of attemptIds) {
      eventsByAttempt.set(id, { lastFinalColor: null, eventCount: 0 })
    }
    let eventRowCount = 0
    for (const e of eventsRes.data) {
      eventRowCount += 1
      const id = e.attempt_id as string
      const cur = eventsByAttempt.get(id) ?? { lastFinalColor: null, eventCount: 0 }
      cur.eventCount += 1
      const type = e.event_type as string
      if (type === 'result_finalized' || type === 'result_corrected') {
        const payload = (e.payload ?? {}) as { color?: string; effective_color?: string }
        cur.lastFinalColor = payload.color ?? payload.effective_color ?? cur.lastFinalColor
      }
      eventsByAttempt.set(id, cur)
    }

    const events: EventSummary[] = [...eventsByAttempt.entries()].map(([attemptId, v]) => ({
      attemptId,
      lastFinalColor: v.lastFinalColor,
      eventCount: v.eventCount,
    }))

    const snapshots: SnapshotSummary[] = snapsRes.data.map((s) => ({
      attemptId: s.attempt_id,
      status: s.status,
      effectiveColor: s.effective_color,
    }))

    const divergences = findSnapshotDivergences(events, snapshots)
    return {
      ok: true,
      data: {
        checkedAt: new Date().toISOString(),
        attemptCount: attemptIds.length,
        eventRowCount,
        divergences,
        ok: divergences.length === 0,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'reconciliation failed' }
  }
}
