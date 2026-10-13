import { useEffect, useMemo } from 'react'
import {
  listTeacherOperableClasses,
  resolveActiveClass,
  toClassOption,
  type ClassOption,
} from '../modules/roster/class-context'
import { useAppState } from '../state/useAppState'
import { useStaffSession } from '../auth/useStaffSession'

export type TeacherClassContext = {
  options: ClassOption[]
  classRow: ClassOption['classRow'] | null
  course: ClassOption['course']
  teacher: ClassOption['teacher']
  seats: number
  activeClassId: string | null
  setActiveClassId: (id: string | null) => void
  hasMultiple: boolean
  selectedClassIds: string[]
  mode: 'one' | 'multi' | 'all'
}

/** Active class for Teacher workspace (multi-class switcher). */
export function useTeacherClassContext(): TeacherClassContext {
  const { roster, scheduling, activeClassId, setActiveClassId } = useAppState()
  const staffSession = useStaffSession()
  const signedInTeacher = roster.users.find(
    (user) =>
      user.roles.includes('teacher') &&
      Boolean(staffSession.email) &&
      user.email?.toLowerCase() === staffSession.email?.toLowerCase(),
  )

  const classes = useMemo(() => {
    const all = listTeacherOperableClasses(roster)
    return staffSession.canAccess('admin') || !signedInTeacher
      ? all
      : all.filter((row) => row.teacherUserId === signedInTeacher.id)
  }, [roster, staffSession, signedInTeacher])
  const options = useMemo(() => classes.map((row) => toClassOption(roster, row)), [classes, roster])
  const preferredSessionClassId = useMemo(() => {
    const classIds = new Set(classes.map((row) => row.id))
    const open = scheduling.learningSessions.find(
      (session) => session.status === 'open' && classIds.has(session.classId),
    )
    if (open) return open.classId
    const latest = scheduling.learningSessions
      .filter((session) => classIds.has(session.classId))
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
    return latest?.classId ?? null
  }, [classes, scheduling.learningSessions])

  const classRow = useMemo(() => {
    if (activeClassId === 'all' || (activeClassId && activeClassId.includes(','))) {
      return null
    }
    return resolveActiveClass(classes, activeClassId ?? preferredSessionClassId)
  }, [classes, activeClassId, preferredSessionClassId])

  useEffect(() => {
    if (activeClassId === 'all') return

    if (activeClassId && activeClassId.includes(',')) {
      const parts = activeClassId.split(',')
      const allValid = parts.every((part) => classes.some((c) => c.id === part))
      if (allValid) return
    }

    const resolved = resolveActiveClass(classes, activeClassId ?? preferredSessionClassId)
    if (resolved && resolved.id !== activeClassId) {
      setActiveClassId(resolved.id)
    } else if (!resolved && activeClassId) {
      setActiveClassId(null)
    }
  }, [classes, activeClassId, preferredSessionClassId, setActiveClassId])

  const option = classRow ? toClassOption(roster, classRow) : null

  const selectedClassIds = useMemo(() => {
    if (activeClassId === 'all') return classes.map((c) => c.id)
    if (activeClassId && activeClassId.includes(',')) return activeClassId.split(',')
    const resolved = resolveActiveClass(classes, activeClassId ?? preferredSessionClassId)
    return resolved ? [resolved.id] : []
  }, [classes, activeClassId, preferredSessionClassId])

  const mode = useMemo(() => {
    if (activeClassId === 'all') return 'all'
    if (activeClassId && activeClassId.includes(',')) return 'multi'
    return 'one'
  }, [activeClassId])

  return {
    options,
    classRow: option?.classRow ?? null,
    course: option?.course ?? null,
    teacher: option?.teacher ?? signedInTeacher ?? null,
    seats: option?.seats ?? 0,
    activeClassId: activeClassId ?? (option?.classRow.id ?? null),
    setActiveClassId,
    hasMultiple: options.length > 1,
    selectedClassIds,
    mode,
  }
}
