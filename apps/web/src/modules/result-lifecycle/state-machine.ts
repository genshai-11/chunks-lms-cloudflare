import {
  COLOR_SCORE,
  DEFAULT_MAX_PROBE_COUNT,
  type AssessmentEventType,
  type AssessmentSnapshot,
  type LifecycleCommand,
  type LifecycleResult,
  type ProvisionalColor,
  type ResultColor,
} from './types'

export function createDraftSnapshot(maxProbeCount = DEFAULT_MAX_PROBE_COUNT): AssessmentSnapshot {
  if (maxProbeCount < 1) {
    throw new Error('maxProbeCount must be a positive integer')
  }
  return {
    status: 'draft',
    provisionalColor: null,
    effectiveColor: null,
    effectiveScore: null,
    probeCount: 0,
    maxProbeCount,
    enteredProbeFlow: false,
    finalizedAt: null,
  }
}

function finalize(
  snapshot: AssessmentSnapshot,
  color: ResultColor,
  at: string,
): AssessmentSnapshot {
  return {
    ...snapshot,
    status: 'finalized',
    effectiveColor: color,
    effectiveScore: COLOR_SCORE[color],
    finalizedAt: at,
  }
}

/**
 * Pure domain transitions for Assessment Attempt result lifecycle.
 * UI callers must not re-implement these rules; DB functions mirror them for authority.
 */
export function applyLifecycleCommand(
  snapshot: AssessmentSnapshot,
  command: LifecycleCommand,
): LifecycleResult {
  switch (command.type) {
    case 'record_provisional':
      return recordProvisional(snapshot, command.color, command.at)
    case 'resolve_probe':
      return resolveProbe(snapshot, command.outcome, command.at)
    case 'correct':
      return correctResult(snapshot, command.color, command.reason, command.at)
    default: {
      const _exhaustive: never = command
      return { ok: false, error: `Unknown command: ${JSON.stringify(_exhaustive)}` }
    }
  }
}

function recordProvisional(
  snapshot: AssessmentSnapshot,
  color: ProvisionalColor,
  at: string,
): LifecycleResult {
  if (snapshot.status !== 'draft') {
    return { ok: false, error: 'Provisional result can only be recorded on a draft attempt' }
  }

  const events: AssessmentEventType[] = ['provisional_recorded']
  const base: AssessmentSnapshot = {
    ...snapshot,
    provisionalColor: color,
  }

  if (color === 'green') {
    return {
      ok: true,
      snapshot: {
        ...base,
        status: 'probe_open',
        enteredProbeFlow: true,
      },
      events,
    }
  }

  // Red, Orange, Purple finalize directly. Green enters probe flow above.
  events.push('result_finalized')
  return {
    ok: true,
    snapshot: finalize(base, color, at),
    events,
  }
}

function resolveProbe(
  snapshot: AssessmentSnapshot,
  outcome: 'fail' | 'continue' | 'done',
  at: string,
): LifecycleResult {
  if (snapshot.status !== 'probe_open' && snapshot.status !== 'resolution_required') {
    return { ok: false, error: 'Probe resolution requires an open Green probe' }
  }

  if (outcome === 'fail') {
    const events: AssessmentEventType[] = ['probe_failed', 'result_finalized']
    return {
      ok: true,
      snapshot: finalize(
        {
          ...snapshot,
          probeCount: snapshot.probeCount,
        },
        'yellow',
        at,
      ),
      events,
    }
  }

  if (outcome === 'done') {
    const events: AssessmentEventType[] = ['probe_completed', 'result_finalized']
    return {
      ok: true,
      snapshot: finalize(
        {
          ...snapshot,
          probeCount: snapshot.probeCount + (snapshot.status === 'probe_open' ? 1 : 0),
        },
        'indigo',
        at,
      ),
      events,
    }
  }

  // Continue — unlimited depth. probeCount is the UI "n" (how deep we are).
  // Legacy snapshots in resolution_required can still Fail/Done; Continue is allowed again
  // so teachers are never hard-blocked by an old max.
  const nextCount = snapshot.probeCount + 1
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      probeCount: nextCount,
      status: 'probe_open',
    },
    events: ['probe_continued'],
  }
}

function correctResult(
  snapshot: AssessmentSnapshot,
  color: ResultColor,
  reason: string,
  at: string,
): LifecycleResult {
  if (snapshot.status !== 'finalized' && snapshot.status !== 'corrected') {
    return { ok: false, error: 'Only finalized results can be corrected' }
  }
  if (!reason.trim()) {
    return { ok: false, error: 'Correction requires a non-empty reason' }
  }

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      status: 'corrected',
      effectiveColor: color,
      effectiveScore: COLOR_SCORE[color],
      finalizedAt: at,
    },
    events: ['result_corrected'],
  }
}

/** Effective finalized results only — excludes open probes and drafts. */
export function isFinalizedForMetrics(snapshot: AssessmentSnapshot): boolean {
  return (
    (snapshot.status === 'finalized' || snapshot.status === 'corrected') &&
    snapshot.effectiveColor !== null
  )
}
