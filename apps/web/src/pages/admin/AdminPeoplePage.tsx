import { useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  Check,
  GraduationCap,
  ImagePlus,
  Pencil,
  Power,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Flash } from '../../components/Flash'
import { readImageAsDataUrl } from '../../lib/readImageFile'
import {
  createTeacherAuthAccount,
  deleteTeacherAuthAccount,
  setTeacherAuthAccountStatus,
  updateTeacherAuthAccount,
} from '../../lib/staff-auth-admin'
import { PageHeader } from '../../components/PageHeader'
import { UserAvatar } from '../../components/UserAvatar'
import { EmptyState, Panel } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import { normalizeStaffUsername, validateStaffUsername } from '../../auth/staff-username'
import {
  addLearnerProfile,
  countDuplicateEmailGroups,
  deleteUserProfile,
  enrollLearner,
  listActiveLearners,
  listActiveTeachers,
  listTeachersRaw,
  listLearnersRaw,
  mergeDuplicateAccountsByEmail,
  setAccountStatus,
  updateUserProfile,
} from '../../modules/roster/service'
import { LOCAL_ORG_ID } from '../../modules/roster/seed'
import { useAppState } from '../../state/useAppState'

type Tab = 'teachers' | 'learners'
type Draft = {
  displayName: string
  email: string
  username: string
  password?: string
  avatarUrl?: string
  allowMultiClass?: boolean
  organizationId?: string
  classId?: string
}

const emptyDraft = (): Draft => ({
  displayName: '',
  email: '',
  username: '',
  password: '',
  avatarUrl: '',
  allowMultiClass: false,
  organizationId: '',
  classId: '',
})

export function AdminPeoplePage() {
  const { roster, setRoster, syncNow, reloadFromSupabase } = useAppState()
  const { message, error, ok, err } = useFlash()
  const [tab, setTab] = useState<Tab>('teachers')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('all')
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all')

  const teachers = useMemo(() => listActiveTeachers(roster), [roster])
  const learners = useMemo(() => listActiveLearners(roster), [roster])
  const rawTeacherCount = useMemo(() => listTeachersRaw(roster).length, [roster])
  const rawLearnerCount = useMemo(() => listLearnersRaw(roster).length, [roster])
  const dupGroups = useMemo(() => countDuplicateEmailGroups(roster), [roster])

  const activeClasses = useMemo(() => roster.classes.filter((c) => c.status === 'active'), [roster.classes])

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    let list = selectedStatusFilter === 'all'
      ? listTeachersRaw(roster)
      : selectedStatusFilter === 'active'
        ? listActiveTeachers(roster)
        : listTeachersRaw(roster).filter((u) => u.accountStatus === 'inactive')

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          Boolean(u.email && u.email.toLowerCase().includes(q)) ||
          Boolean(u.username && u.username.toLowerCase().includes(q)),
      )
    }

    return list
  }, [roster, selectedStatusFilter, searchQuery])

  // Filtered learners list with Teacher and Course filtering
  const filteredLearners = useMemo(() => {
    let list = selectedStatusFilter === 'all'
      ? listLearnersRaw(roster)
      : selectedStatusFilter === 'active'
        ? listActiveLearners(roster)
        : listLearnersRaw(roster).filter((u) => u.accountStatus === 'inactive')

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          Boolean(u.email && u.email.toLowerCase().includes(q)),
      )
    }

    if (selectedCourseFilter !== 'all') {
      const courseClassIds = new Set(
        roster.classes.filter((c) => c.courseId === selectedCourseFilter).map((c) => c.id),
      )
      const enrolledInCourseIds = new Set(
        roster.enrollments
          .filter((e) => e.status === 'active' && courseClassIds.has(e.classId))
          .map((e) => e.learnerUserId),
      )
      list = list.filter((u) => enrolledInCourseIds.has(u.id))
    }

    if (selectedTeacherFilter !== 'all') {
      const teacherClassIds = new Set(
        roster.classes.filter((c) => c.teacherUserId === selectedTeacherFilter).map((c) => c.id),
      )
      const enrolledWithTeacherIds = new Set(
        roster.enrollments
          .filter((e) => e.status === 'active' && teacherClassIds.has(e.classId))
          .map((e) => e.learnerUserId),
      )
      list = list.filter((u) => enrolledWithTeacherIds.has(u.id))
    }

    return list
  }, [roster, selectedStatusFilter, searchQuery, selectedCourseFilter, selectedTeacherFilter])

  const rows = tab === 'teachers' ? filteredTeachers : filteredLearners
  const rawCount = tab === 'teachers' ? rawTeacherCount : rawLearnerCount
  const hiddenDupes = Math.max(0, rawCount - (tab === 'teachers' ? teachers.length : learners.length))

  async function createAccount() {
    if (tab === 'teachers') {
      const password = draft.password ?? ''
      const usernameError = validateStaffUsername(draft.username)
      if (usernameError) return err(usernameError)
      if (password.length < 6) return err('Teacher password must be at least 6 characters')

      const targetOrgId = draft.organizationId || roster.organization.id || LOCAL_ORG_ID
      const r = await createTeacherAuthAccount({
        displayName: draft.displayName,
        email: draft.email,
        username: normalizeStaffUsername(draft.username),
        password,
        avatarUrl: draft.avatarUrl || null,
        organizationId: targetOrgId,
      })
      if (!r.ok) return err(r.error)
      await reloadFromSupabase()
      ok(`Teacher ${r.data.displayName} created in workplace ${roster.organization.name || 'Default'}`)
    } else {
      const r = addLearnerProfile(roster, {
        displayName: draft.displayName,
        email: draft.email.trim(),
        avatarUrl: draft.avatarUrl || null,
        allowMultiClass: draft.allowMultiClass,
      })
      if (!r.ok) return err(r.error)

      let nextRoster = r.state
      let enrolledMsg = ''
      if (draft.classId) {
        const enrollRes = enrollLearner(nextRoster, draft.classId, r.value.id)
        if (enrollRes.ok) {
          nextRoster = enrollRes.state
          const className = roster.classes.find((c) => c.id === draft.classId)?.name ?? 'Class'
          enrolledMsg = ` and enrolled into ${className}`
        }
      }

      setRoster(nextRoster)
      await syncNow({ roster: nextRoster })
      ok(`Learner ${r.value.displayName} added${enrolledMsg}`)
    }
    setDraft(emptyDraft())
    setShowAdd(false)
  }

  async function saveEdit(id: string) {
    const user = roster.users.find((u) => u.id === id)
    if (user?.roles.includes('teacher')) {
      const usernameError = validateStaffUsername(editDraft.username)
      if (usernameError) return err(usernameError)
      const r = await updateTeacherAuthAccount({
        userId: id,
        displayName: editDraft.displayName,
        email: editDraft.email,
        username: normalizeStaffUsername(editDraft.username),
        avatarUrl: editDraft.avatarUrl || null,
        organizationId: editDraft.organizationId || roster.organization.id || LOCAL_ORG_ID,
      })
      if (!r.ok) return err(r.error)
      await reloadFromSupabase()
      setEditingId(null)
      ok(`${r.data.displayName} updated`)
      return
    }

    const r = updateUserProfile(roster, id, {
      displayName: editDraft.displayName,
      email: editDraft.email || null,
      avatarUrl: editDraft.avatarUrl || null,
      allowMultiClass: editDraft.allowMultiClass,
    })
    if (!r.ok) return err(r.error)
    setRoster(r.state)
    await syncNow({ roster: r.state })
    setEditingId(null)
    ok(`${r.value.displayName} updated`)
  }

  return (
    <>
      <PageHeader
        icon={Users}
        kicker="Admin"
        title="Accounts"
        subtitle="Manage staff accounts (Supabase Auth) and learner profiles across courses and classes."
        actions={
          <button
            type="button"
            className="primary"
            onClick={() => {
              setShowAdd((v) => !v)
              setDraft(emptyDraft())
            }}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            <span>{showAdd ? 'Cancel' : tab === 'teachers' ? 'Add teacher' : 'Add learner'}</span>
          </button>
        }
      />
      <Flash message={message} error={error} />

      {dupGroups > 0 ? (
        <p className="banner err" role="status">
          {dupGroups} email(s) have duplicate accounts ({hiddenDupes} extra row
          {hiddenDupes === 1 ? '' : 's'} hidden in this list).{' '}
          <button
            type="button"
            className="underline font-semibold"
            onClick={async () => {
              const r = mergeDuplicateAccountsByEmail(roster)
              if (!r.ok) return err(r.error)
              setRoster(r.state)
              await syncNow({ roster: r.state, pruneMissing: true })
              await reloadFromSupabase()
              ok(
                r.value.removed === 0
                  ? 'No duplicates to merge'
                  : `Merged ${r.value.removed} duplicate account(s)`,
              )
            }}
          >
            Merge duplicates
          </button>
        </p>
      ) : null}

      <nav className="subnav accounts-subnav" aria-label="Account type">
        <button
          type="button"
          className={tab === 'teachers' ? 'is-active' : undefined}
          onClick={() => {
            setTab('teachers')
            setShowAdd(false)
            setEditingId(null)
            setSearchQuery('')
          }}
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          Teachers
          <span className="accounts-tab-count">{teachers.length}</span>
        </button>
        <button
          type="button"
          className={tab === 'learners' ? 'is-active' : undefined}
          onClick={() => {
            setTab('learners')
            setShowAdd(false)
            setEditingId(null)
            setSearchQuery('')
          }}
        >
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          Learners
          <span className="accounts-tab-count">{learners.length}</span>
        </button>
      </nav>

      {showAdd ? (
        <Panel
          icon={UserPlus}
          title={tab === 'teachers' ? 'New teacher' : 'New learner'}
          description={
            tab === 'teachers'
              ? 'Creates a real Supabase Auth staff account assigned to your active workplace with a teacher role.'
              : 'Creates a learner profile and seats them into a class.'
          }
        >
          <form
            className="accounts-add-form"
            onSubmit={(e) => {
              e.preventDefault()
              createAccount()
            }}
          >
            {tab === 'teachers' && (
              <label>
                Assigned Workplace
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700">
                  <Building2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  <span>{roster.organization.name || 'My organization'}</span>
                  <span className="ml-auto text-xs font-mono text-slate-400">
                    {roster.organization.id.slice(0, 8)}…
                  </span>
                </div>
              </label>
            )}

            <label>
              Name
              <input
                value={draft.displayName}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                required
                autoFocus
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                required
                placeholder={tab === 'learners' ? 'learner@school.edu' : 'teacher@school.edu'}
              />
            </label>
            {tab === 'teachers' && (
              <label>
                Username
                <input
                  type="text"
                  value={draft.username}
                  onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"
                  placeholder="teacher.name"
                  autoComplete="username"
                />
              </label>
            )}
            {tab === 'teachers' && (
              <label>
                Password
                <input
                  type="password"
                  value={draft.password ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                  required
                  minLength={6}
                  placeholder="Set teacher password"
                  autoComplete="new-password"
                />
              </label>
            )}

            {tab === 'learners' && (
              <>
                <label>
                  Initial Class Enrollment (Optional)
                  <select
                    value={draft.classId ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, classId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="">Do not enroll yet (assign later)</option>
                    {activeClasses.map((cl) => {
                      const course = roster.courses.find((c) => c.id === cl.courseId)
                      const teacherUser = roster.users.find((u) => u.id === cl.teacherUserId)
                      return (
                        <option key={cl.id} value={cl.id}>
                          {cl.name} ({course?.name ?? 'Course'}) · Teacher: {teacherUser?.displayName ?? 'Unassigned'}
                        </option>
                      )
                    })}
                  </select>
                </label>
                <label className="flex items-center gap-2 mt-2 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.allowMultiClass ?? false}
                    onChange={(e) => setDraft((d) => ({ ...d, allowMultiClass: e.target.checked }))}
                  />
                  <span className="text-xs text-slate-600 font-medium">
                    Allow multi-class (Cho phép học nhiều lớp)
                  </span>
                </label>
              </>
            )}

            <div className="avatar-field">
              <UserAvatar
                name={draft.displayName || 'User'}
                avatarUrl={draft.avatarUrl}
                size="lg"
              />
              <div className="avatar-field-actions">
                <label className="btn ghost avatar-file-label">
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  <span>{draft.avatarUrl ? 'Change photo' : 'Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (ev) => {
                      const file = ev.target.files?.[0]
                      ev.target.value = ''
                      if (!file) return
                      try {
                        const url = await readImageAsDataUrl(file)
                        setDraft((d) => ({ ...d, avatarUrl: url }))
                      } catch (error) {
                        err(error instanceof Error ? error.message : 'Could not read image')
                      }
                    }}
                  />
                </label>
                {draft.avatarUrl ? (
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => setDraft((d) => ({ ...d, avatarUrl: '' }))}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    <span>Remove</span>
                  </button>
                ) : null}
              </div>
            </div>
            <button type="submit" className="primary">
              <Check className="h-4 w-4" aria-hidden />
              <span>Save</span>
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel
        icon={tab === 'teachers' ? Users : GraduationCap}
        title={tab === 'teachers' ? 'Teachers' : 'Learners'}
        description={
          rows.length === 0
            ? 'No matching accounts found'
            : `Showing ${rows.length} of ${tab === 'teachers' ? rawTeacherCount : rawLearnerCount} total account${rawCount === 1 ? '' : 's'}`
        }
      >
        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              type="search"
              placeholder={tab === 'teachers' ? 'Search by name, email, or username…' : 'Search by name or email…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
          </div>

          {tab === 'learners' && (
            <>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-400" aria-hidden />
                <select
                  value={selectedTeacherFilter}
                  onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  aria-label="Filter by teacher"
                >
                  <option value="all">All teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-slate-400" aria-hidden />
                <select
                  value={selectedCourseFilter}
                  onChange={(e) => setSelectedCourseFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  aria-label="Filter by course"
                >
                  <option value="all">All courses</option>
                  {roster.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
            aria-label="Filter by status"
          >
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={tab === 'teachers' ? Users : GraduationCap}
            title={tab === 'teachers' ? 'No teachers found' : 'No learners found'}
            description={searchQuery || selectedCourseFilter !== 'all' || selectedTeacherFilter !== 'all' ? 'Try adjusting your filters.' : 'Add an account to get started.'}
            action={
              <button type="button" className="primary" onClick={() => setShowAdd(true)}>
                <UserPlus className="h-4 w-4" aria-hidden />
                <span>Add</span>
              </button>
            }
          />
        ) : (
          <div className="table-wrap accounts-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  {tab === 'teachers' && <th scope="col">Workplace & Classes</th>}
                  {tab === 'learners' && <th scope="col">Enrolled Courses & Classes</th>}
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const isTeacher = u.roles.includes('teacher')
                  const teacherClasses = roster.classes.filter((c) => c.teacherUserId === u.id && c.status === 'active')

                  const learnerEnrollments = roster.enrollments.filter(
                    (e) => e.learnerUserId === u.id && e.status === 'active',
                  )
                  const learnerClasses = roster.classes.filter((c) =>
                    learnerEnrollments.some((e) => e.classId === c.id),
                  )

                  return editingId === u.id ? (
                    <tr key={u.id} className="accounts-row-edit">
                      <td colSpan={4}>
                        <div className="accounts-edit-row">
                          <input
                            className="row-input"
                            value={editDraft.displayName}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, displayName: e.target.value }))
                            }
                            aria-label="Name"
                            placeholder="Name"
                          />
                          <input
                            className="row-input"
                            type="email"
                            value={editDraft.email}
                            onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                            aria-label="Email"
                            placeholder="Email"
                          />
                          {tab === 'teachers' && (
                            <input
                              className="row-input"
                              value={editDraft.username}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, username: e.target.value }))
                              }
                              aria-label="Username"
                              placeholder="Username"
                              minLength={3}
                              maxLength={32}
                              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"
                              required
                            />
                          )}
                          {tab === 'learners' && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 select-none cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editDraft.allowMultiClass ?? false}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, allowMultiClass: e.target.checked }))
                                }
                              />
                              <span>Multi-class</span>
                            </label>
                          )}
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={editDraft.displayName || 'User'}
                              avatarUrl={editDraft.avatarUrl}
                              size="sm"
                            />
                            <label className="btn ghost btn-sm py-1 px-2 cursor-pointer flex items-center gap-1">
                              <ImagePlus className="h-3 w-3" aria-hidden />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={async (ev) => {
                                  const file = ev.target.files?.[0]
                                  ev.target.value = ''
                                  if (!file) return
                                  try {
                                    const url = await readImageAsDataUrl(file)
                                    setEditDraft((d) => ({ ...d, avatarUrl: url }))
                                  } catch (error) {
                                    err(
                                      error instanceof Error
                                        ? error.message
                                        : 'Could not read image',
                                    )
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={() => saveEdit(u.id)}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Save
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={u.id}
                      className={
                        (u.accountStatus ?? 'active') === 'inactive'
                          ? 'accounts-row-inactive'
                          : undefined
                      }
                    >
                      <td>
                        <span className="cell-with-avatar">
                          <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size="sm" />
                          <span>
                            <strong className="accounts-name">
                              {u.displayName}
                              {u.allowMultiClass && (
                                <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 rounded">
                                  Multi-class
                                </span>
                              )}
                            </strong>
                            <span className="accounts-email">{u.email ?? '—'}</span>
                            {isTeacher && (
                              <span className="accounts-email text-emerald-600 font-mono">
                                {u.username ? `@${u.username}` : 'Username not set'}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>

                      {/* Teachers Column: Workplace & Classes */}
                      {tab === 'teachers' && (
                        <td>
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span>{roster.organization.name || 'My organization'}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {teacherClasses.length > 0 ? (
                                teacherClasses.map((c) => (
                                  <span
                                    key={c.id}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
                                  >
                                    {c.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">No assigned classes</span>
                              )}
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Learners Column: Enrolled Courses & Classes */}
                      {tab === 'learners' && (
                        <td>
                          <div className="flex flex-col gap-1 text-xs">
                            {learnerClasses.length > 0 ? (
                              learnerClasses.map((c) => {
                                const course = roster.courses.find((crs) => crs.id === c.courseId)
                                const teacherObj = roster.users.find((t) => t.id === c.teacherUserId)
                                return (
                                  <div key={c.id} className="flex items-center gap-1.5 text-slate-700">
                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 text-[10px]">
                                      {c.name} ({course?.code ?? 'CRS'})
                                    </span>
                                    <span className="text-slate-400 text-[11px]">
                                      · Teacher: {teacherObj?.displayName ?? 'Unassigned'}
                                    </span>
                                  </div>
                                )
                              })
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Not enrolled in any class</span>
                            )}
                          </div>
                        </td>
                      )}

                      <td>
                        <span
                          className={`badge${(u.accountStatus ?? 'active') === 'active' ? ' success' : ''}`}
                        >
                          {u.accountStatus ?? 'active'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions accounts-actions">
                          <button
                            type="button"
                            className="ghost"
                            title={
                              (u.accountStatus ?? 'active') === 'active' ? 'Deactivate' : 'Activate'
                            }
                            onClick={() => {
                              const next =
                                (u.accountStatus ?? 'active') === 'active' ? 'inactive' : 'active'
                              if (isTeacher) {
                                void (async () => {
                                  const r = await setTeacherAuthAccountStatus({
                                    userId: u.id,
                                    accountStatus: next,
                                  })
                                  if (!r.ok) return err(r.error)
                                  await reloadFromSupabase()
                                  ok(`${u.displayName} → ${next}`)
                                })()
                                return
                              }
                              const r = setAccountStatus(roster, u.id, next)
                              if (!r.ok) return err(r.error)
                              setRoster(r.state)
                              void syncNow({ roster: r.state })
                              ok(`${u.displayName} → ${next}`)
                            }}
                          >
                            <Power className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            title="Edit"
                            onClick={() => {
                              setEditingId(u.id)
                              setEditDraft({
                                displayName: u.displayName,
                                email: u.email ?? '',
                                username: u.username ?? '',
                                avatarUrl: u.avatarUrl ?? '',
                                allowMultiClass: u.allowMultiClass ?? false,
                                organizationId: roster.organization.id,
                              })
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="ghost danger"
                            title="Delete"
                            onClick={() => {
                              if (!window.confirm(`Delete ${u.displayName}?`)) return
                              if (isTeacher) {
                                void (async () => {
                                  const r = await deleteTeacherAuthAccount(u.id)
                                  if (!r.ok) return err(r.error)
                                  await reloadFromSupabase()
                                  ok(`${u.displayName} deleted`)
                                })()
                                return
                              }
                              const r = deleteUserProfile(roster, u.id)
                              if (!r.ok) return err(r.error)
                              setRoster(r.state)
                              void syncNow({ roster: r.state, pruneMissing: true })
                              ok(`${u.displayName} deleted`)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
