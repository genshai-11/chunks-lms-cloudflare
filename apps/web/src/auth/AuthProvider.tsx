import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { useStaffSession } from './useStaffSession'

type Props = { children?: ReactNode }

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function StaffSignInForm() {
  const session = useStaffSession()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-6">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
          <LogIn className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="text-xl font-black tracking-tight text-slate-950">Sign in to Chunks</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Use your account email or username and password to continue.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitting(true)
          setMessage(null)
          setError(null)

          void session
            .signInWithPassword(identifier, password)
            .then((result) => {
              if (result.ok) setMessage('Signed in successfully!')
              else setError(result.error)
            })
            .finally(() => setSubmitting(false))
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Email or username</span>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or teacher.name"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-3xs outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-3xs outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10"
          />
        </label>
        <button
          type="submit"
          className="btn primary mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black"
          disabled={submitting}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
        </button>
      </form>

      <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-500">
        Account access only. Magic links and public sign-up are disabled on this screen.
      </p>
      {message ? <p className="banner ok mt-3 text-center">{message}</p> : null}
      {error ? <p className="banner err mt-3 text-center">{error}</p> : null}
    </div>
  )
}

export { StaffSignInForm }

/** Sign-in / sign-out / role controls for the top bar (staff). */
export function AuthChrome({ children }: Props) {
  const session = useStaffSession()

  if (session.authBypass && !session.authEnabled) {
    return (
      <div className="auth-chrome">
        <span className="meta" title="VITE_AUTH_BYPASS — local/CI only">
          Staff bypass
        </span>
        {children}
      </div>
    )
  }

  return (
    <div className="auth-chrome">
      {session.signedIn ? (
        <details className="auth-account-menu">
          <summary title={session.email ?? 'Account'}>
            <UserRound className="h-4 w-4" aria-hidden />
            <span>Account</span>
          </summary>
          <div className="auth-account-popover">
            <strong>{session.email}</strong>
            {session.staffRoles.length > 0 ? (
              <span className="meta auth-role-pill" title="Database staff roles">
                {session.staffRoles.join(' · ')}
              </span>
            ) : null}
            <button type="button" className="ghost" onClick={() => void session.signOut()}>
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
            {children}
          </div>
        </details>
      ) : (
        <>
          <Link
            to="/admin"
            className="btn ghost"
            style={{
              minHeight: '2rem',
              height: '2rem',
              padding: '0 0.75rem',
              fontSize: '0.75rem',
              borderRadius: '8px',
            }}
          >
            Sign in
          </Link>
          {children}
        </>
      )}
    </div>
  )
}
