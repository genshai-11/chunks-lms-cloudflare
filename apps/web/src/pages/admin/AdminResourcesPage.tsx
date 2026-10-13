import { Navigate, useLocation } from 'react-router-dom'

/**
 * Legacy AdminResourcesPage has been deprecated and replaced by the unified Package Tests Studio.
 * All traffic is seamlessly redirected to /admin/package-tests while preserving query params.
 */
export function AdminResourcesPage() {
  const location = useLocation()
  return <Navigate to={`/admin/package-tests${location.search}`} replace />
}
