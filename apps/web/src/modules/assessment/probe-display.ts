/**
 * Teacher-facing probe labels.
 *
 * - **chunks number** = displayed probe depth after Green; Green opens at 1.
 * - **chunks count** = session-level count of Green entries (see probe-metrics).
 * - **ceiling** = maxProbeCount (configured session limit — not observed peak).
 *
 * Do not reuse chunks number for sample size / finalized question count — use "finalized" or "sample".
 */

import type { AssessmentSnapshot } from '../result-lifecycle/types'
import { PROBE_METRIC_LABELS, probeChunksNumber } from './probe-metrics'

export function probeN(snapshot: Pick<AssessmentSnapshot, 'probeCount' | 'enteredProbeFlow'> | null | undefined): number | null {
  if (!snapshot) return null
  return probeChunksNumber(snapshot)
}

/** @deprecated Prefer naming as session ceiling, not max chunks number */
export function probeDepthMax(
  snapshot: Pick<AssessmentSnapshot, 'maxProbeCount'> | null | undefined,
  fallbackMax = 0,
): number {
  if (snapshot?.maxProbeCount != null && snapshot.maxProbeCount > 0) {
    return snapshot.maxProbeCount
  }
  return fallbackMax
}

/** Compact cell text: "chunks number=2" or "—" */
export function formatProbeCell(
  snapshot: AssessmentSnapshot | null | undefined,
  _sessionMaxProbe?: number,
): string {
  const n = probeN(snapshot)
  if (n == null) return '—'
  return `${PROBE_METRIC_LABELS.nDepth}=${n}`
}

/** Live badge while probe is open */
export function formatProbeLive(
  probeCount: number,
  maxProbeCount: number,
): { nLabel: string; depthLabel: string } {
  const chunksNumber = probeChunksNumber({ enteredProbeFlow: true, probeCount }) ?? 1
  return {
    nLabel: `${PROBE_METRIC_LABELS.nDepth}=${chunksNumber}`,
    depthLabel: maxProbeCount > 0 ? `ceiling ${maxProbeCount}` : 'ceiling —',
  }
}
