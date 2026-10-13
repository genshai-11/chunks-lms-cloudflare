import type { StaffRole } from './staff-roles'

export type StaffRoute = {
  role: StaffRole
  path: string
  label: string
}

export const STAFF_ROUTES: StaffRoute[] = [
  { role: 'admin', path: '/admin', label: 'Admin' },
  { role: 'teacher', path: '/teacher', label: 'Teacher' },
]

export function canAccessRole(
  userRoles: Array<'admin' | 'teacher' | 'learner'>,
  required: 'admin' | 'teacher' | 'learner',
): boolean {
  if (required === 'teacher') {
    return userRoles.includes('teacher') || userRoles.includes('admin')
  }
  return userRoles.includes(required)
}
