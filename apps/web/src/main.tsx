import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EdgeStaffSessionProvider } from './auth/StaffSessionContext'
import './index.css'

function Root() {
  return (
    <EdgeStaffSessionProvider>
      <App />
    </EdgeStaffSessionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
