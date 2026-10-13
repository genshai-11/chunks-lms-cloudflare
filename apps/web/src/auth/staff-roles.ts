export type StaffRole = 'admin' | 'teacher'

export type StaffRoleGrant = {
  role: StaffRole
  active: boolean
}

export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function normalizeStaffRole(role: unknown): StaffRole | null {
  return role === 'admin' || role === 'teacher' ? role : null
}

/**
 * Resolve active database-owned staff roles.
 * Admin may also enter teacher surfaces for ops/observation support.
 */
export function resolveActiveStaffRoles(grants: StaffRoleGrant[]): StaffRole[] {
  const roles = new Set<StaffRole>()
  for (const grant of grants) {
    if (!grant.active) continue
    roles.add(grant.role)
    if (grant.role === 'admin') roles.add('teacher')
  }
  return [...roles]
}

export function canAccessStaffRole(staffRoles: StaffRole[], required: StaffRole): boolean {
  if (required === 'teacher') {
    return staffRoles.includes('teacher') || staffRoles.includes('admin')
  }
  return staffRoles.includes(required)
}
