import { describe, expect, it } from 'vitest'
import {
  isEmailLoginIdentifier,
  normalizeStaffUsername,
  validateStaffUsername,
} from './staff-username'

describe('staff username', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeStaffUsername('  Teacher.One_2  ')).toBe('teacher.one_2')
  })

  it('accepts a 3-32 character lowercase staff username', () => {
    expect(validateStaffUsername('teacher.one_2')).toBeNull()
    expect(validateStaffUsername('Admin')).toBeNull()
  })

  it('rejects short, email-shaped, and unsupported usernames', () => {
    expect(validateStaffUsername('ab')).toContain('3–32')
    expect(validateStaffUsername('teacher@example.com')).toContain('letters, numbers')
    expect(validateStaffUsername('teacher name')).toContain('letters, numbers')
  })

  it('distinguishes email identifiers from usernames', () => {
    expect(isEmailLoginIdentifier(' Staff@Example.com ')).toBe(true)
    expect(isEmailLoginIdentifier('staff.user')).toBe(false)
  })
})
