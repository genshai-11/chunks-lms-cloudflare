import { describe, expect, it } from 'vitest'
import { PROBE_ACTIONS } from './probe-actions'

describe('probe action presentation', () => {
  it('maps probe actions to spectrum colors and lifecycle outcomes', () => {
    expect(PROBE_ACTIONS.map(({ colorLabel, label, outcome }) => [colorLabel, label, outcome])).toEqual([
      ['Yellow', 'Fail', 'fail'],
      ['Blue', 'Continue', 'continue'],
      ['Indigo', 'Done', 'done'],
    ])
  })

  it('uses required primary and numeric keyboard shortcuts', () => {
    expect(PROBE_ACTIONS.map(({ label, shortcuts }) => [label, shortcuts])).toEqual([
      ['Fail', ['F', '1']],
      ['Continue', ['C', '2']],
      ['Done', ['D', '3', 'Enter']],
    ])
  })
})
