import { describe, expect, it } from 'vitest'
import {
  canAccessStaffRole,
  normalizeStaffRole,
  parseEmailList,
  resolveActiveStaffRoles,
} from './staff-roles'

describe('parseEmailList', () => {
  it('splits and lowercases emails', () => {
    expect(parseEmailList('A@x.com, b@Y.com; c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com'])
  })

  it('returns empty for blank', () => {
    expect(parseEmailList('')).toEqual([])
    expect(parseEmailList(null)).toEqual([])
  })
})

describe('normalizeStaffRole', () => {
  it('accepts only database-owned staff roles', () => {
    expect(normalizeStaffRole('admin')).toBe('admin')
    expect(normalizeStaffRole('teacher')).toBe('teacher')
    expect(normalizeStaffRole('learner')).toBeNull()
    expect(normalizeStaffRole('staff')).toBeNull()
  })
})

describe('resolveActiveStaffRoles', () => {
  it('keeps active database grants and ignores inactive grants', () => {
    expect(
      resolveActiveStaffRoles([
        { role: 'teacher', active: true },
        { role: 'admin', active: false },
      ]),
    ).toEqual(['teacher'])
  })

  it('lets an active admin enter teacher surfaces', () => {
    expect(resolveActiveStaffRoles([{ role: 'admin', active: true }])).toEqual(['admin', 'teacher'])
  })
})

describe('canAccessStaffRole', () => {
  it('lets admin open teacher workspace', () => {
    expect(canAccessStaffRole(['admin'], 'teacher')).toBe(true)
    expect(canAccessStaffRole(['admin'], 'admin')).toBe(true)
    expect(canAccessStaffRole(['teacher'], 'admin')).toBe(false)
    expect(canAccessStaffRole(['teacher'], 'teacher')).toBe(true)
  })
})
