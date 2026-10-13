import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, Eye, EyeOff, ImagePlus, Play, Save, UserRound, Pencil, X, Mail, School } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { UserAvatar } from '../../components/UserAvatar'
import { EmptyState, Panel, StatCard } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import { readImageAsDataUrl } from '../../lib/readImageFile'
import {
  getStandaloneAssignmentProgress,
  listStandaloneAssignments,
  type StandaloneAssignmentProgress,
  type StandaloneTestAssignmentRow,
} from '../../lib/standalone-tests'
import { listSelectablePackageVersions } from '../../lib/test-packages'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { updateUserProfile, endEnrollment, enrollLearner } from '../../modules/roster/service'
import {
  formatPercent,
  learnerRfcStats,
  summarizeLearnerSessions,
} from '../../modules/teacher/learner-insights'
import { useAppState } from '../../state/useAppState'
import { useStaffSession } from '../../auth/useStaffSession'

const DEFAULT_COLUMNS = {
  date: true,
  red: true,
  yellow: true,
  green: true,
  purple: true,
  total: true,
  rfc: true,
  scoreAvg: false,
  probeTotal: false,
}

type ColumnKey = keyof typeof DEFAULT_COLUMNS

type LearnerTestSummary = {
  assignment: StandaloneTestAssignmentRow
  packageLabel: string
  progress: StandaloneAssignmentProgress | null
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  date: 'Date',
  red: 'Red',
  yellow: 'Orange',
  green: 'Green',
  purple: 'Purple',
  total: 'Total',
  rfc: 'RFC',
  scoreAvg: 'Score avg',
  probeTotal: 'Chunks Number',
}

export function TeacherLearnerProfilePage() {
  const { learnerId } = useParams()
  const navigate = useNavigate()
  const { roster, scheduling, ledger, setRoster, syncNow, setActiveLearnerUserId } = useAppState()
  const { course, options } = useTeacherClassContext()
  const staffSession = useStaffSession()
  const { message, error, ok, err } = useFlash()
  const learner = roster.users.find((u) => u.id === learnerId)
  const [name, setName] = useState(learner?.displayName ?? '')
  const [email, setEmail] = useState(learner?.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(learner?.avatarUrl ?? '')
  const [showTable, setShowTable] = useState(true)
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [isEditing, setIsEditing] = useState(false)
  const [testAnalysisAssignmentId, setTestAnalysisAssignmentId] = useState<string | null>(null)
  const [learnerTestSummary, setLearnerTestSummary] = useState<LearnerTestSummary | null>(null)

  const enrollment = useMemo(() => {
    if (!learner) return null
    return roster.enrollments.find((e) => e.learnerUserId === learner.id && e.status === 'active')
  }, [roster.enrollments, learner])

  const currentClass = useMemo(() => {
    return enrollment ? roster.classes.find((c) => c.id === enrollment.classId) : null
  }, [enrollment, roster.classes])

  const activeClasses = useMemo(() => {
    return roster.classes.filter((c) => c.status === 'active')
  }, [roster.classes])

  const [selectedClassId, setSelectedClassId] = useState('')

  useEffect(() => {
    setSelectedClassId(currentClass?.id ?? '')
  }, [currentClass?.id])

  useEffect(() => {
    setName(learner?.displayName ?? '')
    setEmail(learner?.email ?? '')
    setAvatarUrl(learner?.avatarUrl ?? '')
  }, [learner?.displayName, learner?.email, learner?.avatarUrl, learner?.id])

  useEffect(() => {
    if (!learner?.id) {
      setTestAnalysisAssignmentId(null)
      setLearnerTestSummary(null)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await listStandaloneAssignments(learner.id)
      if (cancelled) return
      if (!result.ok) {
        setTestAnalysisAssignmentId(null)
        setLearnerTestSummary(null)
        return
      }
      const latest = [...result.data].sort(
        (a, b) =>
          new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime() ||
          b.assignmentNumber - a.assignmentNumber,
      )[0]
      setTestAnalysisAssignmentId(latest?.id ?? null)
      if (!latest) {
        setLearnerTestSummary(null)
        return
      }

      let packageLabel = 'Package test'
      const selectable = await listSelectablePackageVersions()
      if (selectable.ok) {
        const found = selectable.data.find((v) => v.id === latest.packageVersionId)
        if (found) {
          packageLabel = `${found.label} · ${found.versionLabel}`
        }
      }

      const progress = await getStandaloneAssignmentProgress(latest.id)
      if (!cancelled) {
        setLearnerTestSummary({
          assignment: latest,
          packageLabel,
          progress: progress.ok ? progress.data : null,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [learner?.id])

  const testCompletionPercent = learnerTestSummary?.progress?.totalQuestions
    ? Math.round(
        (learnerTestSummary.progress.completedQuestions /
          learnerTestSummary.progress.totalQuestions) *
          100,
      )
    : 0

  const rows = useMemo(
    () =>
      learnerId
        ? summarizeLearnerSessions({
            ledger,
            scheduling,
            learnerUserId: learnerId,
          })
        : [],
    [learnerId, ledger, scheduling],
  )
  const stats = learnerRfcStats(rows)
  const isDenied = useMemo(() => {
    if (!learnerId) return true
    if (staffSession.canAccess('admin')) return false
    const operableClassIds = new Set(options.map((o) => o.classRow.id))
    if (operableClassIds.size === 0) return true
    const activeEnrolls = roster.enrollments.filter(
      (e) => e.learnerUserId === learnerId && e.status === 'active',
    )
    return !activeEnrolls.some((e) => operableClassIds.has(e.classId))
  }, [learnerId, staffSession, options, roster.enrollments])


  if (isDenied || !learner || !learnerId) {
    return (
      <EmptyState
        icon={UserRound}
        title="Learner not found"
        description="This learner does not exist or is not enrolled in any class you manage."
        action={
          <Link to="/teacher" className="btn ghost">
            Back to learners
          </Link>
        }
      />
    )
  }

  async function saveProfile() {
    if (!learner) return
    let nextRoster = roster

    // 1. Reassign class if changed
    if (selectedClassId !== (currentClass?.id ?? '')) {
      if (enrollment) {
        const ended = endEnrollment(nextRoster, enrollment.id)
        if (!ended.ok) return err(ended.error)
        nextRoster = ended.state
      }
      if (selectedClassId) {
        const enrolled = enrollLearner(nextRoster, selectedClassId, learner.id)
        if (!enrolled.ok) return err(enrolled.error)
        nextRoster = enrolled.state
      }
    }

    // 2. Update profile details
    const result = updateUserProfile(nextRoster, learner.id, {
      displayName: name,
      email: email.trim() || null,
      avatarUrl,
    })
    if (!result.ok) return err(result.error)

    setRoster(result.state)
    await syncNow({ roster: result.state })
    ok('Learner profile saved successfully')
    setIsEditing(false)
  }

  function cancelEdit() {
    setName(learner?.displayName ?? '')
    setEmail(learner?.email ?? '')
    setAvatarUrl(learner?.avatarUrl ?? '')
    setSelectedClassId(currentClass?.id ?? '')
    setIsEditing(false)
  }

  function toggleColumn(key: ColumnKey) {
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function changeImage(file: File | null) {
    if (!file) return
    try {
      setAvatarUrl(await readImageAsDataUrl(file))
    } catch (caught) {
      err(caught instanceof Error ? caught.message : 'Could not read image')
    }
  }

  return (
    <>
      <PageHeader
        icon={UserRound}
        kicker={course?.code ?? 'Learner profile'}
        title={learner.displayName}
        subtitle="Simple profile, editable contact info, session color totals, and RFC min / max / avg."
        actions={
          <div className="page-actions">
            <button type="button" className="ghost" onClick={() => navigate('/teacher')}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Back</span>
            </button>
            <Link
              to={`/teacher/session?learner=${encodeURIComponent(learner.id)}`}
              className="btn primary"
              onClick={() => setActiveLearnerUserId(learner.id)}
            >
              <Play className="h-4 w-4" aria-hidden />
              <span>Start session</span>
            </Link>
            {testAnalysisAssignmentId ? (
              <Link
                to={`/teacher/tests/analysis/${testAnalysisAssignmentId}`}
                className="btn ghost"
                title="View Tests 1-1 standalone analysis for this learner"
              >
                <BarChart3 className="h-4 w-4" aria-hidden />
                <span>Tests 1-1 analysis</span>
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="btn-row" role="tablist" aria-label="Learner profile tabs" style={{ marginBottom: '1rem' }}>
        <Link className="btn primary" role="tab" aria-selected="true" to={`/teacher/learner/${learner.id}`}>Profile & Session Results</Link>
        <Link className="btn ghost" role="tab" aria-selected="false" to={`/teacher/learner/${learner.id}/tests`}>Test Results</Link>
        {testAnalysisAssignmentId ? (
          <Link className="btn ghost" role="tab" aria-selected="false" to={`/teacher/tests/analysis/${testAnalysisAssignmentId}`}>
            Tests 1-1 Analysis
          </Link>
        ) : null}
      </div>
      <Flash message={message} error={error} />

      <div className="teacher-profile-grid">
        <Panel
          icon={UserRound}
          title="Profile"
          description="View and manage learner's profile details."
        >
          <div className="panel-body-inner">
            {!isEditing ? (
              <div className="flex flex-col sm:flex-row items-center text-left gap-6 py-2 w-full">
                <div className="relative group flex-shrink-0">
                  <UserAvatar name={learner.displayName} avatarUrl={avatarUrl || learner.avatarUrl} size="xl" />
                </div>
                <div className="flex-1 w-full flex flex-col items-center sm:items-start">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {learner.displayName}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    <span>{learner.email || <em className="text-slate-400">No email set</em>}</span>
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 px-2.5 py-1 rounded-md text-xs">
                      <School className="h-3.5 w-3.5" aria-hidden />
                      Class: {currentClass?.name || 'Unassigned'}
                    </span>
                  </div>
                  {learnerTestSummary ? (
                    <div className="mt-3 w-full rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {learnerTestSummary.packageLabel}
                        </span>
                        <span className={learnerTestSummary.assignment.status === 'completed' ? 'badge completed' : 'badge success'}>
                          {learnerTestSummary.assignment.status}
                        </span>
                      </div>
                      {learnerTestSummary.assignment.status === 'active' ? (
                        <p className="mt-2 text-xs text-slate-600">
                          {testCompletionPercent}% complete ·{' '}
                          {learnerTestSummary.progress?.completedQuestions ?? 0}/
                          {learnerTestSummary.progress?.totalQuestions ?? 0} questions
                        </p>
                      ) : learnerTestSummary.progress ? (
                        <p className="mt-2 text-xs text-slate-600">
                          {learnerTestSummary.progress.completedQuestions}/
                          {learnerTestSummary.progress.totalQuestions} questions finalized
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn ghost mt-4 border border-slate-700/50 hover:bg-slate-800"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    <span>Edit Profile</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 pb-2 border-b border-white/5">
                  <UserAvatar name={learner.displayName} avatarUrl={avatarUrl || learner.avatarUrl} size="lg" />
                  <div className="flex-1 w-full flex flex-col gap-2">
                    <label className="flex items-center justify-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 transition-colors">
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                      <span>Upload Avatar</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => changeImage(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <label className="text-xs">
                      Image URL (Optional)
                      <input
                        className="w-full text-xs mt-1"
                        value={avatarUrl}
                        onChange={(event) => setAvatarUrl(event.target.value)}
                        placeholder="https://... or upload image"
                      />
                    </label>
                    {avatarUrl ? (
                      <button
                        type="button"
                        className="ghost text-xs text-red-400 hover:text-red-300 flex items-center gap-1 self-start p-0 border-0 bg-transparent cursor-pointer"
                        onClick={() => setAvatarUrl('')}
                      >
                        Remove image
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label>
                    Display Name
                    <input
                      className="w-full mt-1"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label>
                    Email Address (Optional)
                    <input
                      className="w-full mt-1"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="e.g. learner@example.com"
                    />
                  </label>
                  <label>
                    Assign to Classroom
                    <select
                      className="w-full mt-1"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      <option value="">No Class (Unassign)</option>
                      {activeClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  <button type="button" className="primary flex-1" onClick={saveProfile}>
                    <Save className="h-4 w-4" aria-hidden />
                    <span>Save Changes</span>
                  </button>
                  <button type="button" className="ghost flex-1 border border-slate-700/50" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel
          icon={BarChart3}
          title="RFC summary"
          description="RFC = (Red + Orange) / total finalized observations per session."
        >
          <div className="stat-grid compact">
            <StatCard
              icon={BarChart3}
              label="RFC min"
              value={formatPercent(stats.min)}
              hint="Best session"
            />
            <StatCard
              icon={BarChart3}
              label="RFC max"
              value={formatPercent(stats.max)}
              hint="Needs most support"
            />
            <StatCard
              icon={BarChart3}
              label="RFC avg"
              value={formatPercent(stats.avg)}
              hint={`${stats.count} session(s)`}
            />
          </div>
        </Panel>
      </div>

      <Panel
        icon={BarChart3}
        title="Session detail table"
        description="Show/hide the table and choose columns. Example: red: 1, orange: 2, purple: 10, total session: 13."
        actions={
          <button type="button" className="ghost" onClick={() => setShowTable((value) => !value)}>
            {showTable ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
            <span>{showTable ? 'Hide table' : 'Show table'}</span>
          </button>
        }
      >
        <div className="column-toggle-row" aria-label="Table columns">
          {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={columns[key] ? 'active' : 'ghost'}
              onClick={() => toggleColumn(key)}
              title={`Toggle ${COLUMN_LABELS[key]} column`}
            >
              {COLUMN_LABELS[key]}
            </button>
          ))}
        </div>

        {showTable ? (
          rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No session data yet"
              description="Start a session for this learner and finalize observations to populate color totals."
            />
          ) : (
            <div className="table-wrap learner-session-table-wrap">
              <table aria-label="Learner session color totals">
                <thead>
                  <tr>
                    <th scope="col">Session</th>
                    {columns.date ? <th scope="col">Date</th> : null}
                    {columns.red ? <th scope="col">Red</th> : null}
                    {columns.yellow ? <th scope="col">Orange</th> : null}
                    {columns.green ? <th scope="col">Green</th> : null}
                    {columns.purple ? <th scope="col">Purple</th> : null}
                    {columns.total ? <th scope="col">Total session</th> : null}
                    {columns.rfc ? (
                      <th scope="col" title="(Red + Orange) / total">
                        RFC
                      </th>
                    ) : null}
                    {columns.scoreAvg ? <th scope="col">Score avg</th> : null}
                    {columns.probeTotal ? <th scope="col">Chunks Number</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.learningSessionId}>
                      <th scope="row">{row.label}</th>
                      {columns.date ? (
                        <td>{new Date(row.startedAt).toLocaleDateString()}</td>
                      ) : null}
                      {columns.red ? (
                        <td className="font-mono text-xs tabular-nums">{row.red}</td>
                      ) : null}
                      {columns.yellow ? (
                        <td className="font-mono text-xs tabular-nums">{row.yellow}</td>
                      ) : null}
                      {columns.green ? (
                        <td className="font-mono text-xs tabular-nums">{row.green}</td>
                      ) : null}
                      {columns.purple ? (
                        <td className="font-mono text-xs tabular-nums">{row.purple}</td>
                      ) : null}
                      {columns.total ? (
                        <td className="font-mono text-xs tabular-nums">{row.total}</td>
                      ) : null}
                      {columns.rfc ? (
                        <td className="font-mono text-xs tabular-nums">{formatPercent(row.rfc)}</td>
                      ) : null}
                      {columns.scoreAvg ? (
                        <td className="font-mono text-xs tabular-nums">
                          {row.scoreAvg == null ? '—' : row.scoreAvg.toFixed(1)}
                        </td>
                      ) : null}
                      {columns.probeTotal ? (
                        <td className="font-mono text-xs tabular-nums">{row.probeTotal}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="meta">Table hidden. Use “Show table” when you need detailed columns.</p>
        )}
      </Panel>
    </>
  )
}
