/**
 * Active class / enrollment resolution for Teacher & Learner workspaces.
 * Pure helpers — no React.
 */
import { activeEnrollmentsForClass, listTeachers } from './service'
import type { Class, Course, DomainUser, Enrollment, RosterState } from './types'

export type ClassOption = {
  classRow: Class
  course: Course | null
  teacher: DomainUser | null
  seats: number
}

export type LearnerEnrollmentOption = {
  enrollment: Enrollment
  classRow: Class
  course: Course | null
}

/** Prefer active classes first, then name. */
export function sortClasses(classes: Class[]): Class[] {
  return classes.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Classes staff can operate in the Teacher workspace (V1 single-org).
 * Includes all classes with an assigned teacher — multi-class switcher.
 */
export function listTeacherOperableClasses(state: RosterState): Class[] {
  const teacherIds = new Set(listTeachers(state).map((t) => t.id))
  const assigned = state.classes.filter((c) => teacherIds.has(c.teacherUserId))
  const pool = assigned.length > 0 ? assigned : state.classes
  return sortClasses(pool)
}

export function toClassOption(state: RosterState, classRow: Class): ClassOption {
  return {
    classRow,
    course: state.courses.find((c) => c.id === classRow.courseId) ?? null,
    teacher: state.users.find((u) => u.id === classRow.teacherUserId) ?? null,
    seats: activeEnrollmentsForClass(state, classRow.id).length,
  }
}

export function listTeacherClassOptions(state: RosterState): ClassOption[] {
  return listTeacherOperableClasses(state).map((c) => toClassOption(state, c))
}

/**
 * Pick preferred class id from a list. Falls back to first active, then first.
 */
export function resolveActiveClassId(
  classes: Class[],
  preferredId: string | null | undefined,
): string | null {
  if (classes.length === 0) return null
  if (preferredId && classes.some((c) => c.id === preferredId)) return preferredId
  const active = classes.find((c) => c.status === 'active')
  return (active ?? classes[0])!.id
}

export function resolveActiveClass(
  classes: Class[],
  preferredId: string | null | undefined,
): Class | null {
  const id = resolveActiveClassId(classes, preferredId)
  return classes.find((c) => c.id === id) ?? null
}

/** Active enrollments for a learner with class/course context. */
export function listLearnerEnrollmentOptions(
  state: RosterState,
  learnerUserId: string,
): LearnerEnrollmentOption[] {
  return state.enrollments
    .filter((e) => e.learnerUserId === learnerUserId && e.status === 'active')
    .map((enrollment) => {
      const classRow = state.classes.find((c) => c.id === enrollment.classId)
      if (!classRow) return null
      const course = state.courses.find((c) => c.id === classRow.courseId) ?? null
      return { enrollment, classRow, course }
    })
    .filter((x): x is LearnerEnrollmentOption => Boolean(x))
    .sort((a, b) => a.classRow.name.localeCompare(b.classRow.name))
}

export function resolveLearnerClassId(
  options: LearnerEnrollmentOption[],
  preferredClassId: string | null | undefined,
): string | null {
  if (options.length === 0) return null
  if (preferredClassId && options.some((o) => o.classRow.id === preferredClassId)) {
    return preferredClassId
  }
  return options[0]!.classRow.id
}

/** Admin: all classes for progress picker. */
export function listAdminClassOptions(state: RosterState): ClassOption[] {
  return sortClasses(state.classes).map((c) => toClassOption(state, c))
}

/** % of active seats with an invite-ready email. */
export function inviteCoverage(state: RosterState): {
  seats: number
  withEmail: number
  percent: number
} {
  let seats = 0
  let withEmail = 0
  for (const cl of state.classes) {
    if (cl.status !== 'active') continue
    for (const e of activeEnrollmentsForClass(state, cl.id)) {
      seats += 1
      const u = state.users.find((x) => x.id === e.learnerUserId)
      if (u?.email?.trim()) withEmail += 1
    }
  }
  return {
    seats,
    withEmail,
    percent: seats > 0 ? Math.round((withEmail / seats) * 100) : 0,
  }
}
