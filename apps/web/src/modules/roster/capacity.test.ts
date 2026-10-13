import { describe, expect, it } from 'vitest'
import { canEnroll, DEFAULT_CLASS_CAPACITY } from './capacity'

describe('class capacity', () => {
  it('defaults to three and rejects overflow', () => {
    expect(DEFAULT_CLASS_CAPACITY).toBe(3)
    expect(canEnroll(2).ok).toBe(true)
    expect(canEnroll(3).ok).toBe(false)
  })
})
