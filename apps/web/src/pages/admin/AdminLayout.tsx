import {
  BookOpen,
  Boxes,
  ChartColumn,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import { RoleWorkspace } from '../../components/RoleWorkspace'
import { useAppState } from '../../state/useAppState'

const ITEMS = [
  { to: '/admin', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/package-tests', label: 'Package Tests', icon: Boxes },
  { to: '/admin/people', label: 'Accounts', icon: Users },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/classes', label: 'Classes', icon: GraduationCap },
  { to: '/admin/metrics', label: 'Metrics', icon: Gauge },
  { to: '/admin/analysis', label: 'Analysis', icon: ChartColumn },
]


export function AdminLayout() {
  const { roster } = useAppState()

  return (
    <RoleWorkspace
      title="Admin"
      subtitle={roster.organization.name}
      navLabel="Admin menu"
      items={ITEMS}
    />
  )
}
