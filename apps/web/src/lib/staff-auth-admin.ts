import { getSupabase } from './supabase'

type StaffAuthAdminResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

type TeacherPayload = {
  userId: string
  authUserId: string | null
  email: string
  username: string
  displayName: string
}

async function invokeStaffAccount<T>(body: Record<string, unknown>): Promise<StaffAuthAdminResponse<T>> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  const { data, error } = await sb.functions.invoke('admin-staff-account', { body })
  if (error) return { ok: false, error: error.message }

  const payload = data as StaffAuthAdminResponse<T> | { error?: string }
  if ('ok' in payload && payload.ok) return payload
  return { ok: false, error: payload.error ?? 'Staff account operation failed' }
}

export function createTeacherAuthAccount(input: {
  displayName: string
  email: string
  username: string
  password: string
  avatarUrl?: string | null
  organizationId?: string | null
}) {
  return invokeStaffAccount<TeacherPayload>({ action: 'createTeacher', ...input })
}

export function updateTeacherAuthAccount(input: {
  userId: string
  displayName: string
  email: string
  username: string
  avatarUrl?: string | null
  organizationId?: string | null
}) {
  return invokeStaffAccount<TeacherPayload>({ action: 'updateTeacher', ...input })
}

export function setTeacherAuthAccountStatus(input: {
  userId: string
  accountStatus: 'active' | 'inactive'
}) {
  return invokeStaffAccount<{ userId: string; accountStatus: 'active' | 'inactive' }>({
    action: 'setTeacherStatus',
    ...input,
  })
}

export function deleteTeacherAuthAccount(userId: string) {
  return invokeStaffAccount<{ userId: string }>({ action: 'deleteTeacher', userId })
}
