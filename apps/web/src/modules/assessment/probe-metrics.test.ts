import { describe, expect, it } from 'vitest'
import { aggregateProbeMetrics, attemptNDepth } from './probe-metrics'

describe('probe metrics (chunks count / chunks number)', () => {
  it('treats Green entry as chunks count and displays chunks number starting at 1', () => {
    // Green + 8 Continue + Done → stored probeCount 8, displayed chunks number 9
    const deep = { enteredProbeFlow: true, probeCount: 8 }
    expect(attemptNDepth(deep)).toBe(9)

    const greenOnly = { enteredProbeFlow: true, probeCount: 0 }
    expect(attemptNDepth(greenOnly)).toBe(1)

    const none = { enteredProbeFlow: false, probeCount: 0 }
    expect(attemptNDepth(none)).toBeNull()
  })

  it('aggregates chunks count, max chunks number, and avg chunks number from real attempts', () => {
    const agg = aggregateProbeMetrics([
      { enteredProbeFlow: true, probeCount: 8 },
      { enteredProbeFlow: true, probeCount: 1 },
      { enteredProbeFlow: false, probeCount: 0 },
      { enteredProbeFlow: true, probeCount: 2 },
    ])
    expect(agg.nCount).toBe(3)
    expect(agg.nDepthMax).toBe(9)
    expect(agg.nDepthAvg).toBeCloseTo((9 + 2 + 3) / 3, 5)
    expect(agg.probedCount).toBe(3)
  })

  it('returns null chunks number stats when no probe entries', () => {
    const agg = aggregateProbeMetrics([
      { enteredProbeFlow: false, probeCount: 0 },
      { enteredProbeFlow: false, probeCount: 0 },
    ])
    expect(agg.nCount).toBe(0)
    expect(agg.nDepthMax).toBeNull()
    expect(agg.nDepthAvg).toBeNull()
  })
})
