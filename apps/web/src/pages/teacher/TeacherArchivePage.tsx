import { useMemo, useState } from 'react'
import {
  Archive,
  CalendarDays,
  Clock,
  Filter,
  Search,
  Users,
  Zap,
} from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import { UserAvatar } from '../../components/UserAvatar'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { buildSessionArchive, learnerNameMap } from '../../modules/ops/session-archive'
import { SPECTRUM_COLORS, type ResultColor } from '../../modules/result-lifecycle/types'
import { useAppState } from '../../state/useAppState'

const COLOR_HEX: Record<ResultColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#38bdf8',
  indigo: '#6366f1',
  purple: '#a855f7',
}

const COLOR_LABELS: Record<ResultColor, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  indigo: 'Indigo',
  purple: 'Purple',
}

const COLOR_PILL_STYLES: Record<
  ResultColor,
  { bg: string; text: string; border: string; dot: string }
> = {
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  blue: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
}

/**
 * Completed learning days for the active class — read-only color heatmap and archive.
 */
export function TeacherArchivePage() {
  const { roster, scheduling, ledger } = useAppState()
  const { classRow, course } = useTeacherClassContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [colorFilter, setColorFilter] = useState<'all' | ResultColor | 'probed'>('all')
  const [learnerFilter, setLearnerFilter] = useState<'all' | string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const archive = useMemo(
    () =>
      classRow ? buildSessionArchive(roster, scheduling, ledger, classRow.id) : [],
    [roster, scheduling, ledger, classRow],
  )

  const names = useMemo(() => learnerNameMap(roster), [roster])
  const selected =
    archive.find((d) => d.learningSession.id === selectedId) ?? archive[archive.length - 1] ?? null

  const sessionLearners = useMemo(() => {
    if (!selected) return []
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const cell of selected.cells) {
      const existing = map.get(cell.learnerUserId)
      const name = names.get(cell.learnerUserId) ?? 'Learner'
      if (existing) {
        existing.count++
      } else {
        map.set(cell.learnerUserId, {
          id: cell.learnerUserId,
          name,
          count: 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [selected, names])

  const selectedLearnerInfo = useMemo(() => {
    if (!selected || learnerFilter === 'all') return null
    const user = roster.users.find((u) => u.id === learnerFilter)
    const name = names.get(learnerFilter) ?? user?.displayName ?? 'Learner'
    const learnerCells = selected.cells.filter((c) => c.learnerUserId === learnerFilter)
    const colorBreakdown = Object.fromEntries(SPECTRUM_COLORS.map((col) => [col, 0])) as Record<
      ResultColor,
      number
    >
    let probedCount = 0
    for (const c of learnerCells) {
      if (c.color && c.color in colorBreakdown) colorBreakdown[c.color]++
      if (c.enteredProbeFlow) probedCount++
    }
    return {
      user,
      name,
      totalQuestions: learnerCells.length,
      probedCount,
      colorBreakdown,
    }
  }, [selected, learnerFilter, roster.users, names])

  const dayColorCounts = useMemo(() => {
    const c = Object.fromEntries(SPECTRUM_COLORS.map((col) => [col, 0])) as Record<
      ResultColor,
      number
    >
    if (!selected) return c
    for (const cell of selected.cells) {
      if (cell.color && cell.color in c) {
        c[cell.color]++
      }
    }
    return c
  }, [selected])

  const filterCounts = useMemo(() => {
    if (!selected) {
      return { all: 0, red: 0, yellow: 0, green: 0, purple: 0, probed: 0 }
    }
    const counts = {
      all: selected.cells.length,
      red: 0,
      yellow: 0,
      green: 0,
      purple: 0,
      probed: 0,
    }
    for (const cell of selected.cells) {
      if (cell.enteredProbeFlow) counts.probed++
      if (cell.color === 'red') counts.red++
      if (cell.color === 'yellow') counts.yellow++
      if (cell.color === 'green') counts.green++
      if (cell.color === 'purple') counts.purple++
    }
    return counts
  }, [selected])

  const filteredCells = useMemo(() => {
    if (!selected) return []
    const query = searchQuery.trim().toLowerCase()
    return selected.cells.filter((cell) => {
      if (learnerFilter !== 'all' && cell.learnerUserId !== learnerFilter) {
        return false
      }
      if (query) {
        const name = (names.get(cell.learnerUserId) ?? '').toLowerCase()
        if (!name.includes(query)) return false
      }
      if (colorFilter === 'all') return true
      if (colorFilter === 'probed') return cell.enteredProbeFlow
      return cell.color === colorFilter
    })
  }, [selected, learnerFilter, searchQuery, colorFilter, names])

  if (!classRow) {
    return (
      <>
        <PageHeader icon={Archive} kicker="Teacher" title="Session archive" />
        <EmptyState icon={Archive} title="No class selected" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        icon={Archive}
        kicker={course?.code ?? 'Class'}
        title="Session archive"
        subtitle={`${classRow.name} — completed days, observation heatmap, and probe flow archive`}
      />

      {archive.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No learning sessions yet"
          description="Start a live session from Schedule; completed days appear here."
        />
      ) : (
        <div className="archive-layout">
          {/* Left panel: Learning days list */}
          <Panel icon={CalendarDays} title="Learning days" description="Select a completed day.">
            <div className="flex flex-col gap-2">
              {archive.map((day) => {
                const active = selected?.learningSession.id === day.learningSession.id
                const isCompleted = day.learningSession.status === 'completed'
                return (
                  <button
                    key={day.learningSession.id}
                    type="button"
                    className={`w-full text-left rounded-xl border p-3.5 transition-all cursor-pointer flex flex-col gap-1.5 shadow-3xs ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/20 text-indigo-950 ring-2 ring-indigo-600/10'
                        : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60 text-slate-800'
                    }`}
                    onClick={() => {
                      setSelectedId(day.learningSession.id)
                      setColorFilter('all')
                      setLearnerFilter('all')
                      setSearchQuery('')
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-bold text-slate-900 tracking-tight">
                        {day.dayLabel}
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {day.learningSession.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {day.resultCount} finalized results
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {day.attendancePresent}/{day.attendanceTotal} present
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {new Date(day.learningSession.startedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        ·{' '}
                        {new Date(day.learningSession.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Panel>

          {/* Right panel: Day detail, summary bar, quick filters, and interactive heatmap */}
          <Panel
            icon={Archive}
            title={selected ? selected.dayLabel : 'Day detail'}
            description="Read-only heatmap of finalized colors and probe pathways."
          >
            {!selected || selected.cells.length === 0 ? (
              <EmptyState
                icon={Archive}
                title="No finalized results"
                description="This day has no finalized observations yet."
              />
            ) : (
              <div>
                {/* Day Overview Summary Strip */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-3xs mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight m-0">
                          {selected.dayLabel}
                        </h3>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs font-medium text-slate-500">
                          {new Date(selected.learningSession.startedAt).toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${
                            selected.learningSession.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {selected.learningSession.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Started at{' '}
                        {new Date(selected.learningSession.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Finalized
                        </span>
                        <strong className="text-slate-900 text-sm font-mono">
                          {selected.resultCount}
                        </strong>
                      </div>
                      <div className="text-right border-l border-slate-100 pl-4">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Attendance
                        </span>
                        <strong className="text-slate-900 text-sm font-mono">
                          {selected.attendancePresent}/{selected.attendanceTotal}
                        </strong>
                      </div>
                      <div className="text-right border-l border-slate-100 pl-4">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Probed
                        </span>
                        <strong className="text-amber-600 text-sm font-mono">
                          {filterCounts.probed}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* 7-Color breakdown segmented bar */}
                  <div>
                    <div className="h-2 w-full flex overflow-hidden rounded-full bg-slate-100 border border-slate-200/80 mb-2.5">
                      {SPECTRUM_COLORS.map((col) => {
                        const count = dayColorCounts[col]
                        if (count === 0) return null
                        const pctVal = (count / selected.cells.length) * 100
                        return (
                          <div
                            key={col}
                            style={{ width: `${pctVal}%`, backgroundColor: COLOR_HEX[col] }}
                            className="h-full transition-all"
                            title={`${COLOR_LABELS[col]}: ${count} (${Math.round(pctVal)}%)`}
                          />
                        )
                      })}
                    </div>

                    {/* Quick 7-color breakdown pill bar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SPECTRUM_COLORS.map((col) => {
                        const count = dayColorCounts[col]
                        const isFilterActive = colorFilter === col
                        return (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setColorFilter(isFilterActive ? 'all' : col)}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer border ${
                              isFilterActive
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : count > 0
                                  ? 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                                  : 'bg-slate-50/40 text-slate-400 border-slate-200/40 opacity-50'
                            }`}
                            title={`Filter by ${COLOR_LABELS[col]}`}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: COLOR_HEX[col] }}
                            />
                            <span>{COLOR_LABELS[col]}</span>
                            <span
                              className={`font-mono text-[10px] ${
                                isFilterActive ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Quick Filters: Color Chips + Learner Dropdown + Learner Name Search */}
                <div className="mb-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 bg-white shadow-3xs">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label="Question filters"
                  >
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'all'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter('all')}
                    >
                      All ({filterCounts.all})
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'red'
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')}
                    >
                      <span className="mr-1">🔴</span>
                      Red ({filterCounts.red})
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'yellow'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')}
                    >
                      <span className="mr-1">🟡</span>
                      Yellow ({filterCounts.yellow})
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'green'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')}
                    >
                      <span className="mr-1">🟢</span>
                      Green ({filterCounts.green})
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'purple'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter(colorFilter === 'purple' ? 'all' : 'purple')}
                    >
                      <span className="mr-1">🟣</span>
                      Purple ({filterCounts.purple})
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        colorFilter === 'probed'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setColorFilter(colorFilter === 'probed' ? 'all' : 'probed')}
                    >
                      <span className="mr-1">🔍</span>
                      Probed Only ({filterCounts.probed})
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Dedicated Learner Filter Select */}
                    <div className="relative min-w-[180px]">
                      <select
                        value={learnerFilter}
                        onChange={(e) => setLearnerFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-3xs cursor-pointer appearance-none"
                        aria-label="Filter by learner"
                      >
                        <option value="all">
                          All Learners (Cả lớp) ({selected.cells.length})
                        </option>
                        {sessionLearners.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.count} câu)
                          </option>
                        ))}
                      </select>
                      <Users className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    </div>

                    {/* Search Input */}
                    <div className="relative min-w-[160px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-3xs"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Heatmap / Question Cards */}
                {filteredCells.length === 0 ? (
                  <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-3xs">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
                      <Filter className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 mb-1">
                      No matching observations found
                    </h4>
                    <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                      No observations match your current search query or color filter.
                    </p>
                    <button
                      type="button"
                      className="btn secondary text-xs px-3 py-1.5"
                      onClick={() => {
                        setSearchQuery('')
                        setColorFilter('all')
                        setLearnerFilter('all')
                      }}
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Single Learner Profile Header when a specific learner is filtered */}
                    {selectedLearnerInfo && (
                      <div className="mb-4 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 shadow-3xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={selectedLearnerInfo.name}
                            avatarUrl={selectedLearnerInfo.user?.avatarUrl}
                            size="md"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 tracking-tight m-0">
                                {selectedLearnerInfo.name}
                              </h4>
                              <span className="text-[10px] font-mono text-slate-400">
                                {selectedLearnerInfo.user?.id.slice(0, 8)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              <strong>{selectedLearnerInfo.totalQuestions}</strong> questions completed in this session
                              {selectedLearnerInfo.probedCount > 0 ? (
                                <span> · <strong className="text-amber-600">{selectedLearnerInfo.probedCount}</strong> probed</span>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        {/* Learner's color breakdown pills */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {SPECTRUM_COLORS.map((col) => {
                            const count = selectedLearnerInfo.colorBreakdown[col]
                            if (count === 0) return null
                            const pill = COLOR_PILL_STYLES[col]
                            return (
                              <span
                                key={col}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${pill.bg} ${pill.text} ${pill.border}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                                <span>{COLOR_LABELS[col]}:</span>
                                <strong className="font-mono">{count}</strong>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Streamlined compact grid */}
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5"
                      role="list"
                      aria-label="Result map"
                    >
                      {filteredCells.map((cell) => {
                        const learnerName = names.get(cell.learnerUserId) ?? 'Learner'
                        const pillStyle = cell.color ? COLOR_PILL_STYLES[cell.color] : null

                        return (
                          <div
                            key={`${cell.sessionQuestionId}-${cell.learnerUserId}`}
                            className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-3xs hover:border-slate-300 hover:shadow-2xs transition-all flex items-center justify-between gap-2"
                            role="listitem"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
                                Q{cell.sequenceHint}
                              </span>
                              {learnerFilter === 'all' && (
                                <span
                                  className="bg-slate-100 text-slate-700 font-medium text-xs px-2 py-0.5 rounded truncate max-w-[120px]"
                                  title={learnerName}
                                >
                                  {learnerName}
                                </span>
                              )}
                              {cell.enteredProbeFlow && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                                  title={`Probe event depth: ${cell.probeEventCount}`}
                                >
                                  <Zap className="h-2.5 w-2.5" />
                                  <span>Probe x{cell.probeEventCount}</span>
                                </span>
                              )}
                            </div>

                            {cell.color && pillStyle ? (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${pillStyle.bg} ${pillStyle.text} border ${pillStyle.border}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${pillStyle.dot}`} />
                                <span className="capitalize">{COLOR_LABELS[cell.color]}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic shrink-0">No color</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}
