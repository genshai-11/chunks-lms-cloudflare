import { describe, expect, it } from 'vitest'
import { assertRunTransition, assertSingleLearner, calculateItemCpd, canStartStandaloneRun } from './types'

describe('standalone test invariants', () => {
  it('requires exactly one learner', () => {
    expect(assertSingleLearner(['learner-1'])).toBe('learner-1')
    expect(() => assertSingleLearner([])).toThrow('exactly one Learner')
    expect(() => assertSingleLearner(['a', 'b'])).toThrow('exactly one Learner')
  })

  it('derives CPD from session CVR and CCI Ampe', () => {
    expect(calculateItemCpd({ targetCvrOhm: 17, cciValue: 8 })).toBe(136)
  })

  it('requires complete current approved narration', () => {
    expect(canStartStandaloneRun({ introApproved: true, approvedItemCount: 10, expectedItemCount: 10, staleCount: 0 })).toBe(true)
    expect(canStartStandaloneRun({ introApproved: true, approvedItemCount: 9, expectedItemCount: 10, staleCount: 0 })).toBe(false)
    expect(canStartStandaloneRun({ introApproved: true, approvedItemCount: 10, expectedItemCount: 10, staleCount: 1 })).toBe(false)
  })

  it('prevents reopening completed runs', () => {
    expect(() => assertRunTransition('draft', 'ready')).not.toThrow()
    expect(() => assertRunTransition('completed', 'in_progress')).toThrow('Invalid standalone run transition')
  })
})
