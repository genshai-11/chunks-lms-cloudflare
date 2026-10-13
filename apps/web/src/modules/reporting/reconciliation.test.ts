import { describe, expect, it } from 'vitest'
import { findSnapshotDivergences } from './reconciliation'

describe('event/snapshot reconciliation', () => {
  it('flags missing snapshots and color mismatches', () => {
    const d = findSnapshotDivergences(
      [
        { attemptId: 'a1', lastFinalColor: 'green', eventCount: 3 },
        { attemptId: 'a2', lastFinalColor: 'red', eventCount: 2 },
      ],
      [{ attemptId: 'a1', status: 'finalized', effectiveColor: 'yellow' }],
    )
    expect(d).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attemptId: 'a1', reason: expect.stringContaining('color_mismatch') }),
        expect.objectContaining({ attemptId: 'a2', reason: 'missing_snapshot' }),
      ]),
    )
  })
})
