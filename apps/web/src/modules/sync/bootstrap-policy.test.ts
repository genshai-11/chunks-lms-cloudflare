import { describe, expect, it } from 'vitest'
import { chooseBootstrapSource } from './bootstrap-policy'

describe('workspace bootstrap source', () => {
  it('always selects non-empty cloud over richer browser-local data', () => {
    expect(chooseBootstrapSource(1, 999)).toBe('cloud')
  })

  it('allows local data to seed only an empty cloud workspace', () => {
    expect(chooseBootstrapSource(0, 10)).toBe('local')
  })

  it('keeps a new empty account empty instead of selecting demo data', () => {
    expect(chooseBootstrapSource(0, 0)).toBe('empty')
  })
})
