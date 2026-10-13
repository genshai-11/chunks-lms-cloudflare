import { describe, expect, it } from 'vitest'
import { mapSupabaseAuthUserToDomain, mergeUserUpsert } from './sync-user'

describe('Supabase Auth user sync', () => {
  it('maps auth identity and metadata to a stable domain write', () => {
    expect(
      mapSupabaseAuthUserToDomain({
        id: 'auth-1',
        email: 'Ada@Example.com',
        user_metadata: { full_name: 'Ada Lovelace' },
      }),
    ).toEqual({
      auth_user_id: 'auth-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('keeps the existing auth identity across duplicate deliveries', () => {
    const existing = { auth_user_id: 'auth-1', display_name: 'Ada', email: 'ada@example.com' }
    const incoming = {
      auth_user_id: 'auth-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
    }
    expect(mergeUserUpsert(existing, incoming)).toEqual(incoming)
  })
})
