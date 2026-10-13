import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import {
  BypassStaffSessionProvider,
  SupabaseStaffSessionProvider,
} from './auth/StaffSessionContext'
import { env } from './env'
import './index.css'

function Root() {
  if (!env.canBoot) {
    const vercelEnv = String(import.meta.env.VITE_VERCEL_ENV ?? '').trim() || 'local'
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white p-4 text-center">
        <div className="max-w-md p-6 bg-slate-900 rounded-2xl border border-white/10 shadow-xl">
          <h2 className="text-xl font-bold mb-2 font-display">Staff auth not configured</h2>
          <p className="text-sm text-slate-400">
            Set <code className="text-slate-200">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-slate-200">VITE_SUPABASE_ANON_KEY</code> for Admin/Teacher
            sign-in, or <code className="text-slate-200">VITE_AUTH_BYPASS=true</code> for local/CI
            demos only.
          </p>
          <p className="text-xs text-slate-600 mt-4 font-mono">
            env={vercelEnv} · supabase={env.isConfigured ? 'set' : 'missing'} · bypass=
            {env.authBypass ? 'on' : 'off'}
          </p>
          {vercelEnv === 'production' ? (
            <p className="text-xs text-amber-500/90 mt-2">
              Production ignores VITE_AUTH_BYPASS. Configure native Supabase Auth before redeploy.
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (env.isConfigured) {
    return (
      <SupabaseStaffSessionProvider>
        <App />
      </SupabaseStaffSessionProvider>
    )
  }

  // Auth bypass without Supabase config (CI / offline demo)
  return (
    <BypassStaffSessionProvider>
      <App />
    </BypassStaffSessionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
