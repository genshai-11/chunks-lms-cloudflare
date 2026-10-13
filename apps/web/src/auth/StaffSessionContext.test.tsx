import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffSession } from './StaffSessionContext'
import { SupabaseStaffSessionProvider, useStaffSession } from './StaffSessionContext'

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn(), clearRequestCache: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabase: mocks.getSupabase }))
vi.mock('../lib/request-cache', () => ({ clearRequestCache: mocks.clearRequestCache }))

let latest: StaffSession | undefined
function CaptureSession() {
  latest = useStaffSession()
  return null
}

function fakeClient(options?: {
  user?: { id: string; email: string; user_metadata: Record<string, unknown> } | null
  roles?: Array<{ role: 'admin' | 'teacher'; active: boolean }>
  signInError?: string
  usernameLoginError?: boolean
  usernameLoginStatus?: number
  signUpSession?: object | null
}) {
  const user =
    options && 'user' in options
      ? options.user
      : {
          id: 'auth-1',
          email: 'admin@example.com',
          user_metadata: { full_name: 'Admin User' },
        }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({
        error: options?.signInError ? { message: options.signInError } : null,
      }),
      setSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      signUp: vi.fn().mockResolvedValue({
        data: { session: options?.signUpSession ?? null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue(
        options?.usernameLoginError
          ? {
              data: null,
              error: {
                message: 'Function returned an error',
                context: { status: options.usernameLoginStatus ?? 401 },
              },
            }
          : {
              data: {
                ok: true,
                session: { accessToken: 'access-token', refreshToken: 'refresh-token' },
              },
              error: null,
            },
      ),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'domain-1', account_status: 'active' },
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: options?.roles ?? [{ role: 'admin', active: true }],
              error: null,
            }),
          }),
        }),
      }
    }),
  }
}

describe('Supabase staff session', () => {
  beforeEach(() => {
    latest = undefined
    mocks.getSupabase.mockReset()
    mocks.clearRequestCache.mockReset()
  })

  it('restores the native user and database-owned active roles', async () => {
    mocks.getSupabase.mockReturnValue(fakeClient())
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))
    expect(latest).toMatchObject({ signedIn: true, userId: 'auth-1', email: 'admin@example.com' })
    expect(latest?.staffRoles).toEqual(['admin', 'teacher'])
  })

  it('clears private playback URLs when signing out', async () => {
    const client = fakeClient()
    mocks.getSupabase.mockReturnValue(client)
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))

    await act(async () => {
      await latest!.signOut()
    })

    expect(client.auth.signOut).toHaveBeenCalledOnce()
    expect(mocks.clearRequestCache).toHaveBeenCalledWith('audio:signed-playback')
  })

  it('reports confirmation when signup returns no active session', async () => {
    mocks.getSupabase.mockReturnValue(fakeClient({ user: null }))
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))
    let result: Awaited<ReturnType<StaffSession['signUpWithPassword']>> | undefined
    await act(async () => {
      result = await latest!.signUpWithPassword('new@example.com', 'long-password')
    })
    expect(result).toEqual({
      ok: true,
      message: 'Account created! Please check your email to confirm signup.',
    })
  })

  it('keeps email/password sign-in on the native Supabase Auth path', async () => {
    const client = fakeClient({ user: null })
    mocks.getSupabase.mockReturnValue(client)
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))

    await act(async () => {
      await latest!.signInWithPassword(' Staff@Example.com ', 'admin123')
    })

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@example.com',
      password: 'admin123',
    })
    expect(client.functions.invoke).not.toHaveBeenCalled()
  })

  it('resolves a normalized username through the login function and sets the returned session', async () => {
    const client = fakeClient({ user: null })
    mocks.getSupabase.mockReturnValue(client)
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))

    let result: Awaited<ReturnType<StaffSession['signInWithPassword']>> | undefined
    await act(async () => {
      result = await latest!.signInWithPassword(' Teacher.One ', 'admin123')
    })

    expect(result).toEqual({ ok: true })
    expect(client.functions.invoke).toHaveBeenCalledWith('username-login', {
      body: { username: 'teacher.one', password: 'admin123' },
    })
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    })
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('surfaces a generic password sign-in error without granting access', async () => {
    mocks.getSupabase.mockReturnValue(
      fakeClient({ user: null, signInError: 'Invalid login credentials' }),
    )
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))
    let result: Awaited<ReturnType<StaffSession['signInWithPassword']>> | undefined
    await act(async () => {
      result = await latest!.signInWithPassword('staff@example.com', 'bad-password')
    })
    expect(result).toEqual({ ok: false, error: 'Invalid email/username or password' })
    expect(latest?.signedIn).toBe(false)
  })

  it('reports a username-login throttle without exposing account state', async () => {
    mocks.getSupabase.mockReturnValue(
      fakeClient({ user: null, usernameLoginError: true, usernameLoginStatus: 429 }),
    )
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))

    let result: Awaited<ReturnType<StaffSession['signInWithPassword']>> | undefined
    await act(async () => {
      result = await latest!.signInWithPassword('teacher.one', 'bad-password')
    })

    expect(result).toEqual({ ok: false, error: 'Too many login attempts. Try again later.' })
  })

  it('does not expose username lookup failures', async () => {
    mocks.getSupabase.mockReturnValue(fakeClient({ user: null, usernameLoginError: true }))
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))

    let result: Awaited<ReturnType<StaffSession['signInWithPassword']>> | undefined
    await act(async () => {
      result = await latest!.signInWithPassword('missing-user', 'bad-password')
    })

    expect(result).toEqual({ ok: false, error: 'Invalid email/username or password' })
  })

  it('does not reset ready state or wipe staff roles on token refresh / tab switch for same user', async () => {
    let authListener: ((event: string, session: { user: any } | null) => void) | undefined
    const baseClient = fakeClient()
    const client = {
      ...baseClient,
      auth: {
        ...baseClient.auth,
        onAuthStateChange: vi.fn((cb) => {
          authListener = cb
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
    }
    mocks.getSupabase.mockReturnValue(client)
    render(
      <SupabaseStaffSessionProvider>
        <CaptureSession />
      </SupabaseStaffSessionProvider>,
    )
    await waitFor(() => expect(latest?.ready).toBe(true))
    expect(latest?.staffRoles).toEqual(['admin', 'teacher'])

    // Simulate tab switch / token refresh firing onAuthStateChange with same user ID
    await act(async () => {
      authListener?.('TOKEN_REFRESHED', {
        user: { id: 'auth-1', email: 'admin@example.com', user_metadata: { full_name: 'Admin User' } },
      })
    })

    // Ready should remain true immediately without unmounting or reloading
    expect(latest?.ready).toBe(true)
    expect(latest?.staffRoles).toEqual(['admin', 'teacher'])
  })
})
