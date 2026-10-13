import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSupabaseStaffWorkspace } from './supabase-sync'

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: mocks.getSupabase }))

function existingTeacherClient(options?: { hasMembership?: boolean; hasUser?: boolean }) {
  const hasMembership = options?.hasMembership ?? true
  const hasUser = options?.hasUser ?? true
  const userInsert = vi.fn()
  const membershipUpsert = vi.fn()
  const roleUpsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: hasUser ? { id: 'teacher-domain-1' } : null,
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: userInsert,
      }
    }
    if (table === 'organization_memberships') {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: hasMembership ? [{ organization_id: 'org-1' }] : [],
              error: null,
            }),
          }),
        }),
        upsert: membershipUpsert,
      }
    }
    if (table === 'staff_roles') return { upsert: roleUpsert }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { client: { from }, from, userInsert, membershipUpsert, roleUpsert }
}

describe('ensureSupabaseStaffWorkspace', () => {
  beforeEach(() => mocks.getSupabase.mockReset())

  it('resolves a Teacher through existing authoritative membership without role writes', async () => {
    const fake = existingTeacherClient()
    mocks.getSupabase.mockReturnValue(fake.client)

    await expect(
      ensureSupabaseStaffWorkspace({
        authUserId: 'auth-teacher-1',
        email: 'teacher@example.com',
        displayName: 'Teacher',
        roles: ['teacher'],
      }),
    ).resolves.toEqual({ ok: true, organizationId: 'org-1' })

    expect(fake.membershipUpsert).not.toHaveBeenCalled()
    expect(fake.roleUpsert).not.toHaveBeenCalled()
    expect(fake.from).not.toHaveBeenCalledWith('organizations')
  })

  it('fails closed when a Teacher has no pre-provisioned organization membership', async () => {
    const fake = existingTeacherClient({ hasMembership: false })
    mocks.getSupabase.mockReturnValue(fake.client)

    await expect(
      ensureSupabaseStaffWorkspace({
        authUserId: 'auth-teacher-1',
        email: 'teacher@example.com',
        displayName: 'Teacher',
        roles: ['teacher'],
      }),
    ).resolves.toEqual({ ok: false, error: 'Teacher organization membership is missing' })
    expect(fake.membershipUpsert).not.toHaveBeenCalled()
    expect(fake.roleUpsert).not.toHaveBeenCalled()
  })

  it('does not let a Teacher-only session provision a missing domain account', async () => {
    const fake = existingTeacherClient({ hasUser: false })
    mocks.getSupabase.mockReturnValue(fake.client)

    await expect(
      ensureSupabaseStaffWorkspace({
        authUserId: 'auth-teacher-1',
        email: 'teacher@example.com',
        displayName: 'Teacher',
        roles: ['teacher'],
      }),
    ).resolves.toEqual({ ok: false, error: 'Teacher account must be pre-provisioned by Admin' })
    expect(fake.userInsert).not.toHaveBeenCalled()
  })
})
