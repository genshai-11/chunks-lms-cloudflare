import {
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthChrome } from '../auth/AuthProvider'
import { useStaffSession } from '../auth/useStaffSession'
import { useAppState } from '../state/useAppState'

const STAFF_NAV = [
  { to: '/admin', label: 'Admin', icon: Shield, role: 'admin' as const },
  { to: '/teacher', label: 'Teacher', icon: Users, role: 'teacher' as const },
]

function BackendBadge() {
  const {
    backendStatus,
    backendError,
    lastSyncedAt,
    syncNow,
    reloadFromSupabase,
    supabaseEnabled,
  } = useAppState()

  if (!supabaseEnabled) {
    return (
      <span
        className="backend-badge is-offline"
        title="Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in web/.env (anon key, not service_role)"
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        Local only
      </span>
    )
  }

  const label =
    backendStatus === 'booting'
      ? 'Connecting…'
      : backendStatus === 'syncing'
        ? 'Syncing…'
        : backendStatus === 'online'
          ? 'Supabase'
          : backendStatus === 'error'
            ? 'Sync error'
            : 'Offline'

  const title =
    backendError ??
    (lastSyncedAt ? `Last sync ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Supabase')

  return (
    <div className="backend-cluster">
      <span className={`backend-badge is-${backendStatus}`} title={title}>
        {backendStatus === 'syncing' || backendStatus === 'booting' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : backendStatus === 'error' || backendStatus === 'offline' ? (
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Cloud className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </span>
      <button
        type="button"
        className="backend-icon-btn"
        title="Reload from Supabase"
        onClick={() => void reloadFromSupabase()}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" className="backend-icon-btn" title="Push now" onClick={() => void syncNow()}>
        <Cloud className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const session = useStaffSession()
  const focusMode = pathname === '/teacher/observe'

  if (focusMode) {
    return <div className="shell shell-focus">{children}</div>
  }

  const staffLinks = STAFF_NAV.filter((r) => session.canAccess(r.role))
  const showStaffNav = session.authBypass || (session.signedIn && session.isStaff)

  return (
    <div className={`shell ${showStaffNav ? 'has-bottom-nav' : ''}`}>
      <header className="topbar">
        <NavLink to="/" className="topbar-brand" end aria-label="Chunks LMS home">
          <img
            src="/logo.png"
            alt=""
            className="topbar-logo"
            width={120}
            height={36}
            decoding="async"
          />
          <span className="topbar-brand-text">Chunks LMS</span>
        </NavLink>

        <nav className="topbar-roles" aria-label="Workspaces">
          {showStaffNav
            ? staffLinks.map((r) => {
                const Icon = r.icon
                return (
                  <NavLink
                    key={r.to}
                    to={r.to}
                    className={({ isActive }) => `topbar-role${isActive ? ' is-active' : ''}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                    {r.label}
                  </NavLink>
                )
              })
            : null}
        </nav>

        <div className="topbar-actions">
          <BackendBadge />
          <AuthChrome>
            <span className="sr-only">Account</span>
          </AuthChrome>
        </div>
      </header>
      {children}

      {showStaffNav && (
        <nav className="mobile-bottom-nav md:hidden" aria-label="Workspaces Mobile">
          {staffLinks.map((r) => {
            const Icon = r.icon
            return (
              <NavLink
                key={r.to}
                to={r.to}
                className={({ isActive }) => `mobile-bottom-tab${isActive ? ' is-active' : ''}`}
              >
                <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
                <span className="mobile-bottom-label">{r.label}</span>
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
