/**
 * Application-level mirror of deny-by-default RLS rules.
 * Live Postgres RLS remains authoritative; these predicates are unit-tested
 * to prove cross-organization and cross-learner isolation intent.
 */

export type PolicyActor = {
  userId: string
  organizationIds: string[]
  rolesByOrg: Record<string, Array<'admin' | 'teacher' | 'learner'>>
}

export type OrgScoped = { organizationId: string }
export type ClassScoped = {
  organizationId: string
  teacherUserId: string
  learnerUserIds: string[]
}
export type LearnerOwned = {
  organizationId: string
  learnerUserId: string
  teacherUserId: string
}

export function isOrgMember(actor: PolicyActor, organizationId: string): boolean {
  return actor.organizationIds.includes(organizationId)
}

export function hasOrgRole(
  actor: PolicyActor,
  organizationId: string,
  role: 'admin' | 'teacher' | 'learner',
): boolean {
  return actor.rolesByOrg[organizationId]?.includes(role) ?? false
}

/** Organizations: select only if member */
export function canReadOrganization(actor: PolicyActor, row: OrgScoped): boolean {
  return isOrgMember(actor, row.organizationId)
}

/** Courses: org members only */
export function canReadCourse(actor: PolicyActor, row: OrgScoped): boolean {
  return isOrgMember(actor, row.organizationId)
}

export function canManageCourse(actor: PolicyActor, row: OrgScoped): boolean {
  return hasOrgRole(actor, row.organizationId, 'admin')
}

/**
 * Enrollments: learner self, assigned teacher, or org admin.
 */
export function canReadEnrollment(actor: PolicyActor, row: LearnerOwned): boolean {
  if (!isOrgMember(actor, row.organizationId)) return false
  if (actor.userId === row.learnerUserId) return true
  if (actor.userId === row.teacherUserId) return true
  return hasOrgRole(actor, row.organizationId, 'admin')
}

/**
 * Assessment / report data: never another learner's rows;
 * teacher of class or admin may read.
 */
export function canReadLearnerAssessment(actor: PolicyActor, row: LearnerOwned): boolean {
  if (!isOrgMember(actor, row.organizationId)) return false
  if (actor.userId === row.learnerUserId) return true
  if (actor.userId === row.teacherUserId) return true
  return hasOrgRole(actor, row.organizationId, 'admin')
}

export function canCaptureAssessment(actor: PolicyActor, row: ClassScoped): boolean {
  if (!isOrgMember(actor, row.organizationId)) return false
  if (actor.userId === row.teacherUserId) return true
  return hasOrgRole(actor, row.organizationId, 'admin')
}

export function filterVisible<T>(
  rows: T[],
  actor: PolicyActor,
  canRead: (actor: PolicyActor, row: T) => boolean,
): T[] {
  return rows.filter((row) => canRead(actor, row))
}
