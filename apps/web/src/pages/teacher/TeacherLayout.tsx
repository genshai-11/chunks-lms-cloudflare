import { Archive, ChartColumn, ClipboardCheck, Radio, Tag, Users } from 'lucide-react'
import { ClassContextSelect } from '../../components/ClassContextSelect'
import { RoleWorkspace } from '../../components/RoleWorkspace'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { useAppState } from '../../state/useAppState'
import { useStaffSession } from '../../auth/useStaffSession'
import { updateUserProfile } from '../../modules/roster/service'
import { EditableAvatar } from '../../components/EditableAvatar'

const ITEMS = [
  { to: '/teacher', label: 'Learners', icon: Users, end: true },
  { to: '/teacher/classes', label: 'Class labels', icon: Tag },
  { to: '/teacher/session', label: 'Live session', icon: Radio },
  { to: '/teacher/tests', label: 'Tests 1–1', icon: ClipboardCheck },
  { to: '/teacher/archive', label: 'Archive', icon: Archive },
  { to: '/teacher/analysis', label: 'Analysis', icon: ChartColumn },
]

export function TeacherLayout() {
  const { roster, setRoster, syncNow, scheduling, capture } = useAppState()
  const staffSession = useStaffSession()
  const { options, classRow, seats, activeClassId, setActiveClassId, selectedClassIds, mode } = useTeacherClassContext()

  const currentUser = roster.users.find(
    (user) =>
      Boolean(staffSession.email) &&
      user.email?.toLowerCase() === staffSession.email?.toLowerCase(),
  )

  const liveOpen = Boolean(
    classRow &&
    scheduling.learningSessions.some((s) => s.classId === classRow.id && s.status === 'open') &&
    capture?.sessionStatus === 'open',
  )

  const items = ITEMS.map((item) =>
    item.to === '/teacher/session' && liveOpen ? { ...item, label: 'Live · open' } : item,
  )

  const selectedOptions = options.filter((o) => selectedClassIds.includes(o.classRow.id))
  const totalSeats = selectedOptions.reduce((sum, o) => sum + o.seats, 0)
  const totalCapacity = selectedOptions.reduce((sum, o) => sum + o.classRow.capacity, 0)

  let subtitle = 'No class assigned'
  if (mode === 'all') {
    subtitle = `All classes · ${totalSeats} learners · cap ${totalCapacity}`
  } else if (mode === 'multi') {
    subtitle = `${selectedOptions.length} classes · ${totalSeats} learners · cap ${totalCapacity}`
  } else if (classRow) {
    subtitle = `${seats} learners · cap ${classRow.capacity}${liveOpen ? ' · LIVE' : ''}`
  }

  return (
    <RoleWorkspace
      title="Teaching"
      subtitle={subtitle}
      leading={
        currentUser ? (
          <EditableAvatar
            name={currentUser.displayName}
            avatarUrl={currentUser.avatarUrl}
            size="md"
            onSave={async (url) => {
              const r = updateUserProfile(roster, currentUser.id, { avatarUrl: url })
              if (r.ok) {
                setRoster(r.state)
                await syncNow({ roster: r.state })
              }
            }}
          />
        ) : undefined
      }
      contextSlot={
        <ClassContextSelect
          variant="teacher"
          options={options}
          value={activeClassId}
          onChange={(id) => setActiveClassId(id)}
          compact
        />
      }
      navLabel="Teacher menu"
      items={items}
    />
  )
}

