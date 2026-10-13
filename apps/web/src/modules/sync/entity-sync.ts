/**
 * Phase D — multi-user safe workspace merge & prune rules.
 * Prefer upsert-only; never clobber open sessions or assessment-backed rows.
 */
import type { LearningSession, SchedulingState } from '../scheduling/types'
import type { RosterState } from '../roster/types'

export type WorkspaceParts = {
  roster: RosterState
  scheduling: SchedulingState
}

/** IDs of learning sessions that must never be deleted by a client sync. */
export function protectedLearningSessionIds(
  scheduling: SchedulingState,
  remoteOpenIds: string[] = [],
): Set<string> {
  const ids = new Set<string>(remoteOpenIds)
  for (const ls of scheduling.learningSessions) {
    if (ls.status === 'open') ids.add(ls.id)
    if (ls.ownerUserId) ids.add(ls.id)
  }
  return ids
}

/**
 * Compute IDs safe to delete from cloud when pruning.
 * Never includes open sessions or protected ids.
 */
export function prunableIds(
  localIds: string[],
  remoteIds: string[],
  protectedIds: Set<string>,
): string[] {
  const keep = new Set(localIds)
  return remoteIds.filter((id) => !keep.has(id) && !protectedIds.has(id))
}

/** Last write wins by id before bulk upsert; duplicate IDs in one PostgREST payload can 409. */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values())
}

/**
 * Merge remote scheduling into local so another browser's open session is not lost.
 * Remote open sessions win for the same class if local lacks them.
 * Local sessions are kept when IDs match; completed is terminal and cannot be reopened by stale remote data.
 */
export function mergeScheduling(local: SchedulingState, remote: SchedulingState): SchedulingState {
  const schedById = new Map(local.scheduledSessions.map((s) => [s.id, s]))
  for (const s of remote.scheduledSessions) {
    if (!schedById.has(s.id)) schedById.set(s.id, s)
  }

  const lsById = new Map(local.learningSessions.map((s) => [s.id, s]))
  for (const s of remote.learningSessions) {
    const existing = lsById.get(s.id)
    if (!existing) {
      lsById.set(s.id, s)
      continue
    }
    // Completion is terminal. A stale remote open snapshot must never make Finish resumable again.
    if (s.status === 'open' && existing.status === 'open') {
      // Prefer fresher lock / owner from remote if local has no owner
      if (!existing.ownerUserId && s.ownerUserId) lsById.set(s.id, { ...existing, ...s })
    }
  }

  // Remote open session for a class: ensure present if local has none open for that class
  for (const s of remote.learningSessions) {
    if (s.status !== 'open' || lsById.has(s.id)) continue
    const localOpen = [...lsById.values()].find(
      (x) => x.classId === s.classId && x.status === 'open',
    )
    if (!localOpen) lsById.set(s.id, s)
  }

  const attById = new Map(local.attendance.map((a) => [a.id, a]))
  for (const a of remote.attendance) {
    if (!attById.has(a.id)) attById.set(a.id, a)
  }
  // Also key by session+learner to avoid dupes
  const attKey = new Map<string, (typeof local.attendance)[0]>()
  for (const a of attById.values()) {
    attKey.set(`${a.learningSessionId}:${a.learnerUserId}`, a)
  }

  return {
    scheduledSessions: [...schedById.values()],
    learningSessions: [...lsById.values()],
    attendance: [...attKey.values()],
  }
}

export function mergeRoster(local: RosterState, remote: RosterState): RosterState {
  // Prefer union by id; remote wins on conflict for org name only if local empty users
  if (remote.users.length === 0 && remote.courses.length === 0) return local
  if (local.users.length === 0 && local.courses.length === 0) return remote

  const users = new Map(remote.users.map((u) => [u.id, u]))
  for (const u of local.users) users.set(u.id, u)
  const courses = new Map(remote.courses.map((c) => [c.id, c]))
  for (const c of local.courses) courses.set(c.id, c)
  const classes = new Map(remote.classes.map((c) => [c.id, c]))
  for (const c of local.classes) classes.set(c.id, c)
  const enrollments = new Map(remote.enrollments.map((e) => [e.id, e]))
  for (const e of local.enrollments) enrollments.set(e.id, e)

  return {
    organization: local.organization.id ? local.organization : remote.organization,
    users: [...users.values()],
    courses: [...courses.values()],
    classes: [...classes.values()],
    enrollments: [...enrollments.values()],
  }
}

const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000

export function isLockExpired(
  session: Pick<LearningSession, 'lockExpiresAt'>,
  now = new Date().toISOString(),
): boolean {
  if (!session.lockExpiresAt) return true
  return new Date(session.lockExpiresAt).getTime() <= new Date(now).getTime()
}

/** Whether userId may write capture for this open session. */
export function canHoldSessionLock(
  session: LearningSession,
  userId: string,
  now = new Date().toISOString(),
): boolean {
  if (session.status !== 'open') return false
  if (!session.ownerUserId || isLockExpired(session, now)) return true
  return session.ownerUserId === userId
}

export function acquireSessionLock(
  session: LearningSession,
  userId: string,
  now = new Date().toISOString(),
  ttlMs = DEFAULT_LOCK_TTL_MS,
): { ok: true; session: LearningSession } | { ok: false; error: string } {
  if (session.status !== 'open') {
    return { ok: false, error: 'Only open sessions can be locked' }
  }
  if (!canHoldSessionLock(session, userId, now)) {
    return {
      ok: false,
      error: `Session is owned by another teacher until ${session.lockExpiresAt}`,
    }
  }
  return {
    ok: true,
    session: {
      ...session,
      ownerUserId: userId,
      lockExpiresAt: new Date(new Date(now).getTime() + ttlMs).toISOString(),
    },
  }
}

export function releaseSessionLock(session: LearningSession): LearningSession {
  return { ...session, ownerUserId: null, lockExpiresAt: null }
}

export function refreshSessionLock(
  session: LearningSession,
  userId: string,
  now = new Date().toISOString(),
  ttlMs = DEFAULT_LOCK_TTL_MS,
): { ok: true; session: LearningSession } | { ok: false; error: string } {
  if (session.ownerUserId && session.ownerUserId !== userId && !isLockExpired(session, now)) {
    return { ok: false, error: 'Cannot refresh another teacher’s lock' }
  }
  return acquireSessionLock(session, userId, now, ttlMs)
}
