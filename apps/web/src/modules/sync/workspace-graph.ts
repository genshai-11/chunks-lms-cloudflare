import type { DomainUser, RosterState } from '../roster/types'

export function userIdsForWorkspace(roster: Pick<RosterState, 'classes' | 'enrollments'>, memberUserIds: Iterable<string>): Set<string> {
  const ids = new Set(memberUserIds)
  const classIds = new Set(roster.classes.map((klass) => klass.id))
  for (const klass of roster.classes) {
    ids.add(klass.teacherUserId)
  }
  for (const enrollment of roster.enrollments) {
    if (classIds.has(enrollment.classId)) ids.add(enrollment.learnerUserId)
  }
  return ids
}

export function rolesForWorkspaceUser(input: {
  userId: string
  membershipRoles?: DomainUser['roles']
  teacherUserIds: Set<string>
  learnerUserIds: Set<string>
}): DomainUser['roles'] {
  const roles = new Set<DomainUser['roles'][number]>(input.membershipRoles ?? [])
  if (input.teacherUserIds.has(input.userId)) roles.add('teacher')
  if (input.learnerUserIds.has(input.userId)) roles.add('learner')
  if (roles.size === 0) roles.add('learner')
  return Array.from(roles)
}
