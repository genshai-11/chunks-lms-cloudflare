import { materializeCourseSchedule } from '../scheduling/recurrence'
import { canEnroll, DEFAULT_CLASS_CAPACITY } from './capacity'
import { normalizeCourseSchedule } from './schedule'
import { newId } from './seed'
import type {
  Class,
  Course,
  CourseSchedule,
  DomainUser,
  Enrollment,
  RosterResult,
  RosterState,
} from './types'

export { defaultCourseSchedule } from './schedule'
export { formatScheduleLabel, formatWeekdaysLabel, normalizeCourseSchedule } from './schedule'

export function listTeachers(state: RosterState): DomainUser[] {
  return dedupeUsersByEmail(state.users.filter((u) => u.roles.includes('teacher')))
}

export function listLearners(state: RosterState): DomainUser[] {
  return dedupeUsersByEmail(state.users.filter((u) => u.roles.includes('learner')))
}

/** Raw teachers without email dedupe (admin cleanup / diagnostics). */
export function listTeachersRaw(state: RosterState): DomainUser[] {
  return state.users.filter((u) => u.roles.includes('teacher'))
}

/** Raw learners without email dedupe. */
export function listLearnersRaw(state: RosterState): DomainUser[] {
  return state.users.filter((u) => u.roles.includes('learner'))
}

export function findLearnerByEmail(state: RosterState, email: string): DomainUser | null {
  const needle = email.trim().toLowerCase()
  if (!needle) return null
  return (
    state.users.find(
      (u) => u.roles.includes('learner') && (u.email ?? '').toLowerCase() === needle,
    ) ?? null
  )
}

export function activeEnrollmentsForClass(state: RosterState, classId: string): Enrollment[] {
  return state.enrollments.filter((e) => e.classId === classId && e.status === 'active')
}

function resolveClassDates(input: {
  startsOn?: string | null
  endsOn?: string | null
  schedule?: CourseSchedule | null
}): { startsOn: string | null; endsOn: string | null; schedule: CourseSchedule | null } {
  const schedule = normalizeCourseSchedule(input.schedule ?? null)
  const startsOn = input.startsOn ?? null

  if (schedule && startsOn && schedule.slots.length > 0 && schedule.sessionCount > 0) {
    const plan = materializeCourseSchedule(startsOn, schedule)
    return {
      startsOn,
      endsOn: plan.endsOn ?? input.endsOn ?? null,
      schedule,
    }
  }

  return {
    startsOn,
    endsOn: input.endsOn ?? null,
    schedule,
  }
}

export function createCourse(
  state: RosterState,
  input: {
    code: string
    name: string
  },
): RosterResult<Course> {
  const code = input.code.trim()
  const name = input.name.trim()
  if (!code || !name) return { ok: false, error: 'Course code and name are required' }
  if (state.courses.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
    return { ok: false, error: `Course code ${code} already exists` }
  }

  const course: Course = {
    id: newId('course'),
    organizationId: state.organization.id,
    code,
    name,
    status: 'active',
  }

  return {
    ok: true,
    value: course,
    state: { ...state, courses: [...state.courses, course] },
  }
}

export function updateCourse(
  state: RosterState,
  courseId: string,
  input: {
    code?: string
    name?: string
    status?: Course['status']
  },
): RosterResult<Course> {
  const course = state.courses.find((c) => c.id === courseId)
  if (!course) return { ok: false, error: 'Course not found' }

  const code = input.code !== undefined ? input.code.trim() : course.code
  const name = input.name !== undefined ? input.name.trim() : course.name
  if (!code || !name) return { ok: false, error: 'Course code and name are required' }

  if (state.courses.some((c) => c.id !== courseId && c.code.toLowerCase() === code.toLowerCase())) {
    return { ok: false, error: `Course code ${code} already exists` }
  }

  const updated: Course = {
    ...course,
    code,
    name,
    status: input.status ?? course.status,
  }

  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      courses: state.courses.map((c) => (c.id === courseId ? updated : c)),
    },
  }
}

/** Preview auto end date + occurrence list for a class schedule. */
export function previewClassSchedule(c: Pick<Class, 'startsOn' | 'schedule'>) {
  if (!c.startsOn || !c.schedule) {
    return { endsOn: null, occurrences: [], sessionCount: 0 }
  }
  const schedule = normalizeCourseSchedule(c.schedule)
  if (!schedule) return { endsOn: null, occurrences: [], sessionCount: 0 }
  return materializeCourseSchedule(c.startsOn, schedule)
}

/** Normalize emails for uniqueness checks (case-insensitive). */
export function normalizeLearnerEmail(email: string | null | undefined): string | null {
  const t = email?.trim().toLowerCase() ?? ''
  return t || null
}

export const normalizeEmail = normalizeLearnerEmail

/** True if any other user already owns this email (any role). */
export function isEmailTaken(
  state: RosterState,
  email: string | null | undefined,
  exceptUserId?: string,
): boolean {
  const needle = normalizeEmail(email)
  if (!needle) return false
  return state.users.some((u) => u.id !== exceptUserId && normalizeEmail(u.email) === needle)
}

/** True if another learner already owns this email. */
export function isLearnerEmailTaken(
  state: RosterState,
  email: string | null | undefined,
  exceptUserId?: string,
): boolean {
  const needle = normalizeLearnerEmail(email)
  if (!needle) return false
  return state.users.some(
    (u) =>
      u.roles.includes('learner') &&
      u.id !== exceptUserId &&
      normalizeLearnerEmail(u.email) === needle,
  )
}

/** One row per email (or per id when email missing). Prefer active + multi-role. */
export function dedupeUsersByEmail(users: DomainUser[]): DomainUser[] {
  const byKey = new Map<string, DomainUser>()
  for (const u of users) {
    const key = normalizeEmail(u.email) ?? `id:${u.id}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, u)
      continue
    }
    byKey.set(key, pickPreferredUser(prev, u))
  }
  return [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  )
}

function pickPreferredUser(a: DomainUser, b: DomainUser): DomainUser {
  const score = (u: DomainUser) =>
    (u.accountStatus === 'active' ? 4 : 0) +
    u.roles.length +
    (u.avatarUrl ? 1 : 0) +
    (u.displayName.trim().length > 0 ? 1 : 0)
  return score(b) > score(a) ? b : a
}

/**
 * Collapse duplicate accounts that share the same email.
 * Reassigns class teacher + enrollments to the keeper, merges roles, drops extras.
 */
export function mergeDuplicateAccountsByEmail(
  state: RosterState,
): RosterResult<{ removed: number; groups: number }> {
  const groups = new Map<string, DomainUser[]>()
  for (const u of state.users) {
    const key = normalizeEmail(u.email)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(u)
    groups.set(key, list)
  }

  let users = [...state.users]
  let classes = [...state.classes]
  let enrollments = [...state.enrollments]
  let removed = 0
  let multiGroups = 0

  for (const [, group] of groups) {
    if (group.length < 2) continue
    multiGroups += 1
    const keeper = group.reduce(pickPreferredUser)
    const dropIds = new Set(group.filter((u) => u.id !== keeper.id).map((u) => u.id))

    // Merge roles + status onto keeper
    const mergedRoles = [...new Set(group.flatMap((u) => u.roles))] as DomainUser['roles']
    const anyActive = group.some((u) => (u.accountStatus ?? 'active') === 'active')
    const avatarUrl = group.find((u) => u.avatarUrl)?.avatarUrl ?? keeper.avatarUrl
    const displayName = group.find((u) => u.displayName.trim())?.displayName ?? keeper.displayName

    users = users.map((u) =>
      u.id === keeper.id
        ? {
            ...u,
            displayName,
            avatarUrl,
            roles: mergedRoles,
            accountStatus: anyActive ? 'active' : 'inactive',
          }
        : u,
    )

    classes = classes.map((c) =>
      dropIds.has(c.teacherUserId) ? { ...c, teacherUserId: keeper.id } : c,
    )

    // Move enrollments; collapse double-seat in same class
    const nextEnrollments: typeof enrollments = []
    const seatKey = new Set<string>()
    for (const e of enrollments) {
      const learnerId = dropIds.has(e.learnerUserId) ? keeper.id : e.learnerUserId
      const key = `${e.classId}:${learnerId}`
      if (seatKey.has(key)) {
        // Keep active if either was active
        const existing = nextEnrollments.find(
          (x) => x.classId === e.classId && x.learnerUserId === learnerId,
        )
        if (existing && existing.status === 'ended' && e.status === 'active') {
          existing.status = 'active'
          existing.endedAt = null
        }
        continue
      }
      seatKey.add(key)
      nextEnrollments.push(learnerId === e.learnerUserId ? e : { ...e, learnerUserId: learnerId })
    }
    enrollments = nextEnrollments

    users = users.filter((u) => !dropIds.has(u.id))
    removed += dropIds.size
  }

  if (removed === 0) {
    return { ok: true, value: { removed: 0, groups: 0 }, state }
  }

  return {
    ok: true,
    value: { removed, groups: multiGroups },
    state: { ...state, users, classes, enrollments },
  }
}

/** Count duplicate email groups (2+ users sharing one email). */
export function countDuplicateEmailGroups(state: RosterState): number {
  const counts = new Map<string, number>()
  for (const u of state.users) {
    const key = normalizeEmail(u.email)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let n = 0
  for (const c of counts.values()) if (c > 1) n += 1
  return n
}

export function archiveCourse(state: RosterState, courseId: string): RosterResult<Course> {
  return updateCourse(state, courseId, { status: 'archived' })
}

export function restoreCourse(state: RosterState, courseId: string): RosterResult<Course> {
  return updateCourse(state, courseId, { status: 'active' })
}

/** Hard delete only when no classes reference the course. */
export function deleteCourse(state: RosterState, courseId: string): RosterResult<{ id: string }> {
  const course = state.courses.find((c) => c.id === courseId)
  if (!course) return { ok: false, error: 'Course not found' }
  if (state.classes.some((c) => c.courseId === courseId)) {
    return {
      ok: false,
      error: 'Cannot delete course with classes; archive it or remove classes first',
    }
  }
  return {
    ok: true,
    value: { id: courseId },
    state: { ...state, courses: state.courses.filter((c) => c.id !== courseId) },
  }
}

export function createClass(
  state: RosterState,
  input: {
    courseId: string
    name: string
    teacherUserId: string
    capacity?: number
    startsOn?: string | null
    endsOn?: string | null
    schedule?: CourseSchedule | null
  },
): RosterResult<Class> {
  const course = state.courses.find((c) => c.id === input.courseId && c.status === 'active')
  if (!course) return { ok: false, error: 'Active course not found' }

  const teacher = state.users.find(
    (u) => u.id === input.teacherUserId && u.roles.includes('teacher'),
  )
  if (!teacher) return { ok: false, error: 'Teacher not found' }

  const capacity = input.capacity ?? DEFAULT_CLASS_CAPACITY
  if (capacity < 1) return { ok: false, error: 'Capacity must be a positive integer' }

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Class name is required' }

  const normalizedSchedule = normalizeCourseSchedule(input.schedule ?? null)
  if (input.schedule && (!normalizedSchedule || normalizedSchedule.slots.length === 0)) {
    return { ok: false, error: 'Add at least one day and time for auto-schedule' }
  }
  if (normalizedSchedule && normalizedSchedule.sessionCount < 1) {
    return { ok: false, error: 'Session count must be at least 1' }
  }

  const dates = resolveClassDates({
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    schedule: normalizedSchedule,
  })

  // V1: one teacher stored as teacherUserId — reassignment replaces, never dual active teachers.
  const klass: Class = {
    id: newId('class'),
    courseId: course.id,
    name,
    capacity,
    teacherUserId: teacher.id,
    status: 'active',
    startsOn: dates.startsOn,
    endsOn: dates.endsOn,
    schedule: dates.schedule,
  }

  return {
    ok: true,
    value: klass,
    state: { ...state, classes: [...state.classes, klass] },
  }
}

export function updateClass(
  state: RosterState,
  classId: string,
  input: {
    courseId?: string
    name?: string
    teacherUserId?: string
    capacity?: number
    status?: Class['status']
    startsOn?: string | null
    endsOn?: string | null
    schedule?: CourseSchedule | null
  },
): RosterResult<Class> {
  const klass = state.classes.find((c) => c.id === classId)
  if (!klass) return { ok: false, error: 'Class not found' }

  const courseId = input.courseId ?? klass.courseId
  const course = state.courses.find((c) => c.id === courseId)
  if (!course) return { ok: false, error: 'Course not found' }
  if (course.status !== 'active' && courseId !== klass.courseId) {
    return { ok: false, error: 'Cannot move class to an archived course' }
  }

  const teacherUserId = input.teacherUserId ?? klass.teacherUserId
  const teacher = state.users.find((u) => u.id === teacherUserId && u.roles.includes('teacher'))
  if (!teacher) return { ok: false, error: 'Teacher not found' }

  const capacity = input.capacity ?? klass.capacity
  if (capacity < 1) return { ok: false, error: 'Capacity must be a positive integer' }

  const activeCount = activeEnrollmentsForClass(state, classId).length
  if (capacity < activeCount) {
    return {
      ok: false,
      error: `Capacity ${capacity} is below active enrollments (${activeCount})`,
    }
  }

  const name = input.name !== undefined ? input.name.trim() : klass.name
  if (!name) return { ok: false, error: 'Class name is required' }

  const nextSchedule =
    input.schedule !== undefined
      ? normalizeCourseSchedule(input.schedule)
      : normalizeCourseSchedule(klass.schedule)
  if (
    input.schedule !== undefined &&
    input.schedule &&
    (!nextSchedule || nextSchedule.slots.length === 0)
  ) {
    return { ok: false, error: 'Add at least one day and time for auto-schedule' }
  }

  const dates = resolveClassDates({
    startsOn: input.startsOn !== undefined ? input.startsOn : klass.startsOn,
    endsOn: input.endsOn !== undefined ? input.endsOn : klass.endsOn,
    schedule: nextSchedule,
  })

  const updated: Class = {
    ...klass,
    courseId,
    name,
    capacity,
    teacherUserId,
    status: input.status ?? klass.status,
    startsOn: dates.startsOn,
    endsOn: dates.endsOn,
    schedule: dates.schedule,
  }

  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      classes: state.classes.map((c) => (c.id === classId ? updated : c)),
    },
  }
}

export function endClass(state: RosterState, classId: string): RosterResult<Class> {
  const klass = state.classes.find((c) => c.id === classId)
  if (!klass) return { ok: false, error: 'Class not found' }
  if (klass.status === 'ended') return { ok: true, value: klass, state }

  let next = state
  for (const e of activeEnrollmentsForClass(state, classId)) {
    const ended = endEnrollment(next, e.id)
    if (!ended.ok) return ended
    next = ended.state
  }

  return updateClass(next, classId, { status: 'ended' })
}

export function restoreClass(state: RosterState, classId: string): RosterResult<Class> {
  return updateClass(state, classId, { status: 'active' })
}

/** Hard delete only when no enrollments exist for the class. */
export function deleteClass(state: RosterState, classId: string): RosterResult<{ id: string }> {
  const klass = state.classes.find((c) => c.id === classId)
  if (!klass) return { ok: false, error: 'Class not found' }
  if (state.enrollments.some((e) => e.classId === classId)) {
    return {
      ok: false,
      error: 'Cannot delete class with enrollment history; end the class instead',
    }
  }
  return {
    ok: true,
    value: { id: classId },
    state: { ...state, classes: state.classes.filter((c) => c.id !== classId) },
  }
}

/**
 * Reject assigning a second concurrent teacher identity.
 * V1 model is single teacher_user_id; this guards explicit dual-teacher attempts.
 */
export function assignTeacher(
  state: RosterState,
  classId: string,
  teacherUserId: string,
  options?: { forceReplace?: boolean },
): RosterResult<Class> {
  const klass = state.classes.find((c) => c.id === classId)
  if (!klass || klass.status !== 'active') return { ok: false, error: 'Active class not found' }

  const teacher = state.users.find((u) => u.id === teacherUserId && u.roles.includes('teacher'))
  if (!teacher) return { ok: false, error: 'Teacher not found' }

  if (klass.teacherUserId === teacherUserId) {
    return { ok: true, value: klass, state }
  }

  if (!options?.forceReplace && klass.teacherUserId) {
    return {
      ok: false,
      error: 'Class already has an active Teacher; refuse dual assignment without replace',
    }
  }

  const updated: Class = { ...klass, teacherUserId }
  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      classes: state.classes.map((c) => (c.id === classId ? updated : c)),
    },
  }
}

export function enrollLearner(
  state: RosterState,
  classId: string,
  learnerUserId: string,
  at = new Date().toISOString(),
): RosterResult<Enrollment> {
  const klass = state.classes.find((c) => c.id === classId && c.status === 'active')
  if (!klass) return { ok: false, error: 'Active class not found' }

  const learner = state.users.find((u) => u.id === learnerUserId && u.roles.includes('learner'))
  if (!learner) return { ok: false, error: 'Learner not found' }

  const existing = state.enrollments.find(
    (e) => e.classId === classId && e.learnerUserId === learnerUserId,
  )
  if (existing?.status === 'active') {
    return { ok: false, error: 'Learner is already enrolled' }
  }

  const otherActive = state.enrollments.filter(
    (e) => e.learnerUserId === learnerUserId && e.classId !== classId && e.status === 'active',
  )
  if (otherActive.length > 0 && !learner.allowMultiClass) {
    return {
      ok: false,
      error:
        'Learner is already enrolled in another active class. Enable multi-class in Admin settings if needed.',
    }
  }

  const activeCount = activeEnrollmentsForClass(state, classId).length
  const capacityCheck = canEnroll(activeCount, klass.capacity)
  if (!capacityCheck.ok) return { ok: false, error: capacityCheck.error }

  if (existing) {
    // Re-activate ended enrollment
    const reactivated: Enrollment = {
      ...existing,
      status: 'active',
      startedAt: at,
      endedAt: null,
    }
    return {
      ok: true,
      value: reactivated,
      state: {
        ...state,
        enrollments: state.enrollments.map((e) => (e.id === existing.id ? reactivated : e)),
      },
    }
  }

  const enrollment: Enrollment = {
    id: newId('enr'),
    classId,
    learnerUserId,
    status: 'active',
    startedAt: at,
    endedAt: null,
  }

  return {
    ok: true,
    value: enrollment,
    state: { ...state, enrollments: [...state.enrollments, enrollment] },
  }
}

export function endEnrollment(
  state: RosterState,
  enrollmentId: string,
  at = new Date().toISOString(),
): RosterResult<Enrollment> {
  const enrollment = state.enrollments.find((e) => e.id === enrollmentId)
  if (!enrollment) return { ok: false, error: 'Enrollment not found' }
  if (enrollment.status === 'ended') {
    return { ok: true, value: enrollment, state }
  }

  const ended: Enrollment = {
    ...enrollment,
    status: 'ended',
    endedAt: at,
  }

  // History preserved: row remains; learner profile untouched.
  return {
    ok: true,
    value: ended,
    state: {
      ...state,
      enrollments: state.enrollments.map((e) => (e.id === enrollmentId ? ended : e)),
    },
  }
}

export function addLearnerProfile(
  state: RosterState,
  input: {
    displayName: string
    email?: string | null
    avatarUrl?: string | null
    allowMultiClass?: boolean
  },
): RosterResult<DomainUser> {
  const displayName = input.displayName.trim()
  if (!displayName) return { ok: false, error: 'Learner name is required' }

  const email = input.email?.trim() || null
  if (email && isEmailTaken(state, email)) {
    return { ok: false, error: 'An account with this email already exists' }
  }

  const user: DomainUser = {
    id: newId('user'),
    displayName,
    email,
    avatarUrl: input.avatarUrl ?? null,
    roles: ['learner'],
    accountStatus: 'active',
    allowMultiClass: input.allowMultiClass ?? false,
  }

  return {
    ok: true,
    value: user,
    state: { ...state, users: [...state.users, user] },
  }
}

/**
 * Create a learner profile and seat them in a class in one step
 * (teacher/admin workflow from class roster — no separate enrollments hop).
 */
export function createLearnerAndEnroll(
  state: RosterState,
  classId: string,
  input: { displayName: string; email?: string | null; avatarUrl?: string | null },
  at = new Date().toISOString(),
): RosterResult<{ learner: DomainUser; enrollment: Enrollment }> {
  const email = normalizeLearnerEmail(input.email)
  const existing = email ? findLearnerByEmail(state, email) : null

  if (existing) {
    const enrolled = enrollLearner(state, classId, existing.id, at)
    if (!enrolled.ok) return enrolled
    return {
      ok: true,
      value: { learner: existing, enrollment: enrolled.value },
      state: enrolled.state,
    }
  }

  const created = addLearnerProfile(state, input)
  if (!created.ok) return created

  const enrolled = enrollLearner(created.state, classId, created.value.id, at)
  if (!enrolled.ok) return enrolled

  return {
    ok: true,
    value: { learner: created.value, enrollment: enrolled.value },
    state: enrolled.state,
  }
}

/** Learners not currently active in this class (available to enroll). */
export function learnersAvailableForClass(state: RosterState, classId: string): DomainUser[] {
  const activeIds = new Set(activeEnrollmentsForClass(state, classId).map((e) => e.learnerUserId))
  return listActiveLearners(state).filter((u) => !activeIds.has(u.id))
}

export function addTeacherProfile(
  state: RosterState,
  input: { displayName: string; email?: string | null; avatarUrl?: string | null },
): RosterResult<DomainUser> {
  const displayName = input.displayName.trim()
  if (!displayName) return { ok: false, error: 'Teacher name is required' }

  const email = input.email?.trim() || null
  if (!email) return { ok: false, error: 'Teacher email is required (matches Supabase sign-in)' }
  if (isEmailTaken(state, email)) {
    return { ok: false, error: 'An account with this email already exists' }
  }

  const user: DomainUser = {
    id: newId('user'),
    displayName,
    email,
    avatarUrl: input.avatarUrl ?? null,
    roles: ['teacher'],
    accountStatus: 'active',
  }

  return {
    ok: true,
    value: user,
    state: { ...state, users: [...state.users, user] },
  }
}

export function updateUserProfile(
  state: RosterState,
  userId: string,
  input: {
    displayName?: string
    email?: string | null
    avatarUrl?: string | null
    accountStatus?: DomainUser['accountStatus']
    allowMultiClass?: boolean
  },
): RosterResult<DomainUser> {
  const user = state.users.find((u) => u.id === userId)
  if (!user) return { ok: false, error: 'User not found' }

  const displayName = input.displayName !== undefined ? input.displayName.trim() : user.displayName
  if (!displayName) return { ok: false, error: 'Name is required' }

  const nextEmail = input.email !== undefined ? input.email?.trim() || null : user.email
  if (!nextEmail && user.roles.includes('teacher')) {
    return { ok: false, error: 'Email is required for teacher accounts' }
  }
  if (nextEmail && isEmailTaken(state, nextEmail, userId)) {
    return { ok: false, error: 'An account with this email already exists' }
  }

  const updated: DomainUser = {
    ...user,
    displayName,
    email: nextEmail,
    avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl || null : user.avatarUrl,
    accountStatus: input.accountStatus ?? user.accountStatus ?? 'active',
    allowMultiClass:
      input.allowMultiClass !== undefined ? input.allowMultiClass : (user.allowMultiClass ?? false),
  }

  return {
    ok: true,
    value: updated,
    state: {
      ...state,
      users: state.users.map((u) => (u.id === userId ? updated : u)),
    },
  }
}

export function setAccountStatus(
  state: RosterState,
  userId: string,
  accountStatus: DomainUser['accountStatus'],
): RosterResult<DomainUser> {
  return updateUserProfile(state, userId, { accountStatus })
}

/** Active teachers only (for assignment pickers). */
export function listActiveTeachers(state: RosterState): DomainUser[] {
  return listTeachers(state).filter((u) => (u.accountStatus ?? 'active') === 'active')
}

/** Active learners only (for seating / session pick). */
export function listActiveLearners(state: RosterState): DomainUser[] {
  return listLearners(state).filter((u) => (u.accountStatus ?? 'active') === 'active')
}

/**
 * Remove a person only when they are not teaching an active class
 * and have no enrollment history (active or ended).
 */
export function deleteUserProfile(
  state: RosterState,
  userId: string,
): RosterResult<{ id: string }> {
  const user = state.users.find((u) => u.id === userId)
  if (!user) return { ok: false, error: 'User not found' }

  if (state.classes.some((c) => c.teacherUserId === userId && c.status === 'active')) {
    return { ok: false, error: 'Cannot delete teacher assigned to an active class' }
  }
  if (user.roles.includes('learner')) {
    return {
      ok: true,
      value: { id: userId },
      state: {
        ...state,
        users: state.users.filter((u) => u.id !== userId),
        enrollments: state.enrollments.filter((e) => e.learnerUserId !== userId),
      },
    }
  }
  // Soft block: still teaching ended classes is ok to delete only if we reassign — keep simple:
  if (state.classes.some((c) => c.teacherUserId === userId)) {
    return {
      ok: false,
      error: 'Cannot delete teacher still linked to a class; reassign first',
    }
  }

  return {
    ok: true,
    value: { id: userId },
    state: { ...state, users: state.users.filter((u) => u.id !== userId) },
  }
}

export function deleteEnrollment(
  state: RosterState,
  enrollmentId: string,
): RosterResult<{ id: string }> {
  const enrollment = state.enrollments.find((e) => e.id === enrollmentId)
  if (!enrollment) return { ok: false, error: 'Enrollment not found' }
  if (enrollment.status === 'active') {
    return { ok: false, error: 'End the enrollment before deleting history' }
  }
  return {
    ok: true,
    value: { id: enrollmentId },
    state: {
      ...state,
      enrollments: state.enrollments.filter((e) => e.id !== enrollmentId),
    },
  }
}
