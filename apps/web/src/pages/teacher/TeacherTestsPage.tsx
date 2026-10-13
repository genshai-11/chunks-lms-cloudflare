import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Play,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import { UserAvatar } from '../../components/UserAvatar'
import { listActiveLearners } from '../../modules/roster/service'
import { useAppState } from '../../state/useAppState'
import { useStaffSession } from '../../auth/useStaffSession'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import {
  listSelectablePackageVersions,
  listTestSections,
  type PackageKind,
  type SelectablePackageVersion,
} from '../../lib/test-packages'
import {
  createStandaloneAssignment,
  deleteStandaloneAssignment,
  getBatchStandaloneAssignmentProgress,
  listStandaloneAssignments,
  listStandaloneRuns,
  type StandaloneAssignmentProgress,
  type StandaloneTestAssignmentRow,
} from '../../lib/standalone-tests'

export function TeacherTestsPage() {
  const { roster } = useAppState()
  const staffSession = useStaffSession()
  const { options } = useTeacherClassContext()
  const navigate = useNavigate()

  const enrolledLearnerIds = useMemo(() => {
    if (staffSession.canAccess('admin')) return null
    const operableClassIds = new Set(options.map((o) => o.classRow.id))
    return new Set(
      roster.enrollments
        .filter((e) => e.status === 'active' && operableClassIds.has(e.classId))
        .map((e) => e.learnerUserId),
    )
  }, [roster.enrollments, staffSession, options])

  const learners = useMemo(() => {
    const all = listActiveLearners(roster)
    if (!enrolledLearnerIds) return all
    return all.filter((l) => enrolledLearnerIds.has(l.id))
  }, [roster, enrolledLearnerIds])
  const [learnerId, setLearnerId] = useState('')
  const [isLearnerMenuOpen, setIsLearnerMenuOpen] = useState(false)
  const [learnerSearch, setLearnerSearch] = useState('')
  const learnerDropdownRef = useRef<HTMLDivElement>(null)

  const [versionId, setVersionId] = useState('')
  const [packageKindFilter, setPackageKindFilter] = useState<'all' | 'standard' | 'mini'>('all')
  const [versions, setVersions] = useState<SelectablePackageVersion[]>([])
  const [message, setMessage] = useState('')
  const [assignments, setAssignments] = useState<StandaloneTestAssignmentRow[]>([])
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null)
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(new Set())
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [assignmentLearnerSearch, setAssignmentLearnerSearch] = useState('')
  const [assignmentPackageFilter, setAssignmentPackageFilter] = useState('all')
  const [assignmentProgress, setAssignmentProgress] = useState<Record<string, StandaloneAssignmentProgress>>({})

  const [pageSize, setPageSize] = useState<number>(10)
  const [currentPage, setCurrentPage] = useState<number>(1)

  const loadAssignments = useCallback(async () => {
    const result = await listStandaloneAssignments()
    if (result.ok) setAssignments(result.data)
    else setMessage(result.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await listSelectablePackageVersions()
      if (cancelled) return
      if (!res.ok) {
        setMessage(res.error)
        return
      }
      setVersions(res.data)
      setVersionId((current) => {
        if (current && res.data.some((v) => v.id === current)) return current
        return res.data[0]?.id ?? ''
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadAssignments()
  }, [loadAssignments])

  useEffect(() => {
    setSelectedAssignmentIds((current) => {
      const validIds = new Set(assignments.map((assignment) => assignment.id))
      return new Set(Array.from(current).filter((id) => validIds.has(id)))
    })
  }, [assignments])



  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (learnerDropdownRef.current && !learnerDropdownRef.current.contains(event.target as Node)) {
        setIsLearnerMenuOpen(false)
      }
    }
    if (isLearnerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isLearnerMenuOpen])

  useEffect(() => {
    setCurrentPage(1)
  }, [assignmentLearnerSearch, assignmentPackageFilter, assignmentStatusFilter, pageSize])

  const selectedLearner = useMemo(
    () => learners.find((l) => l.id === learnerId),
    [learners, learnerId],
  )

  const filteredLearners = useMemo(() => {
    const term = learnerSearch.trim().toLowerCase()
    if (!term) return learners
    return learners.filter(
      (l) =>
        l.displayName.toLowerCase().includes(term) ||
        (l.email && l.email.toLowerCase().includes(term)),
    )
  }, [learners, learnerSearch])

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (enrolledLearnerIds && !enrolledLearnerIds.has(assignment.learnerUserId)) return false
      if (assignmentStatusFilter !== 'all' && assignment.status !== assignmentStatusFilter) return false
      if (assignmentPackageFilter === 'standard') {
        const v = versions.find((ver) => ver.id === assignment.packageVersionId)
        if (v?.kind !== 'standard') return false
      } else if (assignmentPackageFilter === 'mini') {
        const v = versions.find((ver) => ver.id === assignment.packageVersionId)
        if (v?.kind !== 'mini') return false
      } else if (assignmentPackageFilter !== 'all' && assignment.packageVersionId !== assignmentPackageFilter) {
        return false
      }
      const q = assignmentLearnerSearch.trim().toLowerCase()
      if (!q) return true
      const learnerName = learners.find((learner) => learner.id === assignment.learnerUserId)?.displayName ?? ''
      const learnerEmail = learners.find((learner) => learner.id === assignment.learnerUserId)?.email ?? ''
      return (
        learnerName.toLowerCase().includes(q) ||
        learnerEmail.toLowerCase().includes(q) ||
        assignment.learnerUserId.toLowerCase().includes(q)
      )
    })
  }, [assignments, assignmentStatusFilter, assignmentPackageFilter, versions, assignmentLearnerSearch, learners])

  async function start() {
    if (!learnerId || !versionId) {
      setMessage('Select one Learner and one published Package Version.')
      return
    }
    const assignment = await createStandaloneAssignment(learnerId, versionId)
    if (!assignment.ok) {
      setMessage(assignment.error)
      return
    }
    const sections = await listTestSections(versionId)
    if (!sections.ok || !sections.data[0]) {
      setMessage(sections.ok ? 'Package has no sessions.' : sections.error)
      return
    }
    navigate(`/teacher/tests/${assignment.data}/sections/${sections.data[0].id}/setup`)
  }

  async function openOrResumeAssignment(assignment: StandaloneTestAssignmentRow) {
    setBusyAssignmentId(assignment.id)
    setMessage('')
    const runs = await listStandaloneRuns(assignment.id)
    if (!runs.ok) {
      setBusyAssignmentId(null)
      setMessage(runs.error)
      return
    }
    const resumable = runs.data.find((run) => ['in_progress', 'ready', 'draft'].includes(run.status))
    const latestRun = [...runs.data].sort((a, b) => b.sessionNumber - a.sessionNumber || b.attemptNumber - a.attemptNumber)[0]
    const targetRun = resumable ?? latestRun
    if (targetRun) {
      setBusyAssignmentId(null)
      navigate(`/teacher/test-runs/${targetRun.id}?assignmentId=${assignment.id}`)
      return
    }
    const sections = await listTestSections(assignment.packageVersionId)
    setBusyAssignmentId(null)
    if (!sections.ok || !sections.data[0]) {
      setMessage(sections.ok ? 'Package has no sessions.' : sections.error)
      return
    }
    navigate(`/teacher/tests/${assignment.id}/sections/${sections.data[0].id}/setup`)
  }

  async function removeAssignment(assignment: StandaloneTestAssignmentRow) {
    const learnerName = learners.find((l) => l.id === assignment.learnerUserId)?.displayName ?? 'this learner'
    if (
      !window.confirm(
        `Delete standalone test assignment #${assignment.assignmentNumber} for ${learnerName}? This removes its runs, item attempts, events, and snapshots.`,
      )
    ) {
      return
    }
    setBusyAssignmentId(assignment.id)
    const result = await deleteStandaloneAssignment(assignment.id)
    setBusyAssignmentId(null)
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setSelectedAssignmentIds((current) => {
      const next = new Set(current)
      next.delete(assignment.id)
      return next
    })
    setMessage('Deleted standalone test assignment.')
    await loadAssignments()
  }

  function toggleAssignmentSelection(assignmentId: string) {
    setSelectedAssignmentIds((current) => {
      const next = new Set(current)
      if (next.has(assignmentId)) next.delete(assignmentId)
      else next.add(assignmentId)
      return next
    })
  }

  async function removeSelectedAssignments() {
    const selectedAssignments = filteredAssignments.filter((assignment) => selectedAssignmentIds.has(assignment.id))
    if (selectedAssignments.length === 0) return
    if (
      !window.confirm(
        `Delete ${selectedAssignments.length} standalone test assignment${selectedAssignments.length === 1 ? '' : 's'}? This removes their runs, item attempts, events, and snapshots.`,
      )
    ) {
      return
    }
    for (const assignment of selectedAssignments) {
      setBusyAssignmentId(assignment.id)
      const result = await deleteStandaloneAssignment(assignment.id)
      if (!result.ok) {
        setBusyAssignmentId(null)
        setMessage(result.error)
        return
      }
    }
    setBusyAssignmentId(null)
    setSelectedAssignmentIds(new Set())
    setMessage(`Deleted ${selectedAssignments.length} standalone test assignment${selectedAssignments.length === 1 ? '' : 's'}.`)
    await loadAssignments()
  }

  const totalAssignments = filteredAssignments.length
  const totalPages = Math.max(1, Math.ceil(totalAssignments / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalAssignments)
  const paginatedAssignments = useMemo(
    () => filteredAssignments.slice(startIndex, endIndex),
    [filteredAssignments, startIndex, endIndex],
  )

  useEffect(() => {
    let cancelled = false
    const activePageAssignments = paginatedAssignments.filter((a) => a.status === 'active')
    const missingAssignments = activePageAssignments.filter((a) => !assignmentProgress[a.id])

    if (missingAssignments.length === 0) return

    void (async () => {
      const missingIds = missingAssignments.map((a) => a.id)
      const res = await getBatchStandaloneAssignmentProgress(missingIds)
      if (cancelled || !res.ok) return

      const updates: Record<string, StandaloneAssignmentProgress> = {}
      for (const assignment of missingAssignments) {
        const prog = res.data[assignment.id]
        const version = versions.find((v) => v.id === assignment.packageVersionId)
        const baseline = version?.questionCount ?? (version?.kind === 'mini' ? 21 : 49)
        const completedQuestions = prog?.completedQuestions ?? 0
        const totalQuestions =
          prog && prog.totalQuestions > 0 ? Math.max(prog.totalQuestions, baseline) : baseline

        updates[assignment.id] = {
          assignmentId: assignment.id,
          completedQuestions,
          totalQuestions,
        }
      }

      if (!cancelled) {
        setAssignmentProgress((prev) => ({ ...prev, ...updates }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [paginatedAssignments, assignmentProgress, versions])

  const pageAssignmentIds = paginatedAssignments.map((assignment) => assignment.id)
  const allPageSelected = pageAssignmentIds.length > 0 && pageAssignmentIds.every((id) => selectedAssignmentIds.has(id))
  const allFilteredSelected = filteredAssignments.length > 0 && filteredAssignments.every((a) => selectedAssignmentIds.has(a.id))
  const selectedCount = Array.from(selectedAssignmentIds).filter((id) =>
    assignments.some((a) => a.id === id)
  ).length
  const statusBadgeClass = (status: string) => {
    if (status === 'completed') return 'badge completed'
    if (status === 'active') return 'badge success'
    return 'badge info'
  }
  const packageLabel = (versionId: string) =>
    versions.find((version) => version.id === versionId)?.label ?? 'Unknown package'

  const assignmentKind = (verId: string): PackageKind =>
    versions.find((v) => v.id === verId)?.kind ?? 'standard'

  const selectableVersions = useMemo(() => {
    if (packageKindFilter === 'all') return versions
    return versions.filter((v) => v.kind === packageKindFilter)
  }, [versions, packageKindFilter])

  useEffect(() => {
    if (selectableVersions.length > 0) {
      const exists = selectableVersions.some((v) => v.id === versionId)
      if (!exists) {
        setVersionId(selectableVersions[0].id)
      }
    } else {
      setVersionId('')
    }
  }, [selectableVersions, versionId])

  const progressLabel = (assignmentId: string) => {
    const progress = assignmentProgress[assignmentId] ?? {
      assignmentId,
      completedQuestions: 0,
      totalQuestions: 0,
    }
    const pct = progress.totalQuestions
      ? Math.round((progress.completedQuestions / progress.totalQuestions) * 100)
      : 0
    return `${pct}% complete · ${progress.completedQuestions}/${progress.totalQuestions} questions`
  }

  return (
    <div className="tests-page">
      <PageHeader
        icon={ClipboardCheck}
        kicker="Teacher"
        title="Tests 1-1"
        subtitle="One Learner · standalone package sessions · dedicated test room and analysis."
      />
      <Panel
        icon={Play}
        title="New one-to-one Test"
        description="Select exactly one active Learner and a published canonical package."
        collapsible={false}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <span className="text-xs font-bold text-slate-700">Loại bài test:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                type="button"
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  packageKindFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/50'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setPackageKindFilter('all')}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                  packageKindFilter === 'standard'
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                onClick={() => setPackageKindFilter('standard')}
              >
                Standard (49 câu)
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                  packageKindFilter === 'mini'
                    ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                onClick={() => setPackageKindFilter('mini')}
              >
                ⚡ Mini-test (21 câu)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="learner-select" className="text-xs font-bold text-slate-700">
                Learner
              </label>
              <div ref={learnerDropdownRef} className="relative">
                <select
                  id="learner-select"
                  aria-label="Learner"
                  value={learnerId}
                  onChange={(event) => setLearnerId(event.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <option value="">Select Learner</option>
                  {learners.map((learner) => (
                    <option key={learner.id} value={learner.id}>
                      {learner.displayName}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsLearnerMenuOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={isLearnerMenuOpen}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-xs shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 transition-all flex items-center justify-between cursor-pointer"
                >
                  {selectedLearner ? (
                    <span className="flex items-center gap-2 truncate">
                      <UserAvatar name={selectedLearner.displayName} avatarUrl={selectedLearner.avatarUrl} size="sm" />
                      <span className="truncate">{selectedLearner.displayName}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-slate-400 font-normal">
                      <UserRound className="h-4 w-4" /> Chọn học viên...
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isLearnerMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isLearnerMenuOpen && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200/90 p-2 overflow-hidden">
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:bg-white text-slate-900 font-medium placeholder:text-slate-400"
                        placeholder="Tìm học viên theo tên..."
                        value={learnerSearch}
                        onChange={(e) => setLearnerSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                          !learnerId
                            ? 'bg-slate-100 text-slate-900 font-bold'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        onClick={() => {
                          setLearnerId('')
                          setIsLearnerMenuOpen(false)
                          setLearnerSearch('')
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-slate-400" />
                          <span>Select Learner</span>
                        </span>
                        {!learnerId && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                      </button>
                      {filteredLearners.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-slate-400 font-normal">
                          Không tìm thấy học viên
                        </div>
                      ) : (
                        filteredLearners.map((learner) => {
                          const isSelected = learner.id === learnerId
                          return (
                            <button
                              key={learner.id}
                              type="button"
                              className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50/80 text-indigo-950 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                              }`}
                              onClick={() => {
                                setLearnerId(learner.id)
                                setIsLearnerMenuOpen(false)
                                setLearnerSearch('')
                              }}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <UserAvatar name={learner.displayName} avatarUrl={learner.avatarUrl} size="sm" />
                                <span className="truncate">{learner.displayName}</span>
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="package-select" className="text-xs font-bold text-slate-700">
                Package
              </label>
              <select
                id="package-select"
                aria-label="Package"
                value={versionId}
                onChange={(event) => setVersionId(event.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-xs shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
              >
                <option value="">Select published package</option>
                {selectableVersions.map((v) => (
                  <option key={v.id} value={v.id} className="py-1 font-semibold text-slate-800">
                    {v.testType === 'green' ? '🟢 ' : '🔴 '} {v.label} ({v.kind === 'mini' ? 'Mini · 21 câu' : 'Standard · 49 câu'})
                  </option>
                ))}
              </select>

              {(() => {
                const sel = versions.find((v) => v.id === versionId)
                if (!sel) return null
                return (
                  <div className="flex flex-wrap items-center gap-2 pt-1.5 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] tracking-wider shrink-0 ${
                        sel.testType === 'green'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {sel.testType} test
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {sel.label}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold shrink-0 ${
                        sel.kind === 'mini'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {sel.kind === 'mini' ? '⚡ Mini · 21 câu hỏi (7 session x 3 câu)' : 'Standard · 49 câu hỏi (7 session x 7 câu)'}
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
        {message ? <p className="meta text-slate-600">{message}</p> : null}
        <button className="primary" onClick={() => void start()} disabled={!learnerId || !versionId}>
          <Play className="h-4 w-4" /> Create assignment
        </button>
      </Panel>

      <Panel
        icon={UserRound}
        title="Assignments"
        description="Delete old test trials or open dedicated standalone analysis."
        actions={assignments.length > 0 ? (
          <div className="test-assignment-bulk-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (allFilteredSelected) {
                  setSelectedAssignmentIds(new Set())
                } else {
                  setSelectedAssignmentIds(new Set(filteredAssignments.map((a) => a.id)))
                }
              }}
            >
              {allFilteredSelected ? 'Clear' : 'Select all'}
            </button>
            <button
              type="button"
              className="ghost danger"
              onClick={() => void removeSelectedAssignments()}
              disabled={selectedCount === 0 || busyAssignmentId !== null}
            >
              <Trash2 className="h-4 w-4" /> Delete selected {selectedCount ? `(${selectedCount})` : ''}
            </button>
          </div>
        ) : null}
        collapsible={false}
      >
        {assignments.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No standalone assignments" />
        ) : (
          <>
            <div className="analysis-filter-row mb-3">
              <label className="analysis-filter-block analysis-filter-grow">
                <span className="analysis-filter-label">Search learner</span>
                <input
                  className="analysis-select"
                  type="search"
                  value={assignmentLearnerSearch}
                  onChange={(event) => setAssignmentLearnerSearch(event.target.value)}
                  placeholder="Name, email, or learner ID"
                />
              </label>
              <label className="analysis-filter-block">
                <span className="analysis-filter-label">Package test</span>
                <select
                  className="analysis-select"
                  value={assignmentPackageFilter}
                  onChange={(event) => setAssignmentPackageFilter(event.target.value)}
                >
                  <option value="all">All packages</option>
                  <option value="standard">Standard tests (49Q)</option>
                  <option value="mini">Mini-tests (21Q)</option>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="analysis-filter-block">
                <span className="analysis-filter-label">Status</span>
                <select
                  className="analysis-select"
                  value={assignmentStatusFilter}
                  onChange={(event) => setAssignmentStatusFilter(event.target.value as typeof assignmentStatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>

            {filteredAssignments.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No assignments match filters" description="Clear search or switch filters." />
            ) : (
              <>
                <div className="table-wrap">
                <table>
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={() => {
                        setSelectedAssignmentIds((current) => {
                          const next = new Set(current)
                          if (allPageSelected) {
                            for (const id of pageAssignmentIds) next.delete(id)
                          } else {
                            for (const id of pageAssignmentIds) next.add(id)
                          }
                          return next
                        })
                      }}
                      aria-label={allPageSelected ? 'Clear selected assignments on this page' : 'Select all assignments on this page'}
                    />
                  </th>
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAssignments.map((assignment) => (
                  <tr key={assignment.id} className={selectedAssignmentIds.has(assignment.id) ? 'is-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedAssignmentIds.has(assignment.id)}
                        onChange={() => toggleAssignmentSelection(assignment.id)}
                        aria-label={`Select assignment #${assignment.assignmentNumber}`}
                      />
                    </td>
                    <td>
                      <strong>
                        {learners.find((learner) => learner.id === assignment.learnerUserId)?.displayName ??
                          assignment.learnerUserId}
                      </strong>
                      <div className="test-assignment-meta flex items-center gap-1.5 mt-0.5">
                        <span>{packageLabel(assignment.packageVersionId)}</span>
                        {assignmentKind(assignment.packageVersionId) === 'mini' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                            Mini · 21Q
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            Standard · 49Q
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={statusBadgeClass(assignment.status)}>{assignment.status}</span>
                      {assignment.status === 'active' ? (
                        <div className="test-assignment-meta">{progressLabel(assignment.id)}</div>
                      ) : null}
                    </td>
                    <td className="test-assignment-date">
                      {new Date(assignment.assignedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="test-assignment-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void openOrResumeAssignment(assignment)}
                          disabled={busyAssignmentId === assignment.id}
                          title="Open or resume the latest test session"
                        >
                          {assignment.status === 'completed' ? <ExternalLink className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} Open
                        </button>
                        <Link
                          className="btn ghost"
                          to={`/teacher/tests/analysis/${assignment.id}`}
                          title="Open standalone analysis"
                        >
                          <BarChart3 className="h-4 w-4" /> Analysis
                        </Link>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => void removeAssignment(assignment)}
                          disabled={busyAssignmentId === assignment.id}
                          title="Delete assignment"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border border-slate-200/90 rounded-xl text-xs text-slate-600">
                <div className="font-medium text-slate-600">
                  Hiển thị <strong className="text-slate-900">{totalAssignments === 0 ? 0 : startIndex + 1}–{endIndex}</strong> trên <strong className="text-slate-900">{totalAssignments}</strong> bài test
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Hiển thị</span>
                  <select
                    aria-label="Số bài test mỗi trang"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold text-xs shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                  >
                    <option value={10}>10 bài / trang</option>
                    <option value={25}>25 bài / trang</option>
                    <option value={50}>50 bài / trang</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Trang trước"
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 font-bold text-slate-800">
                    Trang {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Trang sau"
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
