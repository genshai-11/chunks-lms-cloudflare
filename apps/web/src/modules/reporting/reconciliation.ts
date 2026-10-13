/**
 * Detect event/snapshot divergence for operational diagnostics.
 * Events are authoritative; snapshot must match last finalization/correction.
 */
export type EventSummary = {
  attemptId: string
  lastFinalColor: string | null
  eventCount: number
}

export type SnapshotSummary = {
  attemptId: string
  status: string
  effectiveColor: string | null
}

export type Divergence = {
  attemptId: string
  reason: string
}

export function findSnapshotDivergences(
  events: EventSummary[],
  snapshots: SnapshotSummary[],
): Divergence[] {
  const snapById = new Map(snapshots.map((s) => [s.attemptId, s]))
  const out: Divergence[] = []

  for (const e of events) {
    const s = snapById.get(e.attemptId)
    if (!s) {
      out.push({ attemptId: e.attemptId, reason: 'missing_snapshot' })
      continue
    }
    if (e.lastFinalColor && s.effectiveColor && e.lastFinalColor !== s.effectiveColor) {
      out.push({
        attemptId: e.attemptId,
        reason: `color_mismatch event=${e.lastFinalColor} snapshot=${s.effectiveColor}`,
      })
    }
    if (e.lastFinalColor && !['finalized', 'corrected'].includes(s.status)) {
      out.push({
        attemptId: e.attemptId,
        reason: `status_mismatch expected finalized/corrected got ${s.status}`,
      })
    }
  }

  return out
}
