import { describe, expect, it } from 'vitest'
import { runSeededEndToEndFlow } from './seeded-flow'

describe('seeded end-to-end flow', () => {
  it('runs login→schedule→attendance→assessment→probes→correction→reporting', () => {
    const result = runSeededEndToEndFlow()
    expect(result.ok).toBe(true)
    expect(result.scheduling.learningSessions[0]?.status).toBe('completed')
    expect(result.scheduling.attendance).toHaveLength(3)
    expect(result.capture.sessionStatus).toBe('completed')
    expect(result.ledger).toHaveLength(3)
    expect(result.reportSampleSize).toBe(4)

    const colors = result.ledger.map((r) => r.effectiveColor).sort()
    expect(colors).toEqual(['indigo', 'purple', 'red'])
  })
})
