import {
  Pencil,
  School,
  UserPlus,
  Users,
  X,
  Eye,
  Play,
  Trash2,
} from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'


import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { UserAvatar } from '../../components/UserAvatar'
import { EditableAvatar } from '../../components/EditableAvatar'
import { EmptyState, Panel } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import {
  createLearnerAndEnroll,
  endEnrollment,
  updateUserProfile,
} from '../../modules/roster/service'
import {
  createTeacherLearnerAndEnroll,
  resolveTeacherClassScope,
} from '../../modules/roster/teacher-workspace'
import {
  summarizeLearnerSessions,
  learnerRfcStats,
  formatPercent,
} from '../../modules/teacher/learner-insights'
import { useAppState } from '../../state/useAppState'
import { useStaffSession } from '../../auth/useStaffSession'

export function TeacherClassesPage() {
  const {
    roster,
    setRoster,
    setActiveClassId,
    setActiveLearnerUserId,
    ledger,
    scheduling,
    syncNow,
    reloadFromSupabase,
    supabaseEnabled,
  } = useAppState()
  const staffSession = useStaffSession()

  const { teacher, classes } = resolveTeacherClassScope(
    roster,
    staffSession.email,
    staffSession.canAccess('admin'),
  )

  const { message, error, ok, err } = useFlash()

  // Class category filtering state linked to global context
  const {
    activeClassId,
    setActiveClassId: setGlobalActiveClassId,
    selectedClassIds,
  } = useTeacherClassContext()
  const selectedClassId = activeClassId || 'all'

  // Add learner states
  const [isAddingLearner, setIsAddingLearner] = useState(false)
  const [newLearnerName, setNewLearnerName] = useState('')
  const [newLearnerEmail, setNewLearnerEmail] = useState('')
  const [enrollClassId, setEnrollClassId] = useState('')
  const [newLearnerAvatarUrl, setNewLearnerAvatarUrl] = useState<string | null>(null)
  const [isCreatingLearner, setIsCreatingLearner] = useState(false)

  // Edit learner states
  const [editingLearner, setEditingLearner] = useState<{
    id: string
    name: string
    email: string
    avatarUrl: string | null
  } | null>(null)

  const activeClassRows = useMemo(() => classes.filter((c) => c.status === 'active'), [classes])

  const activeClassIds = useMemo(() => activeClassRows.map((c) => c.id), [activeClassRows])

  // Get active enrollments under teacher's classes
  const enrollments = useMemo(() => {
    return roster.enrollments.filter(
      (e) => activeClassIds.includes(e.classId) && e.status === 'active',
    )
  }, [roster.enrollments, activeClassIds])

  // Filter enrollments by selected category tab
  const filteredEnrollments = useMemo(() => {
    if (selectedClassId === 'all') return enrollments
    return enrollments.filter((e) => selectedClassIds.includes(e.classId))
  }, [enrollments, selectedClassId, selectedClassIds])

  // Find unique active learner profiles
  const enrolledLearnerIds = useMemo(() => {
    return Array.from(new Set(filteredEnrollments.map((e) => e.learnerUserId)))
  }, [filteredEnrollments])

  // Map to full profiles and load stats
  const learners = useMemo(() => {
    return enrolledLearnerIds
      .map((id) => {
        const user = roster.users.find((u) => u.id === id)
        const userEnrollments = enrollments.filter((e) => e.learnerUserId === id)
        const userClasses = activeClassRows.filter((c) =>
          userEnrollments.some((ue) => ue.classId === c.id),
        )

        // Stats calculation
        const sessionRows = summarizeLearnerSessions({
          ledger,
          scheduling,
          learnerUserId: id,
        })
        const stats = learnerRfcStats(sessionRows)

        return {
          id,
          name: user?.displayName ?? id,
          email: user?.email ?? '',
          avatarUrl: user?.avatarUrl ?? null,
          classes: userClasses,
          sessionsCount: stats.count,
          rfcAvg: stats.avg,
          enrollments: userEnrollments,
          accountStatus: user?.accountStatus ?? 'active',
        }
      })
      .filter((l) => l.accountStatus === 'active')
  }, [enrolledLearnerIds, roster.users, enrollments, activeClassRows, ledger, scheduling])

  // Default class to enroll in when adding a new learner
  useEffect(() => {
    if (selectedClassId !== 'all' && !selectedClassId.includes(',')) {
      setEnrollClassId(selectedClassId)
    } else if (activeClassRows.length > 0) {
      setEnrollClassId(activeClassRows[0].id)
    }
  }, [selectedClassId, activeClassRows])

  if (!teacher) {
    return (
      <EmptyState
        icon={School}
        title="Teacher profile missing"
        description="Ask Admin to create your Teacher account and mark it active."
      />
    )
  }

  const handleAddLearner = async () => {
    if (!enrollClassId) return err('Select a class first')
    if (!newLearnerName.trim()) return err('Learner name required')

    if (supabaseEnabled && !staffSession.authBypass) {
      setIsCreatingLearner(true)
      try {
        const result = await createTeacherLearnerAndEnroll({
          classId: enrollClassId,
          displayName: newLearnerName,
          email: newLearnerEmail.trim() || null,
          avatarUrl: newLearnerAvatarUrl,
        })
        if (!result.ok) return err(result.error)

        setNewLearnerName('')
        setNewLearnerEmail('')
        setNewLearnerAvatarUrl(null)
        setIsAddingLearner(false)
        await reloadFromSupabase()
        return ok(`Seated ${result.data.displayName} successfully`)
      } finally {
        setIsCreatingLearner(false)
      }
    }

    const result = createLearnerAndEnroll(roster, enrollClassId, {
      displayName: newLearnerName,
      email: newLearnerEmail.trim() || null,
      avatarUrl: newLearnerAvatarUrl,
    })

    if (!result.ok) return err(result.error)

    setRoster(result.state)
    setNewLearnerName('')
    setNewLearnerEmail('')
    setNewLearnerAvatarUrl(null)
    setIsAddingLearner(false)
    await syncNow({ roster: result.state })
    ok(`Seated ${result.value.learner.displayName} successfully`)
  }

  const handleSaveLearnerEdit = async () => {
    if (!editingLearner) return
    if (!editingLearner.name.trim()) return err('Name is required')
    if (!editingLearner.email.trim()) return err('Email is required')

    const result = updateUserProfile(roster, editingLearner.id, {
      displayName: editingLearner.name,
      email: editingLearner.email,
      avatarUrl: editingLearner.avatarUrl,
    })

    if (!result.ok) return err(result.error)

    setRoster(result.state)
    await syncNow({ roster: result.state })
    setEditingLearner(null)
    ok('Learner profile updated successfully')
  }

  const handleRemoveEnrollment = async (
    learnerName: string,
    enrollmentId: string,
    className: string,
  ) => {
    if (!window.confirm(`Remove ${learnerName} from ${className}?`)) {
      return
    }
    const result = endEnrollment(roster, enrollmentId)
    if (!result.ok) return err(result.error)
    setRoster(result.state)
    await syncNow({ roster: result.state })
    ok(`${learnerName} enrollment in ${className} ended`)
  }

  const handleDeactivateLearner = async (learnerId: string, name: string) => {
    if (
      !window.confirm(
        `Deactivate ${name}? They will be hidden from active lists, but their history is preserved.`,
      )
    ) {
      return
    }
    // End all active enrollments
    let currentRoster = roster
    const activeEnrs = roster.enrollments.filter(
      (e) => e.learnerUserId === learnerId && e.status === 'active',
    )
    for (const e of activeEnrs) {
      const res = endEnrollment(currentRoster, e.id)
      if (res.ok) currentRoster = res.state
    }
    // Deactivate user profile
    const result = updateUserProfile(currentRoster, learnerId, {
      accountStatus: 'inactive',
    })
    if (!result.ok) return err(result.error)

    setRoster(result.state)
    await syncNow({ roster: result.state })
    ok(`Deactivated ${name}`)
  }

  return (
    <>
      <PageHeader
        icon={Users}
        kicker="Teacher"
        title="Roster & learners"
        subtitle="Manage seated learners, edit profiles, view telemetry/session stats, and configure class groups."
        actions={
          <div className="page-actions">
            <button
              type="button"
              className={isAddingLearner ? 'active' : 'ghost'}
              onClick={() => setIsAddingLearner((prev) => !prev)}
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              <span>Add Learner</span>
            </button>
          </div>
        }
      />
      <Flash message={message} error={error} />

      {/* Dynamic Add Learner Form (khong tạo full - only visible when requested) */}
      {isAddingLearner && (
        <Panel
          icon={UserPlus}
          title="Add new learner"
          description="Create a learner profile and enroll them into an active class immediately."
        >
          <div className="grid gap-4 md:grid-cols-[auto_1fr] items-start mb-3">
            <div className="flex flex-col items-center gap-2 p-4 border border-slate-200 rounded-2xl bg-slate-50 min-w-[140px] text-center">
              <EditableAvatar
                name={newLearnerName || 'New Learner'}
                avatarUrl={newLearnerAvatarUrl}
                size="xl"
                onSave={async (url) => {
                  setNewLearnerAvatarUrl(url)
                }}
              />
              <span className="text-[11px] text-slate-500 font-semibold mt-1">
                Upload Avatar
              </span>
              <span className="text-[9px] text-slate-400">
                Click camera to choose
              </span>
            </div>

            <div className="form-grid teacher-class-form" style={{ marginTop: 0 }}>
              <label>
                Full name
                <input
                  value={newLearnerName}
                  onChange={(e) => setNewLearnerName(e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={newLearnerEmail}
                  onChange={(e) => setNewLearnerEmail(e.target.value)}
                  placeholder="learner@school.edu"
                />
              </label>
              <label>
                Assign class
                <select value={enrollClassId} onChange={(e) => setEnrollClassId(e.target.value)}>
                  {activeClassRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="primary"
              onClick={handleAddLearner}
              disabled={
                isCreatingLearner ||
                !newLearnerName.trim() ||
                !newLearnerEmail.trim() ||
                !enrollClassId
              }
            >
              {isCreatingLearner ? 'Creating…' : 'Create + Enroll'}
            </button>
            <button type="button" className="ghost" onClick={() => setIsAddingLearner(false)}>
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {/* Class Category Pills selector (xem list avatar learner & course classes giống category - gán label - gán ngày bắt đầu dạng label) */}
      <div className="mb-6 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Class Filters & Categories
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className={`btn ${selectedClassId === 'all' ? 'primary' : 'ghost'}`}
            onClick={() => setGlobalActiveClassId('all')}
          >
            All active ({learners.length})
          </button>
          {activeClassRows.map((c) => {
            const course = roster.courses.find((x) => x.id === c.courseId)
            const count = roster.enrollments.filter(
              (e) => e.classId === c.id && e.status === 'active',
            ).length
            return (
              <button
                key={c.id}
                type="button"
                className={`btn ${selectedClassId === c.id ? 'primary' : 'ghost'}`}
                onClick={() => setGlobalActiveClassId(c.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{c.name}</span>
                {course && (
                  <span className="badge text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                    {course.code}
                  </span>
                )}
                {c.startsOn && (
                  <span className="badge text-[10px] bg-red-50 text-red-700 border border-red-100/50 px-1.5 py-0.5 rounded">
                    Starts: {c.startsOn}
                  </span>
                )}
                <span className="badge bg-slate-200 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main content prioritizing Learners first */}
      <Panel
        icon={Users}
        title={
          selectedClassId === 'all'
            ? 'All Enrolled Learners'
            : `Class Roster: ${activeClassRows
                .filter((c) => selectedClassIds.includes(c.id))
                .map((c) => c.name)
                .join(', ')}`
        }
        description="Grid view of active learners, showing course enrollments, total completed teaching sessions, and average RFC scores."
      >
        {learners.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active learners"
            description={
              selectedClassId === 'all'
                ? "You don't have any learners enrolled. Use the Add Learner button above."
                : 'No learners are enrolled in this class category yet.'
            }
          />
        ) : (
          <div className="teacher-learner-grid">
            {learners.map((learner) => (
              <article key={learner.id} className="teacher-learner-card">
                {/* Main Learner Avatar/Details Link */}
                <div className="teacher-learner-card-main flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={learner.name} avatarUrl={learner.avatarUrl} size="lg" />
                    <div>
                      <strong>{learner.name}</strong>
                      <small className="break-all">{learner.email || 'No email'}</small>
                    </div>
                  </div>
                </div>

                {/* Seated classes list with 'Remove' badge actions (Dynamic teacher controls) */}
                <div className="flex flex-wrap gap-1 items-center min-h-[26px]">
                  {learner.classes.map((cls) => {
                    const enr = learner.enrollments.find((e) => e.classId === cls.id)
                    return (
                      <span
                        key={cls.id}
                        className="badge bg-slate-100 text-slate-700 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border border-slate-200/50"
                      >
                        <span>{cls.name}</span>
                        {enr && (
                          <button
                            type="button"
                            className="text-slate-400 hover:text-red-600 border-0 bg-transparent p-0 flex items-center justify-center cursor-pointer transition-colors"
                            onClick={() => handleRemoveEnrollment(learner.name, enr.id, cls.name)}
                            title={`Remove from ${cls.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>

                {/* Mini Stats (sessions & RFC score) */}
                <div className="teacher-learner-mini-stats">
                  <span>
                    <strong>{learner.sessionsCount}</strong>
                    <small>Sessions</small>
                  </span>
                  <span>
                    <strong>{formatPercent(learner.rfcAvg)}</strong>
                    <small>RFC Avg</small>
                  </span>
                  <span className="flex items-center justify-center">
                    <Link
                      to={`/teacher/learner/${encodeURIComponent(learner.id)}`}
                      className="text-red-700 hover:text-red-800 flex flex-col items-center justify-center h-full w-full"
                      title="View learner telemetry and historical data"
                    >
                      <Eye className="h-4.5 w-4.5 mb-0.5" />
                      <small className="text-[9px] font-bold text-red-700 tracking-wider">
                        DETAILS
                      </small>
                    </Link>
                  </span>
                </div>

                {/* Operational Quick Actions (thêm, sửa, xóa learner) */}
                <div className="btn-row teacher-learner-card-actions my-0 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    className="btn ghost flex-1 flex justify-center gap-1.5 text-xs py-1.5"
                    onClick={() =>
                      setEditingLearner({
                        id: learner.id,
                        name: learner.name,
                        email: learner.email,
                        avatarUrl: learner.avatarUrl,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    <span>Edit Profile</span>
                  </button>

                  <Link
                    to={`/teacher/session?learner=${encodeURIComponent(learner.id)}`}
                    className="btn primary flex-1 flex justify-center gap-1.5 text-xs py-1.5"
                    onClick={() => {
                      const preferredClassId =
                        selectedClassId !== 'all' && learner.classes.some((cls) => selectedClassIds.includes(cls.id))
                          ? selectedClassIds.find((cid) => learner.classes.some((cls) => cls.id === cid)) || learner.classes[0]?.id || ''
                          : learner.classes[0]?.id || ''
                      setActiveLearnerUserId(learner.id)
                      setActiveClassId(preferredClassId)
                    }}
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    <span>Observe</span>
                  </Link>

                  <button
                    type="button"
                    className="btn ghost danger flex justify-center gap-1.5 px-3 py-1.5 text-xs"
                    onClick={() => handleDeactivateLearner(learner.id, learner.name)}
                    title="Deactivate learner account completely (keeps historical analytics)"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {/* Edit Profile Modal Dialog (Sửa learner profile & avatar) */}
      {editingLearner && (
        <div className="observe-modal-container">
          <div className="observe-modal-backdrop" onClick={() => setEditingLearner(null)} />
          <div className="observe-modal-card avatar-edit-modal">
            <button
              type="button"
              className="avatar-edit-modal-close"
              onClick={() => setEditingLearner(null)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="observe-modal-title">Edit Learner Profile</h3>
            <p className="observe-modal-desc">
              Change display name, email, or customize user avatar photo.
            </p>

            <div className="avatar-edit-preview flex flex-col items-center gap-2 mb-4">
              <EditableAvatar
                name={editingLearner.name}
                avatarUrl={editingLearner.avatarUrl}
                size="xl"
                onSave={async (url) => {
                  setEditingLearner((prev) => (prev ? { ...prev, avatarUrl: url } : null))
                }}
              />
              <span className="text-xs text-slate-500 font-medium">
                Click camera icon to change
              </span>
            </div>

            <div
              className="form-grid teacher-class-form"
              style={{ gap: '1rem', marginBottom: '1.25rem' }}
            >
              <label>
                Display Name
                <input
                  value={editingLearner.name}
                  onChange={(e) =>
                    setEditingLearner((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  placeholder="e.g. John Doe"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={editingLearner.email}
                  onChange={(e) =>
                    setEditingLearner((prev) => (prev ? { ...prev, email: e.target.value } : null))
                  }
                  placeholder="learner@school.edu"
                />
              </label>
            </div>

            <div className="avatar-edit-actions">
              <button type="button" className="btn primary w-full" onClick={handleSaveLearnerEdit}>
                Save Changes
              </button>
              <button
                type="button"
                className="btn secondary w-full"
                onClick={() => setEditingLearner(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  )
}
