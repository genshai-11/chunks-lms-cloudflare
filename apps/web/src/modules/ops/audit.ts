import { appendResult, type ResultRecord } from '../reporting/progress'
import type { ResultColor } from '../result-lifecycle/types'
import { applyLifecycleCommand, createDraftSnapshot } from '../result-lifecycle/state-machine'
import { effectiveResults, resultKey } from './effective-results'
import type { OpsAuditEvent, OpsAuditEventType } from './types'

export function newAuditId(at: string): string {
  return `audit-${at}-${Math.random().toString(36).slice(2, 9)}`
}

export function appendAuditEvent(
  audit: OpsAuditEvent[],
  event: Omit<OpsAuditEvent, 'id'> & { id?: string },
): OpsAuditEvent[] {
  return [
    ...audit,
    {
      ...event,
      id: event.id ?? newAuditId(event.at),
    },
  ]
}

/** Emit finalized audit rows when capture feeds the ledger. */
export function auditFromNewResults(
  organizationId: string,
  previous: ResultRecord[],
  next: ResultRecord[],
  actorId: string | null,
): OpsAuditEvent[] {
  const prevKeys = new Set(previous.map((r) => `${resultKey(r)}:${r.finalizedAt}:${r.effectiveColor}`))
  const events: OpsAuditEvent[] = []
  for (const row of next) {
    const sig = `${resultKey(row)}:${row.finalizedAt}:${row.effectiveColor}`
    if (prevKeys.has(sig)) continue
    const prior = previous
      .filter((p) => resultKey(p) === resultKey(row))
      .sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt))[0]
    const isCorrection = Boolean(prior && prior.finalizedAt < row.finalizedAt)
    events.push({
      id: newAuditId(row.finalizedAt),
      at: row.finalizedAt,
      type: isCorrection ? 'result_corrected' : 'result_finalized',
      organizationId,
      classId: row.classId,
      learningSessionId: row.learningSessionId,
      learnerUserId: row.learnerUserId,
      teacherUserId: row.teacherUserId,
      sessionQuestionId: row.sessionQuestionId,
      resultKey: resultKey(row),
      color: row.effectiveColor,
      previousColor: isCorrection ? prior!.effectiveColor : null,
      reason: isCorrection ? 'Corrected' : null,
      actorId: actorId ?? row.teacherUserId,
    })
  }
  return events
}

export type CorrectResultInput = {
  resultKey: string
  color: ResultColor
  reason: string
  actorId: string
  at?: string
}

export type CorrectResultOutcome =
  | { ok: true; ledger: ResultRecord[]; audit: OpsAuditEvent[]; value: ResultRecord }
  | { ok: false; error: string }

/**
 * Post-session correction: append new ledger row + audit event (never erase history).
 * Validates color transition via lifecycle machine on a synthetic finalized snapshot.
 */
export function correctFinalizedResult(
  ledger: ResultRecord[],
  audit: OpsAuditEvent[],
  input: CorrectResultInput,
): CorrectResultOutcome {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, error: 'Correction requires a non-empty reason' }

  const current = effectiveResults(ledger).find((r) => resultKey(r) === input.resultKey)
  if (!current) return { ok: false, error: 'Result not found' }

  const snapshot = {
    ...createDraftSnapshot(2),
    status: 'finalized' as const,
    provisionalColor: null,
    effectiveColor: current.effectiveColor,
    effectiveScore: null,
    finalizedAt: current.finalizedAt,
  }
  const at = input.at ?? new Date().toISOString()
  const lifecycle = applyLifecycleCommand(snapshot, {
    type: 'correct',
    color: input.color,
    reason,
    at,
    actorId: input.actorId,
  })
  if (!lifecycle.ok) return { ok: false, error: lifecycle.error }
  if (!lifecycle.snapshot.effectiveColor || !lifecycle.snapshot.finalizedAt) {
    return { ok: false, error: 'Correction failed to produce an effective color' }
  }

  const nextRow: Omit<ResultRecord, 'id'> = {
    organizationId: current.organizationId,
    courseId: current.courseId,
    classId: current.classId,
    learningSessionId: current.learningSessionId,
    learnerUserId: current.learnerUserId,
    teacherUserId: current.teacherUserId,
    sessionQuestionId: current.sessionQuestionId,
    effectiveColor: lifecycle.snapshot.effectiveColor,
    enteredProbeFlow: current.enteredProbeFlow,
    probeEventCount: current.probeEventCount,
    finalizedAt: lifecycle.snapshot.finalizedAt,
  }

  const nextLedger = appendResult(ledger, nextRow)
  const value = nextLedger[nextLedger.length - 1]!
  const nextAudit = appendAuditEvent(audit, {
    at,
    type: 'result_corrected',
    organizationId: current.organizationId,
    classId: current.classId,
    learningSessionId: current.learningSessionId,
    learnerUserId: current.learnerUserId,
    teacherUserId: current.teacherUserId,
    sessionQuestionId: current.sessionQuestionId,
    resultKey: input.resultKey,
    color: lifecycle.snapshot.effectiveColor,
    previousColor: current.effectiveColor,
    reason,
    actorId: input.actorId,
  })

  return { ok: true, ledger: nextLedger, audit: nextAudit, value }
}

export function filterAuditEvents(
  events: OpsAuditEvent[],
  filters: {
    classId?: string
    learnerUserId?: string
    learningSessionId?: string
    type?: OpsAuditEventType
    q?: string
  },
): OpsAuditEvent[] {
  const q = filters.q?.trim().toLowerCase()
  return events
    .filter((e) => {
      if (filters.classId && e.classId !== filters.classId) return false
      if (filters.learnerUserId && e.learnerUserId !== filters.learnerUserId) return false
      if (filters.learningSessionId && e.learningSessionId !== filters.learningSessionId) {
        return false
      }
      if (filters.type && e.type !== filters.type) return false
      if (q) {
        const hay = [e.type, e.reason, e.color, e.previousColor, e.resultKey]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}
