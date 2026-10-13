import { Lock, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import type { StaffRole } from './staff-roles'
import { StaffSignInForm } from './AuthProvider'
import { useStaffSession } from './useStaffSession'
import { Panel } from '../components/ui'

type Props = {
  /** Required staff role for this workspace */
  role: StaffRole
  children: ReactNode
}

/**
 * Gates Admin / Teacher routes. Learners never pass through here.
 */
export function StaffGate({ role, children }: Props) {
  const session = useStaffSession()

  if (!session.ready) {
    return (
      <div className="access-page">
        <PageHeader icon={Lock} kicker="Account" title="Checking sign-in…" subtitle="One moment." />
      </div>
    )
  }

  if (!session.signedIn) {
    return (
      <div className="access-page">
        <PageHeader
          icon={Lock}
          kicker="Account sign-in"
          title="Welcome back"
          subtitle="Sign in with your Chunks account to continue."
        />
        <div style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
          {session.authEnabled ? (
            <StaffSignInForm />
          ) : (
            <Panel
              icon={Lock}
              title="Account sign-in is not configured"
              description="Configure Supabase Auth before signing in."
              collapsible={false}
            >
              <p className="meta">
                Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, or
                enable <code>VITE_AUTH_BYPASS=true</code> for local demos.
              </p>
            </Panel>
          )}
        </div>
      </div>
    )
  }

  if (!session.canAccess(role)) {
    if (role === 'admin' && session.canAccess('teacher')) {
      return <Navigate to="/teacher" replace />
    }
    if (role === 'teacher' && session.canAccess('admin')) {
      return <Navigate to="/admin" replace />
    }
    return (
      <div className="access-page">
        <PageHeader
          icon={ShieldAlert}
          kicker="No access"
          title="This workspace is not assigned to you"
          subtitle={
            session.email
              ? `Signed in as ${session.email}. Ask an admin to grant an active ${role} role in staff_roles.`
              : `Your account has no active ${role} role.`
          }
        />
        <div className="panel" style={{ maxWidth: 480, margin: '0 auto' }}>
          <p className="meta">
            Your staff roles: {session.staffRoles.length ? session.staffRoles.join(', ') : 'none'}
          </p>
          <p className="meta" style={{ marginTop: 8 }}>
            Staff authorization is database-owned in <code>staff_roles</code>; user-editable Auth
            metadata and email allowlists are not used for authorization.
          </p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            {session.canAccess('admin') ? (
              <Link to="/admin" className="btn ghost">
                Admin
              </Link>
            ) : null}
            {session.canAccess('teacher') ? (
              <Link to="/teacher" className="btn ghost">
                Teacher
              </Link>
            ) : null}
            <Link to="/" className="btn ghost">
              Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
