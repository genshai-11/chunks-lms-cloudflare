/** Pure mapping used by native Supabase Auth provisioning tests/server adapters. */
export type SupabaseAuthUserPayload = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

export type DomainUserWrite = {
  auth_user_id: string
  display_name: string
  email: string | null
}

function metadataName(metadata: Record<string, unknown> | null | undefined): string | null {
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
  const name = typeof metadata?.name === 'string' ? metadata.name.trim() : ''
  return fullName || name || null
}

export function mapSupabaseAuthUserToDomain(payload: SupabaseAuthUserPayload): DomainUserWrite {
  const email = payload.email?.trim().toLowerCase() || null
  return {
    auth_user_id: payload.id,
    display_name: metadataName(payload.user_metadata) ?? email ?? payload.id,
    email,
  }
}

/** Duplicate Auth deliveries retain one stable auth identity while refreshing profile fields. */
export function mergeUserUpsert(
  existing: DomainUserWrite | null,
  incoming: DomainUserWrite,
): DomainUserWrite {
  if (!existing) return incoming
  return {
    auth_user_id: existing.auth_user_id,
    display_name: incoming.display_name || existing.display_name,
    email: incoming.email ?? existing.email,
  }
}
