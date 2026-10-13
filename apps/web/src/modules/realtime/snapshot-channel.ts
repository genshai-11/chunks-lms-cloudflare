import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { PolicyActor } from '../identity/access-policy'
import { canCaptureAssessment, hasOrgRole, isOrgMember } from '../identity/access-policy'

export type SnapshotRow = {
  attempt_id: string
  status: string
  effective_color: string | null
  class_id?: string
}

export type SnapshotHandler = (row: SnapshotRow) => void

/**
 * Class-scoped realtime subscription for assessment_attempt_snapshots.
 * Authorization: only teacher of class or org admin may subscribe.
 */
export function canSubscribeToClassSnapshots(
  actor: PolicyActor,
  classScope: { organizationId: string; teacherUserId: string; learnerUserIds: string[] },
): boolean {
  return canCaptureAssessment(actor, classScope)
}

export function subscribeToClassSnapshots(input: {
  client: SupabaseClient | null
  classId: string
  actor: PolicyActor
  classScope: { organizationId: string; teacherUserId: string; learnerUserIds: string[] }
  onChange: SnapshotHandler
}): { channel: RealtimeChannel | null; error?: string; unsubscribe: () => void } {
  if (!canSubscribeToClassSnapshots(input.actor, input.classScope)) {
    return {
      channel: null,
      error: 'Not authorized for class-scoped realtime snapshots',
      unsubscribe: () => {},
    }
  }

  if (!input.client) {
    // Local/demo mode: no wire subscription; caller uses in-memory state.
    return {
      channel: null,
      error: undefined,
      unsubscribe: () => {},
    }
  }

  const channel = input.client
    .channel(`class-snapshots:${input.classId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'assessment_attempt_snapshots',
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as SnapshotRow | null
        if (row) input.onChange(row)
      },
    )
    .subscribe()

  return {
    channel,
    unsubscribe: () => {
      void input.client?.removeChannel(channel)
    },
  }
}

/**
 * Storage authorization mirror (same membership rules as RLS).
 * - Admin/teacher of org: org-wide
 * - Learner: only own objects
 */
export function canAccessOrgStorage(
  actor: PolicyActor,
  organizationId: string,
  objectOwnerUserId?: string,
): boolean {
  if (!isOrgMember(actor, organizationId)) return false
  if (hasOrgRole(actor, organizationId, 'admin')) return true
  if (hasOrgRole(actor, organizationId, 'teacher')) return true
  if (objectOwnerUserId && actor.userId === objectOwnerUserId) return true
  return false
}

export function canSubscribeRealtimeTopic(
  actor: PolicyActor,
  topic: { kind: 'class_snapshots'; organizationId: string; teacherUserId: string },
): boolean {
  if (topic.kind === 'class_snapshots') {
    return canSubscribeToClassSnapshots(actor, {
      organizationId: topic.organizationId,
      teacherUserId: topic.teacherUserId,
      learnerUserIds: [],
    })
  }
  return false
}
