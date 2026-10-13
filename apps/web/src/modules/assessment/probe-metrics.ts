/**
 * Probe counters for teacher/analysis UI.
 *
 * Product language (not sample size):
 * - **chunks count** = times teacher chose Green (2) → entered probe flow
 * - **chunks number** = displayed probe depth for one attempt; Green opens at 1
 * - **max chunks number** = max displayed chunks number in the window
 * - **avg chunks number** = mean displayed chunks number over probed attempts
 *
 * Do not call finalized sample size "n" — use sample / finalized.
 */

export type ProbeAttemptLike = {
  enteredProbeFlow: boolean
  probeCount: number
}

export type ProbeAggregates = {
  /** Times Green opened probe flow */
  nCount: number
  /** Max observed chunks number (not session maxProbeCount ceiling) */
  nDepthMax: number | null
  /** Mean chunks number over probed attempts */
  nDepthAvg: number | null
  /** Attempts that entered probe flow */
  probedCount: number
}

export const PROBE_METRIC_LABELS = {
  nCount: 'chunks count',
  nDepth: 'chunks number',
  nDepthMax: 'max chunks number',
  nDepthAvg: 'avg chunks number',
} as const

export const PROBE_METRIC_TOOLTIPS = {
  nCount:
    'Number of times the teacher selected Green (2) and entered the probe sub-screens.',
  nDepth:
    'Chunks Number for one question: Green opens at 1, and each Continue adds 1. Fail/Done resolve the current chunks number. Example: Green + Continue ×8 + Done → chunks number = 9.',
  nDepthMax: 'Highest chunks number observed in this window.',
  nDepthAvg: 'Average chunks number across questions that entered the probe flow.',
} as const

/** Displayed chunks number; null when never entered probe. */
export function probeChunksNumber(a: ProbeAttemptLike): number | null {
  if (!a.enteredProbeFlow && a.probeCount <= 0) return null
  return Math.max(1, a.probeCount + 1)
}

/** Backwards-compatible helper name for callers that still use the old n-depth code name. */
export function attemptNDepth(a: ProbeAttemptLike): number | null {
  return probeChunksNumber(a)
}

export function aggregateProbeMetrics(attempts: ProbeAttemptLike[]): ProbeAggregates {
  const probed = attempts.filter((a) => a.enteredProbeFlow || a.probeCount > 0)
  const nCount = attempts.filter((a) => a.enteredProbeFlow).length
  if (probed.length === 0) {
    return { nCount, nDepthMax: null, nDepthAvg: null, probedCount: 0 }
  }
  let sum = 0
  let max = 0
  for (const a of probed) {
    const chunksNumber = probeChunksNumber(a) ?? 0
    sum += chunksNumber
    max = Math.max(max, chunksNumber)
  }
  return {
    nCount,
    nDepthMax: max,
    nDepthAvg: sum / probed.length,
    probedCount: probed.length,
  }
}

export function formatNDepthAvg(value: number | null, digits = 1): string {
  if (value == null) return '—'
  return value.toFixed(digits)
}
