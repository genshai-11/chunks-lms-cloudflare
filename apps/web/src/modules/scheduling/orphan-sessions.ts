import type { RosterState } from '../roster/types'
import type { LearningSession, SchedulingState } from './types'

type CleanupResult = {
  state: SchedulingState
  closed: LearningSession[]
  changed: boolean
}

function participantIds(session: LearningSession): string[] {
  return session.participantLearnerIds?.length ? session.participantLearnerIds : []
}

function activeLearnerIdsForClass(roster: RosterState, classId: string): Set<string> {
  const activeUserIds = new Set(
    roster.users
      .filter((user) => user.roles.includes('learner') && (user.accountStatus ?? 'active') === 'active')
      .map((user) => user.id),
  )
  return new Set(
    roster.enrollments
      .filter(
        (enrollment) =>
          enrollment.classId === classId &&
          enrollment.status === 'active' &&
          activeUserIds.has(enrollment.learnerUserId),
      )
      .map((enrollment) => enrollment.learnerUserId),
  )
}

function hasActiveParticipant(roster: RosterState, session: LearningSession): boolean {
  const activeInClass = activeLearnerIdsForClass(roster, session.classId)
  const participants = participantIds(session)
  if (participants.length === 0) return activeInClass.size > 0
  return participants.some((id) => activeInClass.has(id))
}

/**
 * Close stale live sessions that no longer contain any active learner in their class.
 * This recovers classes blocked by deleted/old learner ids while preserving completed history.
 */
export function closeOrphanOpenSessions(
  roster: RosterState,
  scheduling: SchedulingState,
  at = new Date().toISOString(),
): CleanupResult {
  const closed: LearningSession[] = []
  const learningSessions = scheduling.learningSessions.map((session) => {
    if (session.status !== 'open') return session
    if (hasActiveParticipant(roster, session)) return session
    const completed: LearningSession = {
      ...session,
      status: 'completed',
      completedAt: session.completedAt ?? at,
      ownerUserId: null,
      lockExpiresAt: null,
    }
    closed.push(completed)
    return completed
  })

  return {
    state: closed.length > 0 ? { ...scheduling, learningSessions } : scheduling,
    closed,
    changed: closed.length > 0,
  }
}

export function openSessionParticipantNames(
  roster: RosterState,
  session: LearningSession,
): { names: string[]; hasMissing: boolean } {
  const participants = participantIds(session)
  if (participants.length === 0) return { names: ['all active learners'], hasMissing: false }
  let hasMissing = false
  const names = participants.map((id) => {
    const user = roster.users.find((row) => row.id === id)
    if (!user) hasMissing = true
    return user?.displayName ?? id.slice(0, 6)
  })
  return { names, hasMissing }
}
