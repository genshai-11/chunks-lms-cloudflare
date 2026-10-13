import type { RosterState } from '../modules/roster/types'
import { apiClient } from '../api/client'
import { createEmptyRoster, isUuid, newId, LOCAL_ORG_ID } from '../modules/roster/seed'
import type { LearningSession, SchedulingState } from '../modules/scheduling/types'
import { emptySchedulingState } from '../modules/scheduling/session-lifecycle'


export type WorkspaceSnapshot = {
  roster: RosterState
  scheduling: SchedulingState
}

export type SyncResult =
  | { ok: true; source: 'supabase' | 'empty'; newRevision?: number }
  | { ok: false; error: string; conflict?: boolean; serverRevision?: number }

export type VerifySyncResult = { ok: true } | { ok: false; error: string }

export async function deleteWorkspaceLearningDataFromSupabase(
  _organizationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return { ok: true }
}

export type SupabaseStaffWorkspaceIdentity = {
  authUserId: string
  email: string | null
  displayName: string
  roles: Array<'admin' | 'teacher'>
}

export async function ensureSupabaseStaffWorkspace(
  _identity: SupabaseStaffWorkspaceIdentity,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  return { ok: true, organizationId: 'a0000000-0000-4000-8000-000000000001' }
}

/** Ensure all domain IDs are UUIDs so Postgres accepts them. */
export function normalizeIdsForDb(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const idMap = new Map<string, string>()
  const mapId = (id: string) => {
    if (isUuid(id)) return id
    // Legacy non-uuid org keys always map to the stable local org id
    if (id === 'org-local' || id === 'org-local-empty' || id.startsWith('org-')) {
      return LOCAL_ORG_ID
    }
    if (!idMap.has(id)) idMap.set(id, newId())
    return idMap.get(id)!
  }

  const roster: RosterState = {
    organization: {
      ...snapshot.roster.organization,
      id: mapId(snapshot.roster.organization.id),
    },
    users: snapshot.roster.users.map((u) => ({
      ...u,
      id: mapId(u.id),
    })),
    courses: snapshot.roster.courses.map((c) => ({
      ...c,
      id: mapId(c.id),
      organizationId: mapId(c.organizationId),
    })),
    classes: snapshot.roster.classes.map((c) => ({
      ...c,
      id: mapId(c.id),
      courseId: mapId(c.courseId),
      teacherUserId: mapId(c.teacherUserId),
    })),
    enrollments: snapshot.roster.enrollments.map((e) => ({
      ...e,
      id: mapId(e.id),
      classId: mapId(e.classId),
      learnerUserId: mapId(e.learnerUserId),
    })),
  }

  const scheduling: SchedulingState = {
    scheduledSessions: snapshot.scheduling.scheduledSessions.map((s) => ({
      ...s,
      id: mapId(s.id),
      classId: mapId(s.classId),
      rescheduledFromId: s.rescheduledFromId ? mapId(s.rescheduledFromId) : null,
      sessionNumber: s.sessionNumber ?? null,
    })),
    learningSessions: snapshot.scheduling.learningSessions.map((s) => ({
      ...s,
      id: mapId(s.id),
      classId: mapId(s.classId),
      scheduledSessionId: s.scheduledSessionId ? mapId(s.scheduledSessionId) : null,
      sessionNumber: s.sessionNumber ?? null,
      ownerUserId: s.ownerUserId ? mapId(s.ownerUserId) : null,
      lockExpiresAt: s.lockExpiresAt ?? null,
    })),
    attendance: snapshot.scheduling.attendance.map((a) => ({
      ...a,
      id: mapId(a.id),
      learningSessionId: mapId(a.learningSessionId),
      learnerUserId: mapId(a.learnerUserId),
    })),
  }

  return { roster, scheduling }
}

export async function loadWorkspaceFromSupabase(options?: {
  organizationId?: string
}): Promise<
  | { ok: true; data: WorkspaceSnapshot; revision?: number }
  | { ok: false; error: string }
> {
  try {
    const orgId = options?.organizationId || 'a0000000-0000-4000-8000-000000000001'
    const res = await apiClient.getWorkspaceSnapshot(orgId)
    if (res.ok) {
      const { courses, classes, enrollments, users, learningSessions } = res.data
      return {
        ok: true,
        data: {
          roster: {
            organization: { id: orgId, name: 'Chunks Workspace' },
            courses: ((courses as unknown as Array<Record<string, unknown>>) ?? []).map((c) => ({
              id: String(c.id ?? ''),
              organizationId: String(c.organizationId ?? c.organization_id ?? orgId),
              code: String(c.code ?? ''),
              name: String(c.name ?? ''),
              status: (c.status as 'active' | 'archived') ?? 'active',
              startsOn: c.startsOn ? String(c.startsOn) : c.starts_on ? String(c.starts_on) : null,
              endsOn: c.endsOn ? String(c.endsOn) : c.ends_on ? String(c.ends_on) : null,
            })),
            classes: ((classes as unknown as Array<Record<string, unknown>>) ?? []).map((cl) => ({
              id: String(cl.id ?? ''),
              courseId: String(cl.courseId ?? cl.course_id ?? ''),
              name: String(cl.name ?? ''),
              capacity: typeof cl.capacity === 'number' ? cl.capacity : 30,
              teacherUserId: String(cl.teacherUserId ?? cl.teacher_user_id ?? ''),
              status: (cl.status as 'active' | 'ended') === 'ended' ? 'ended' : 'active',
              startsOn: cl.startsOn ? String(cl.startsOn) : cl.starts_on ? String(cl.starts_on) : null,
              endsOn: cl.endsOn ? String(cl.endsOn) : cl.ends_on ? String(cl.ends_on) : null,
              schedule: null,
            })),
            enrollments: ((enrollments as unknown as Array<Record<string, unknown>>) ?? []).map((e) => ({
              id: String(e.id ?? ''),
              classId: String(e.classId ?? e.class_id ?? ''),
              learnerUserId: String(e.learnerUserId ?? e.learner_user_id ?? ''),
              status: (e.status as 'active' | 'ended') ?? 'active',
              startedAt: String(e.startedAt ?? e.started_at ?? e.enrolled_at ?? new Date().toISOString()),
              endedAt: e.endedAt ? String(e.endedAt) : e.ended_at ? String(e.ended_at) : null,
            })),
            users: ((users as unknown as Array<Record<string, unknown>>) ?? []).map((u) => {
              const rawRoles = Array.isArray(u.roles) ? (u.roles as ('admin' | 'teacher' | 'learner')[]) : []
              return {
                id: String(u.id ?? ''),
                displayName: String(u.displayName ?? u.display_name ?? u.email ?? 'User'),
                email: u.email ? String(u.email) : null,
                username: u.username ? String(u.username) : null,
                avatarUrl: u.avatarUrl ? String(u.avatarUrl) : null,
                roles: rawRoles.length > 0 ? rawRoles : ['learner'],
                accountStatus: (u.accountStatus ?? u.account_status) === 'inactive' ? 'inactive' : 'active',
                allowMultiClass: Boolean(u.allowMultiClass ?? u.allow_multi_class),
              }
            }),
          },
          scheduling: {
            learningSessions: (learningSessions as LearningSession[]) ?? [],
            scheduledSessions: [],
            attendance: [],
          },
        },
        revision: res.data.revision,
      }
    }
  } catch {
    // fallback
  }
  return {
    ok: true,
    data: { roster: createEmptyRoster(), scheduling: emptySchedulingState() },
  }
}

export type SaveWorkspaceOptions = {
  allowEmptyWipe?: boolean
  pruneMissing?: boolean
  expectedRevision?: number
  canProvision?: boolean
}

export async function saveWorkspaceToSupabase(
  raw: WorkspaceSnapshot,
  options: SaveWorkspaceOptions = {},
): Promise<SyncResult> {
  const { roster, scheduling } = normalizeIdsForDb(raw)
  const orgId = roster.organization.id || 'a0000000-0000-4000-8000-000000000001'
  const res = await apiClient.syncWorkspaceAtomic({
    organizationId: orgId,
    expectedRevision: options.expectedRevision,
    roster,
    scheduling,
  })
  if (res.ok) {
    return { ok: true, source: 'supabase', newRevision: res.data.newRevision }
  }
  return { ok: false, error: res.error || 'Lỗi đồng bộ Cloudflare D1' }
}

export async function verifyWorkspacePersistence(
  snapshot: WorkspaceSnapshot,
  options?: { teacherUserId?: string | null },
): Promise<VerifySyncResult> {
  const expected = normalizeIdsForDb(snapshot)
  const loaded = await loadWorkspaceFromSupabase({
    organizationId: expected.roster.organization.id,
  })
  if (!loaded.ok) return { ok: false, error: `reload failed: ${loaded.error}` }
  let expectedUsers = expected.roster.users
  let expectedCourses = expected.roster.courses
  let expectedClasses = expected.roster.classes
  let expectedEnrollments = expected.roster.enrollments
  let expectedScheduled = expected.scheduling.scheduledSessions
  let expectedLearning = expected.scheduling.learningSessions
  let expectedAttendance = expected.scheduling.attendance

  if (options?.teacherUserId) {
    const teacherId = options.teacherUserId
    expectedClasses = expectedClasses.filter((c) => c.teacherUserId === teacherId)
    const classIdSet = new Set(expectedClasses.map((c) => c.id))
    expectedCourses = expectedCourses.filter((c) =>
      expectedClasses.some((cl) => cl.courseId === c.id),
    )
    expectedEnrollments = expectedEnrollments.filter((e) => classIdSet.has(e.classId))
    const learnerIdSet = new Set(expectedEnrollments.map((e) => e.learnerUserId))
    expectedUsers = expectedUsers.filter((u) => u.id === teacherId || learnerIdSet.has(u.id))
    expectedScheduled = expectedScheduled.filter((s) => classIdSet.has(s.classId))
    expectedLearning = expectedLearning.filter((s) => classIdSet.has(s.classId))
    const learningIdSet = new Set(expectedLearning.map((s) => s.id))
    expectedAttendance = expectedAttendance.filter((a) => learningIdSet.has(a.learningSessionId))
  }


  const missing = [
    ...missingIds('users', expectedUsers.map((u) => u.id), loaded.data.roster.users.map((u) => u.id)),
    ...missingIds('courses', expectedCourses.map((c) => c.id), loaded.data.roster.courses.map((c) => c.id)),
    ...missingIds('classes', expectedClasses.map((c) => c.id), loaded.data.roster.classes.map((c) => c.id)),
    ...missingIds('enrollments', expectedEnrollments.map((e) => e.id), loaded.data.roster.enrollments.map((e) => e.id)),
    ...missingIds('scheduled', expectedScheduled.map((s) => s.id), loaded.data.scheduling.scheduledSessions.map((s) => s.id)),
    ...missingIds('learning', expectedLearning.map((s) => s.id), loaded.data.scheduling.learningSessions.map((s) => s.id)),
    ...missingIds('attendance', expectedAttendance.map((a) => a.id), loaded.data.scheduling.attendance.map((a) => a.id)),
  ]

  if (missing.length > 0) {
    return { ok: false, error: `missing after reload: ${missing.slice(0, 8).join(', ')}` }
  }
  return { ok: true }
}

function missingIds(label: string, expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual)
  return expected.filter((id) => !actualSet.has(id)).map((id) => `${label}:${id}`)
}

export function isSupabaseConfigured(): boolean {
  return true
}
