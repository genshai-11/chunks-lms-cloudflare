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
  if (env.isConfigured) {
    return (
      <SupabaseStaffSessionProvider>
        <App />
      </SupabaseStaffSessionProvider>
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
