import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import type { Class, DomainUser, RosterState } from './types'

export type TeacherClassScope = {
  teacher: DomainUser | undefined
  classes: Class[]
}

/**
 * A Teacher sees only Classes assigned to their domain profile. Admin implies
 * Teacher surface access, so an Admin using the Teacher workspace can operate
 * every visible Class even when their own profile is not the assigned Teacher.
 */
export function resolveTeacherClassScope(
  roster: RosterState,
  sessionEmail: string | null,
  canAccessAdmin: boolean,
): TeacherClassScope {
  const normalizedEmail = sessionEmail?.trim().toLowerCase() ?? null
  const signedInTeacher = roster.users.find(
    (user) =>
      user.roles.includes('teacher') &&
      Boolean(normalizedEmail) &&
      user.email?.trim().toLowerCase() === normalizedEmail,
  )

  if (canAccessAdmin) {
    const assignedTeacherId = roster.classes[0]?.teacherUserId
    const fallbackTeacher =
      roster.users.find(
        (user) => user.roles.includes('teacher') && user.id === assignedTeacherId,
      ) ?? roster.users.find((user) => user.roles.includes('teacher'))
    return {
      teacher: signedInTeacher ?? fallbackTeacher,
      classes: roster.classes,
    }
  }

  return {
    teacher: signedInTeacher,
    classes: signedInTeacher
      ? roster.classes.filter((row) => row.teacherUserId === signedInTeacher.id)
      : [],
  }
}

type CreateTeacherLearnerInput = {
  classId: string
  displayName: string
  email: string | null
  avatarUrl: string | null
}

type CreatedTeacherLearner = {
  learnerId: string
  enrollmentId: string
  classId: string
  displayName: string
  email: string | null
}

export type CreateTeacherLearnerResult =
  { ok: true; data: CreatedTeacherLearner } | { ok: false; error: string }

/**
 * Hosted staff use the narrow ownership-checked RPC instead of writing an
 * entire Admin-oriented workspace snapshot for one learner operation.
 */
export async function createTeacherLearnerAndEnroll(
  input: CreateTeacherLearnerInput,
): Promise<CreateTeacherLearnerResult> {
  // Foundation Database types are intentionally partial; use the same loose
  // client boundary as the workspace synchronization module for new RPCs.
  const sb = getSupabase() as unknown as SupabaseClient | null
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  const rpcArgs = {
    p_class_id: input.classId,
    p_display_name: input.displayName.trim(),
    p_email: input.email?.trim() || null,
    p_avatar_url: input.avatarUrl,
  }
  const { data, error } = await sb.rpc('create_teacher_learner_and_enroll', rpcArgs)
  if (error) return { ok: false, error: error.message }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Learner creation returned an invalid response' }
  }

  const payload = data as Record<string, unknown>
  if (
    typeof payload.learnerId !== 'string' ||
    typeof payload.enrollmentId !== 'string' ||
    typeof payload.classId !== 'string' ||
    typeof payload.displayName !== 'string'
  ) {
    return { ok: false, error: 'Learner creation returned an incomplete response' }
  }

  return {
    ok: true,
    data: {
      learnerId: payload.learnerId,
      enrollmentId: payload.enrollmentId,
      classId: payload.classId,
      displayName: payload.displayName,
      email: typeof payload.email === 'string' ? payload.email : null,
    },
  }
}
