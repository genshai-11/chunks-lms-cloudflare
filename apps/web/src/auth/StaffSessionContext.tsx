import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { clearRequestCache } from '../lib/request-cache'
import { getSupabase } from '../lib/supabase'
import {
  canAccessStaffRole,
  normalizeStaffRole,
  resolveActiveStaffRoles,
  type StaffRole,
} from './staff-roles'
import {
  INVALID_STAFF_LOGIN_MESSAGE,
  STAFF_LOGIN_RATE_LIMIT_MESSAGE,
  isEmailLoginIdentifier,
  normalizeStaffUsername,
  validateStaffUsername,
} from './staff-username'

export type StaffSession = {
  ready: boolean
  signedIn: boolean
  authBypass: boolean
  authEnabled: boolean
  userId: string | null
  email: string | null
  displayName: string | null
  staffRoles: StaffRole[]
  canAccess: (role: StaffRole) => boolean
  isStaff: boolean
  signInWithEmail: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>
  signInWithPassword: (
    identifier: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ ok: true; message: string } | { ok: false; error: string }>
  signOut: () => Promise<void>
}

const StaffSessionContext = createContext<StaffSession | null>(null)

function buildSession(
  partial: Omit<
    StaffSession,
    | 'canAccess'
    | 'isStaff'
    | 'signInWithEmail'
    | 'signInWithPassword'
    | 'signUpWithPassword'
    | 'signOut'
  > &
    Pick<StaffSession, 'signInWithEmail' | 'signInWithPassword' | 'signUpWithPassword' | 'signOut'>,
): StaffSession {
  return {
    ...partial,
    canAccess: (role) => canAccessStaffRole(partial.staffRoles, role),
    isStaff: partial.staffRoles.length > 0,
  }
}

type UsernameLoginResponse = {
  ok?: boolean
  session?: {
    accessToken?: string
    refreshToken?: string
  }
}

function normalizeStaffEmail(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase()
}

async function loadStaffRolesByAuthUserId(authUserId: string | null): Promise<StaffRole[]> {
  const sb = getSupabase()
  if (!authUserId || !sb) return []

  const userResult = await sb
    .from('users')
    .select('id,account_status')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  const userRow = userResult.data as { id: string; account_status?: string | null } | null
  if (userResult.error || !userRow || userRow.account_status === 'inactive') return []

  const rolesResult = await sb
    .from('staff_roles')
    .select('role,active')
    .eq('user_id', userRow.id)
    .eq('active', true)

  const roleRows = (rolesResult.data ?? []) as Array<{ role: unknown; active: unknown }>
  const grants = roleRows
    .map((row) => ({ role: normalizeStaffRole(row.role), active: Boolean(row.active) }))
    .filter((grant): grant is { role: StaffRole; active: boolean } => Boolean(grant.role))

  if (rolesResult.error) return []
  return resolveActiveStaffRoles(grants)
}



export type EdgeUser = {
  id: string
  email: string | null
  username: string | null
  displayName: string
  roles: StaffRole[]
}

export function EdgeStaffSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<EdgeUser | null>(() => {
    try {
      const stored = localStorage.getItem('chunks_auth_user')
      if (stored) {
        return JSON.parse(stored) as EdgeUser
      }
    } catch {
      // ignore
    }
    return null
  })

  useEffect(() => {
    setReady(true)
  }, [])

  const signInWithPassword = useCallback<StaffSession['signInWithPassword']>(
    async (identifier, password) => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        })
        const data = (await res.json()) as { ok: boolean; token?: string; user?: EdgeUser; error?: string }
        if (data.ok && data.user && data.token) {
          localStorage.setItem('chunks_auth_token', data.token)
          localStorage.setItem('chunks_auth_user', JSON.stringify(data.user))
          setUser(data.user)
          clearRequestCache('standalone')
          return { ok: true }
        }
        return { ok: false, error: data.error || 'Tài khoản hoặc mật khẩu không chính xác' }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ' }
      }
    },
    [],
  )

  const signOut = useCallback<StaffSession['signOut']>(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    } catch {
      // ignore
    }
    localStorage.removeItem('chunks_auth_token')
    localStorage.removeItem('chunks_auth_user')
    setUser(null)
    clearRequestCache('standalone')
  }, [])

  const staffRoles = user?.roles ?? []
  const signedIn = Boolean(user)

  const value = useMemo<StaffSession>(
    () =>
      buildSession({
        ready,
        signedIn,
        authBypass: false,
        authEnabled: true,
        userId: user?.id ?? null,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        staffRoles,
        signInWithEmail: async () => ({ ok: false, error: 'Vui lòng đăng nhập bằng Email/Username và Mật khẩu' }),
        signInWithPassword,
        signUpWithPassword: async () => ({ ok: false, error: 'Đăng ký bị khóa' }),
        signOut,
      }),
    [ready, signedIn, user, staffRoles, signInWithPassword, signOut],
  )

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>
}

export const BypassStaffSessionProvider = EdgeStaffSessionProvider

function displayNameFor(user: User | null): string | null {
  if (!user) return null
  const meta = user.user_metadata as Record<string, unknown> | null
  const fullName = typeof meta?.full_name === 'string' ? meta.full_name : null
  const name = typeof meta?.name === 'string' ? meta.name : null
  return fullName ?? name ?? user.email ?? user.id
}

/** Production path: native Supabase Auth session → database-owned staff_roles. */
export function SupabaseStaffSessionProvider({ children }: { children: ReactNode }) {
  const sb = getSupabase()
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [staffRoles, setStaffRoles] = useState<StaffRole[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const activeAuthUserId = useRef<string | null>(null)

  const signInWithEmail = useCallback<StaffSession['signInWithEmail']>(
    async (email) => {
      if (!sb) return { ok: false, error: 'Supabase Auth is not configured' }
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
      const { error } = await sb.auth.signInWithOtp({
        email: normalizeStaffEmail(email),
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      })
      return error ? { ok: false, error: error.message } : { ok: true }
    },
    [sb],
  )

  const signInWithPassword = useCallback<StaffSession['signInWithPassword']>(
    async (identifier, password) => {
      if (!sb) return { ok: false, error: 'Supabase Auth is not configured' }

      if (isEmailLoginIdentifier(identifier)) {
        const { error } = await sb.auth.signInWithPassword({
          email: normalizeStaffEmail(identifier),
          password,
        })
        return error ? { ok: false, error: INVALID_STAFF_LOGIN_MESSAGE } : { ok: true }
      }

      const usernameValidationError = validateStaffUsername(identifier)
      if (usernameValidationError) {
        return { ok: false, error: INVALID_STAFF_LOGIN_MESSAGE }
      }

      const { data, error } = await sb.functions.invoke('username-login', {
        body: { username: normalizeStaffUsername(identifier), password },
      })
      const payload = data as UsernameLoginResponse | null
      const accessToken = payload?.session?.accessToken
      const refreshToken = payload?.session?.refreshToken
      const functionStatus = (error as { context?: { status?: number } } | null)?.context?.status
      if (functionStatus === 429) {
        return { ok: false, error: STAFF_LOGIN_RATE_LIMIT_MESSAGE }
      }
      if (error || payload?.ok !== true || !accessToken || !refreshToken) {
        return { ok: false, error: INVALID_STAFF_LOGIN_MESSAGE }
      }

      const { error: sessionError } = await sb.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      return sessionError ? { ok: false, error: INVALID_STAFF_LOGIN_MESSAGE } : { ok: true }
    },
    [sb],
  )

  const signUpWithPassword = useCallback<StaffSession['signUpWithPassword']>(
    async (email, password) => {
      if (!sb) return { ok: false, error: 'Supabase Auth is not configured' }
      const { data, error } = await sb.auth.signUp({
        email: normalizeStaffEmail(email),
        password,
      })
      if (error) return { ok: false, error: error.message }
      if (data.session) {
        return { ok: true, message: 'Account created and signed in successfully!' }
      } else {
        return { ok: true, message: 'Account created! Please check your email to confirm signup.' }
      }
    },
    [sb],
  )

  const signOut = useCallback(async () => {
    try {
      if (sb) await sb.auth.signOut()
    } finally {
      clearRequestCache('audio:signed-playback')
    }
  }, [sb])

  useEffect(() => {
    if (!sb) {
      setReady(true)
      return
    }
    let cancelled = false
    void sb.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        const nextUser = data.user ?? null
        const nextUserId = nextUser?.id ?? null
        const userIdChanged = activeAuthUserId.current !== nextUserId
        activeAuthUserId.current = nextUserId
        if (userIdChanged) {
          setRolesLoading(Boolean(nextUser))
        }
        setUser(nextUser)
        setReady(true)
      }
    })
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      if (!nextUserId || (activeAuthUserId.current && activeAuthUserId.current !== nextUserId)) {
        clearRequestCache('audio:signed-playback')
      }
      const userIdChanged = activeAuthUserId.current !== nextUserId
      activeAuthUserId.current = nextUserId
      if (userIdChanged) {
        setRolesLoading(Boolean(nextUser))
      }
      setUser(nextUser)
      setReady(true)
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [sb])

  useEffect(() => {
    let cancelled = false
    const userId = user?.id ?? null
    if (!userId) {
      setStaffRoles([])
      setRolesLoading(false)
      return
    }
    setRolesLoading(true)
    void loadStaffRolesByAuthUserId(userId)
      .then((roles) => {
        if (!cancelled) setStaffRoles(roles)
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const value = useMemo(
    () =>
      buildSession({
        ready: ready && !rolesLoading,
        signedIn: Boolean(user),
        authBypass: false,
        authEnabled: Boolean(sb),
        userId: user?.id ?? null,
        email: user?.email ?? null,
        displayName: displayNameFor(user),
        staffRoles,
        signInWithEmail,
        signInWithPassword,
        signUpWithPassword,
        signOut,
      }),
    [
      ready,
      rolesLoading,
      user,
      sb,
      staffRoles,
      signInWithEmail,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    ],
  )

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>
}

export function useStaffSession(): StaffSession {
  const ctx = useContext(StaffSessionContext)
  if (!ctx) {
    throw new Error('useStaffSession must be used within a StaffSession provider')
  }
  return ctx
}
