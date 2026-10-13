import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CircleDot,
  Eye,
  EyeOff,
  Gauge,
  GripVertical,
  Layers,
  LineChart as LineChartIcon,
  List,
  Maximize2,
  Minimize2,
  PieChart as PieChartIcon,
  RotateCcw,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart as RechartsPieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Panel } from './ui'
import {
  calculateSpectrumStepBreakdown,
  colorForAvgPercentX,
  COLOR_PERCENT_X_VALUES,
  spectrumRecordsForAttempt,
} from '../modules/metrics/calculate'
import type { MetricSettingsState } from '../modules/metrics/settings'
import type { ResultRecord } from '../modules/reporting/progress'
import { sessionLabel } from '../modules/reporting/session-series'
import {
  COOL_COLORS,
  SPECTRUM_COLORS,
  WARM_COLORS,
  type ResultColor,
} from '../modules/result-lifecycle/types'

export type AnalysisChartKind = 'line' | 'bar' | 'area' | 'composed' | 'pie'

export type SessionOpt = {
  id: string
  startedAt: string
  completedAt: string | null
  sessionNumber?: number | null
}

export type Props = {
  ledger: ResultRecord[]
  learningSessions: SessionOpt[]
  courseId: string
  classId?: string
  learnerUserId?: string
  totalDays?: number | null
  /** Compact: hide advanced multi-metric toggles */
  compact?: boolean
  /** Admin-enabled metrics control which chips appear */
  metricSettings?: MetricSettingsState
}

export type ChartKey = 'tube' | 'mix' | 'sessionPercentC' | 'distribution'
export type SessionChartType = 'bar' | 'line' | 'list'
export type ChartUiState = Record<ChartKey, { showLabels: boolean; expanded: boolean; hidden: boolean }>

const DEFAULT_CHART_UI: ChartUiState = {
  tube: { showLabels: true, expanded: false, hidden: false },
  mix: { showLabels: true, expanded: false, hidden: false },
  sessionPercentC: { showLabels: true, expanded: false, hidden: false },
  distribution: { showLabels: true, expanded: false, hidden: false },
}

const DEFAULT_CHART_ORDER: ChartKey[] = ['tube', 'mix', 'sessionPercentC', 'distribution']

const CHART_NAMES: Record<ChartKey, string> = {
  tube: 'Record Tube',
  mix: '7-Color Record Mix',
  sessionPercentC: '%c theo Session',
  distribution: 'Color Distribution',
}

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

const COLOR_GROUPS = {
  warm: [...WARM_COLORS] as ResultColor[],
  cool: [...COOL_COLORS] as ResultColor[],
}

const METRIC_HEX = {
  rfc: '#ef4444',
  percentC: '#16a34a',
  attempts: '#38bdf8',
}

function recordLabel(color: ResultColor, index: number, total: number): string {
  if (index === 1 && color === 'green') return `Record ${index}/${total}: Green primary opens probe flow`
  if (color === 'blue') return `Record ${index}/${total}: Blue probe Continue`
  if (color === 'yellow') return `Record ${index}/${total}: Yellow probe Fail`
  if (color === 'indigo') return `Record ${index}/${total}: Indigo probe Done`
  return `Record ${index}/${total}: ${COLOR_LABELS[color]} primary`
}

/**
 * Interactive Live Analysis Workbench:
 * - Attempt Record Tube Chart (horizontal scroll container with stacked beads from spectrumRecordsForAttempt)
 * - 7-Color Record Mix by Day (stacked bar chart across all 7 spectrum colors)
 * - Trend Chart with Brush (scrubbing/zooming across days for RFC & %c)
 * - Combo Chart with Brush (RFC, %c, Chunks Count, and Probe Depth)
 * - Result Color Distribution Pie Chart
 * - Workbench Controls (drag-and-drop reorder, expand/shrink, toggle labels, hide/show, reset layout)
 * - Filters: Sessions (All vs D1..DN) and Colors (All, Warm, Cool, individual)
 */
export function AnalysisChartsPanel({
  ledger,
  learningSessions,
  courseId,
  classId,
  learnerUserId,
  totalDays,
  compact = false,
}: Props) {
  const [selectedSessions, setSelectedSessions] = useState<number[]>([])
  const [selectedColors, setSelectedColors] = useState<ResultColor[]>([...SPECTRUM_COLORS])
  const [chartUi, setChartUi] = useState<ChartUiState>(DEFAULT_CHART_UI)
  const [chartOrder, setChartOrder] = useState<ChartKey[]>(DEFAULT_CHART_ORDER)
  const [draggingChart, setDraggingChart] = useState<ChartKey | null>(null)
  const [sessionGroupMode, setSessionGroupMode] = useState<'dynamic' | 'day'>('dynamic')
  const [dynamicChunkSize, setDynamicChunkSize] = useState<number>(10)
  const [sessionChartType, setSessionChartType] = useState<SessionChartType>('bar')
  const [metricVisibility, setMetricVisibility] = useState({
    rfc: true,
    percentC: true,
    chunks: true,
    probeDepth: true,
  })

  const visibleMetricCount = useMemo(() => {
    return Object.values(metricVisibility).filter(Boolean).length
  }, [metricVisibility])

  const toggleMetric = (key: keyof typeof metricVisibility) => {
    setMetricVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }
  const filterCardRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function closeFilters(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && filterCardRef.current?.contains(target)) return
      filterCardRef.current?.querySelectorAll('details[open]').forEach((detail) => detail.removeAttribute('open'))
    }
    window.addEventListener('pointerdown', closeFilters)
    return () => window.removeEventListener('pointerdown', closeFilters)
  }, [])

  // Map and sort all finalized attempts matching course, class, and learner filters
  const attempts = useMemo(() => {
    const sessionMap = new Map<string, SessionOpt>()
    for (const s of learningSessions) {
      sessionMap.set(s.id, s)
    }

    const scoped = ledger.filter((r) => {
      if (r.courseId !== courseId) return false
      if (classId && r.classId !== classId) return false
      if (learnerUserId && r.learnerUserId !== learnerUserId) return false
      return true
    })

    const sorted = [...scoped].sort((a, b) => {
      const sA = sessionMap.get(a.learningSessionId)
      const sB = sessionMap.get(b.learningSessionId)
      const numA = sA?.sessionNumber ?? 0
      const numB = sB?.sessionNumber ?? 0
      if (numA !== numB) return numA - numB
      return new Date(a.finalizedAt).getTime() - new Date(b.finalizedAt).getTime()
    })

    return sorted.map((r, index) => {
      const session = sessionMap.get(r.learningSessionId)
      const sessionNumber = session?.sessionNumber ?? 1
      const color = r.effectiveColor
      const enteredProbeFlow = Boolean(r.enteredProbeFlow)
      const probeEventCount = Math.max(0, r.probeEventCount ?? 0)

      return {
        id: r.id,
        index: index + 1,
        label: `Attempt ${index + 1}`,
        shortLabel: `A${index + 1}`,
        session: sessionNumber,
        sessionId: r.learningSessionId,
        sessionLabel: sessionLabel(sessionNumber, session?.startedAt, totalDays),
        shortSessionLabel: `D${sessionNumber}`,
        color,
        colorHex: COLOR_HEX[color],
        enteredProbeFlow,
        probeEventCount,
        finalizedAt: r.finalizedAt,
      }
    })
  }, [ledger, learningSessions, courseId, classId, learnerUserId, totalDays])

  const availableSessions = useMemo(() => {
    const list = Array.from(new Set(attempts.map((a) => a.session))).sort((a, b) => a - b)
    if (list.length > 0) return list
    return learningSessions
      .map((s, idx) => s.sessionNumber ?? idx + 1)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b)
  }, [attempts, learningSessions])

  // Attempts filtered by selected session chips and color chips
  const chartAttempts = useMemo(() => {
    const sessionSet = selectedSessions.length ? new Set(selectedSessions) : null
    const colorSet = new Set<ResultColor>(selectedColors)
    return attempts.filter((row) => {
      if (sessionSet && !sessionSet.has(row.session)) return false
      if (!colorSet.has(row.color)) return false
      return true
    })
  }, [attempts, selectedColors, selectedSessions])

  // Summary KPIs for live scope (RFC, %c, sample size, N_total)
  const summary = useMemo(() => {
    const count = chartAttempts.length
    const spectrum = calculateSpectrumStepBreakdown(
      chartAttempts.map((a) => ({
        effectiveColor: a.color,
        enteredProbeFlow: a.enteredProbeFlow,
        probeEventCount: a.probeEventCount,
      })),
    )
    const avgXColor = colorForAvgPercentX(spectrum.avgPercentX)

    return {
      sampleSize: count,
      totalRecords: spectrum.totalRecords,
      warmSteps: spectrum.warmSteps,
      coolSteps: spectrum.coolSteps,
      rfc: spectrum.rfc == null ? 0 : spectrum.rfc * 100,
      percentC: spectrum.avgPercentX ?? 0,
      legacyRac: spectrum.rac == null ? 0 : spectrum.rac * 100,
      avgPercentX: spectrum.avgPercentX ?? 0,
      sumPercentX: spectrum.sumPercentX,
      avgXColor,
    }
  }, [chartAttempts])

  // Tube rows: each attempt holds its vertical stack of spectrum records
  const recordTubeRows = useMemo(() => {
    return chartAttempts.map((attempt) => {
      const records = spectrumRecordsForAttempt({
        effectiveColor: attempt.color,
        enteredProbeFlow: attempt.enteredProbeFlow,
        probeEventCount: attempt.probeEventCount,
      }).map((color, idx, all) => ({
        color,
        index: idx + 1,
        label: recordLabel(color, idx + 1, all.length),
      }))

      return {
        ...attempt,
        records,
      }
    })
  }, [chartAttempts])

  // 7-Color record mix rows grouped by session/day
  const sessionRecordMixRows = useMemo(() => {
    const map = new Map<
      number,
      Record<ResultColor, number> & { session: number; shortLabel: string; label: string; nTotal: number }
    >()

    for (const s of availableSessions) {
      const sOpt = learningSessions.find((ls) => ls.sessionNumber === s || (ls.sessionNumber == null && s === 1))
      map.set(s, {
        session: s,
        shortLabel: `D${s}`,
        label: sessionLabel(s, sOpt?.startedAt, totalDays),
        nTotal: 0,
        red: 0,
        orange: 0,
        yellow: 0,
        green: 0,
        blue: 0,
        indigo: 0,
        purple: 0,
      })
    }

    for (const row of recordTubeRows) {
      if (!map.has(row.session)) {
        map.set(row.session, {
          session: row.session,
          shortLabel: `D${row.session}`,
          label: row.sessionLabel,
          nTotal: 0,
          red: 0,
          orange: 0,
          yellow: 0,
          green: 0,
          blue: 0,
          indigo: 0,
          purple: 0,
        })
      }
      const target = map.get(row.session)!
      for (const record of row.records) {
        target[record.color] += 1
        target.nTotal += 1
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.session - b.session)
      .filter((entry) => selectedSessions.length === 0 || selectedSessions.includes(entry.session))
      .map((entry) => {
        const sumPercentX = SPECTRUM_COLORS.reduce((s, color) => s + entry[color] * COLOR_PERCENT_X_VALUES[color], 0)
        const avgPercentX = entry.nTotal > 0 ? sumPercentX / entry.nTotal : 0
        const avgXColor = colorForAvgPercentX(avgPercentX)
        return { ...entry, sumPercentX, avgPercentX, avgXColor }
      })
  }, [recordTubeRows, availableSessions, learningSessions, totalDays, selectedSessions])

  // Dynamic Session Aggregator Logic for %c theo Session
  const sessionPercentCBuckets = useMemo(() => {
    if (chartAttempts.length === 0) return []

    if (sessionGroupMode === 'dynamic') {
      const sorted = [...chartAttempts].sort((a, b) => a.index - b.index)
      const buckets: {
        id: string
        label: string
        shortLabel: string
        percentC: number
        bandColor: ResultColor
        questionCount: number
        rfc: number
        chunks: number
        probeDepth: number
      }[] = []

      const totalAttempts = sorted.length
      const size = Math.max(1, dynamicChunkSize)
      const numBuckets = Math.ceil(totalAttempts / size)

      for (let i = 0; i < numBuckets; i++) {
        const startQ = i * size + 1
        const endQ = Math.min((i + 1) * size, totalAttempts)
        const bucketAttempts = sorted.slice(i * size, endQ)

        const probed = bucketAttempts.filter((a) => a.enteredProbeFlow)
        const chunksNumbers = probed.map((a) => Math.max(1, a.probeEventCount + 1))
        const chunks = probed.length
        const probeDepth =
          probed.length > 0
            ? Number((chunksNumbers.reduce((s, v) => s + v, 0) / probed.length).toFixed(1))
            : 0

        const spectrum = calculateSpectrumStepBreakdown(
          bucketAttempts.map((a) => ({
            effectiveColor: a.color,
            enteredProbeFlow: a.enteredProbeFlow,
            probeEventCount: a.probeEventCount,
          })),
        )

        const percentC = Number((spectrum.avgPercentX ?? 0).toFixed(1))
        const bandColor = colorForAvgPercentX(percentC)
        const rfc = spectrum.rfc == null ? 0 : Number((spectrum.rfc * 100).toFixed(1))

        buckets.push({
          id: `dynamic-${i}`,
          label: `Session ${i + 1} (Q${startQ}-Q${endQ})`,
          shortLabel: `S${i + 1} (Q${startQ}-${endQ})`,
          percentC,
          bandColor,
          questionCount: bucketAttempts.length,
          rfc,
          chunks,
          probeDepth,
        })
      }

      return buckets
    } else {
      // sessionGroupMode === 'day'
      const map = new Map<number, typeof chartAttempts>()
      for (const row of chartAttempts) {
        if (!map.has(row.session)) map.set(row.session, [])
        map.get(row.session)!.push(row)
      }

      const sessionsToInclude = availableSessions.filter(
        (s) => selectedSessions.length === 0 || selectedSessions.includes(s),
      )

      return sessionsToInclude.map((session) => {
        const bucketAttempts = map.get(session) ?? []
        const sOpt = learningSessions.find(
          (ls) => ls.sessionNumber === session || (ls.sessionNumber == null && session === 1),
        )
        const label = sessionLabel(session, sOpt?.startedAt, totalDays)

        const probed = bucketAttempts.filter((a) => a.enteredProbeFlow)
        const chunksNumbers = probed.map((a) => Math.max(1, a.probeEventCount + 1))
        const chunks = probed.length
        const probeDepth =
          probed.length > 0
            ? Number((chunksNumbers.reduce((s, v) => s + v, 0) / probed.length).toFixed(1))
            : 0

        const spectrum = calculateSpectrumStepBreakdown(
          bucketAttempts.map((a) => ({
            effectiveColor: a.color,
            enteredProbeFlow: a.enteredProbeFlow,
            probeEventCount: a.probeEventCount,
          })),
        )

        const percentC = Number((spectrum.avgPercentX ?? 0).toFixed(1))
        const bandColor = colorForAvgPercentX(percentC)
        const rfc = spectrum.rfc == null ? 0 : Number((spectrum.rfc * 100).toFixed(1))

        return {
          id: `day-${session}`,
          label,
          shortLabel: `D${session}`,
          percentC,
          bandColor,
          questionCount: bucketAttempts.length,
          rfc,
          chunks,
          probeDepth,
        }
      })
    }
  }, [chartAttempts, sessionGroupMode, dynamicChunkSize, availableSessions, selectedSessions, learningSessions, totalDays])

  // Spectrum pie distribution
  const colorDistribution = useMemo(() => {
    const allRecords = recordTubeRows.flatMap((row) => row.records)
    const total = Math.max(allRecords.length, 1)
    return SPECTRUM_COLORS.map((color) => {
      const count = allRecords.filter((rec) => rec.color === color).length
      return {
        color,
        name: COLOR_LABELS[color],
        count,
        percent: allRecords.length ? Math.round((count / total) * 100) : 0,
        fill: COLOR_HEX[color],
      }
    })
  }, [recordTubeRows])

  const selectedColorGroup = useMemo(() => {
    const selected = new Set(selectedColors)
    const isWarm =
      COLOR_GROUPS.warm.length === selectedColors.length && COLOR_GROUPS.warm.every((color) => selected.has(color))
    const isCool =
      COLOR_GROUPS.cool.length === selectedColors.length && COLOR_GROUPS.cool.every((color) => selected.has(color))
    if (isWarm) return 'warm'
    if (isCool) return 'cool'
    return 'custom'
  }, [selectedColors])

  const toggleSession = useCallback((session: number) => {
    setSelectedSessions((current) => {
      if (current.includes(session)) {
        return current.filter((value) => value !== session)
      }
      return [...current, session].sort((a, b) => a - b)
    })
  }, [])

  const toggleColor = useCallback((color: ResultColor) => {
    setSelectedColors((current) => {
      if (current.includes(color)) {
        const next = current.filter((value) => value !== color)
        return next.length === 0 ? [...SPECTRUM_COLORS] : next
      }
      return [...current, color]
    })
  }, [])

  const selectColorGroup = useCallback((group: 'warm' | 'cool') => {
    setSelectedColors([...COLOR_GROUPS[group]])
  }, [])

  const updateChartUi = useCallback((key: ChartKey, patch: Partial<ChartUiState[ChartKey]>) => {
    setChartUi((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }))
  }, [])

  const resetChartUi = useCallback(() => {
    setChartUi(DEFAULT_CHART_UI)
    setChartOrder(DEFAULT_CHART_ORDER)
  }, [])

  const moveChartTo = useCallback((key: ChartKey, targetKey: ChartKey) => {
    setChartOrder((current) => {
      const index = current.indexOf(key)
      const nextIndex = current.indexOf(targetKey)
      if (index < 0 || nextIndex < 0 || index === nextIndex) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item!)
      return next
    })
  }, [])

  const chartPanelClass = useCallback(
    (key: ChartKey) => `test-analysis-panel${chartUi[key].expanded ? ' is-expanded' : ''}`,
    [chartUi],
  )

  const chartActions = useCallback(
    (key: ChartKey, labels = true) => (
      <div className="test-analysis-chart-actions">
        {labels ? (
          <button
            type="button"
            onClick={() => updateChartUi(key, { showLabels: !chartUi[key].showLabels })}
            title={chartUi[key].showLabels ? 'Hide labels' : 'Show labels'}
            aria-label={chartUi[key].showLabels ? 'Hide labels' : 'Show labels'}
          >
            {chartUi[key].showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => updateChartUi(key, { expanded: !chartUi[key].expanded })}
          title={chartUi[key].expanded ? 'Shrink chart' : 'Expand chart'}
          aria-label={chartUi[key].expanded ? 'Shrink chart' : 'Expand chart'}
        >
          {chartUi[key].expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => updateChartUi(key, { hidden: true })}
          title="Hide chart"
          aria-label="Hide chart"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    [chartUi, updateChartUi],
  )

  if (attempts.length === 0) {
    return (
      <div className="empty-state analysis-empty rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
        <p className="text-white font-bold text-base">No chart data yet</p>
        <p className="meta mt-1 text-slate-400 text-xs">
          Finalize Focus / Awareness colors in live days — charts plot Day 1…N.
        </p>
      </div>
    )
  }

  return (
    <div className="test-analysis-page text-left">
      {/* Live Classroom KPI Stat Grid - Synchronized with Metric Filter */}
      {visibleMetricCount > 0 ? (
        <div className="standalone-analysis-grid mb-4">
          {metricVisibility.rfc ? (
            <div
              className="standalone-metric-card metric-rfc cursor-default"
              title={`Struggle (RFC) = Warm records / N_total = ${summary.warmSteps} / ${summary.totalRecords}. Lower is better.`}
            >
              <Activity className="h-5 w-5 text-red-500" />
              <span>Struggle (RFC)</span>
              <strong className="text-red-500">{summary.rfc.toFixed(1)}%</strong>
            </div>
          ) : null}

          {metricVisibility.percentC ? (
            <div
              className={`standalone-metric-card metric-avg-x is-${summary.avgXColor} cursor-default`}
              style={{
                borderColor: `${COLOR_HEX[summary.avgXColor]}55`,
                boxShadow: `0 0 16px -4px ${COLOR_HEX[summary.avgXColor]}33`,
              }}
              title={`Avg %x = sum(%x) / N_total = ${summary.sumPercentX.toFixed(1)}% / ${summary.totalRecords} = ${summary.avgPercentX.toFixed(1)}% (${COLOR_LABELS[summary.avgXColor]} band). Higher is better.`}
            >
              <Target className="h-5 w-5" style={{ color: COLOR_HEX[summary.avgXColor] }} />
              <span>%c (Avg %x)</span>
              <strong style={{ color: COLOR_HEX[summary.avgXColor] }}>{summary.avgPercentX.toFixed(1)}%</strong>
            </div>
          ) : null}

          {metricVisibility.chunks ? (
            <div
              className="standalone-metric-card cursor-default"
              title={`Finalized attempts in current filter: ${summary.sampleSize}.`}
            >
              <BarChart3 className="h-5 w-5 text-slate-400" />
              <span>Sample size / Chunks</span>
              <strong>{summary.sampleSize}</strong>
            </div>
          ) : null}

          {metricVisibility.probeDepth ? (
            <div
              className="standalone-metric-card cursor-default"
              title={`Total spectrum color records (primary + probe events): ${summary.totalRecords}.`}
            >
              <Layers className="h-5 w-5 text-indigo-500" />
              <span>Probe events / N_total</span>
              <strong>{summary.totalRecords}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Chart Workbench Toolbar & Filters */}
      <div className="test-analysis-workbench">
        <aside ref={filterCardRef} className="test-analysis-filter-card" aria-label="Chart filters">
          <div className="test-analysis-filter-head">
            <Gauge className="h-4 w-4" />
            <div>
              <strong>Filters</strong>
              <span>
                {chartAttempts.length}/{attempts.length} attempts
              </span>
            </div>
          </div>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Days</span>
              <strong>{selectedSessions.length ? `${selectedSessions.length} selected` : 'All'}</strong>
            </summary>
            <div className="test-analysis-filter-popover">
              <div className="test-analysis-chip-grid">
                <button
                  type="button"
                  className={`test-analysis-chip${selectedSessions.length === 0 ? ' is-active' : ''}`}
                  onClick={() => setSelectedSessions([])}
                >
                  All
                </button>
                {availableSessions.map((session) => {
                  const active = selectedSessions.includes(session)
                  return (
                    <button
                      key={session}
                      type="button"
                      className={`test-analysis-chip${active ? ' is-active' : ''}`}
                      onClick={() => toggleSession(session)}
                    >
                      D{session}
                    </button>
                  )
                })}
              </div>
            </div>
          </details>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Colors</span>
              <strong>
                {selectedColors.length === SPECTRUM_COLORS.length ? 'All' : `${selectedColors.length} selected`}
              </strong>
            </summary>
            <div className="test-analysis-filter-popover">
              <div className="test-analysis-color-list">
                <button
                  type="button"
                  className={`test-analysis-color-chip${selectedColors.length === SPECTRUM_COLORS.length ? ' is-active' : ''}`}
                  onClick={() => setSelectedColors([...SPECTRUM_COLORS])}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`test-analysis-color-chip${selectedColorGroup === 'warm' ? ' is-active' : ''}`}
                  onClick={() => selectColorGroup('warm')}
                  title="Warm = Red + Orange + Yellow (Struggle/RFC focus)"
                >
                  Warm
                </button>
                <button
                  type="button"
                  className={`test-analysis-color-chip${selectedColorGroup === 'cool' ? ' is-active' : ''}`}
                  onClick={() => selectColorGroup('cool')}
                  title="Cool = Green + Blue + Indigo + Purple (Mastery focus)"
                >
                  Cool
                </button>
                {SPECTRUM_COLORS.map((color) => {
                  const active = selectedColors.length < SPECTRUM_COLORS.length && selectedColors.includes(color)
                  return (
                    <button
                      key={color}
                      type="button"
                      className={`test-analysis-color-chip${active ? ' is-active' : ''}`}
                      style={
                        active ? { borderColor: COLOR_HEX[color], background: `${COLOR_HEX[color]}1f` } : undefined
                      }
                      onClick={() => toggleColor(color)}
                    >
                      <i style={{ background: COLOR_HEX[color] }} />
                      {COLOR_LABELS[color]}
                    </button>
                  )
                })}
              </div>
            </div>
          </details>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Metrics</span>
              <strong>{visibleMetricCount}/4</strong>
            </summary>
            <div className="test-analysis-filter-popover">
              <div className="test-analysis-color-list">
                <button
                  type="button"
                  className={`test-analysis-color-chip${metricVisibility.rfc ? ' is-active' : ''}`}
                  style={
                    metricVisibility.rfc
                      ? { borderColor: '#ef4444', background: '#ef44441f' }
                      : undefined
                  }
                  onClick={() => toggleMetric('rfc')}
                >
                  <i style={{ background: '#ef4444' }} />
                  RFC (Struggle)
                </button>
                <button
                  type="button"
                  className={`test-analysis-color-chip${metricVisibility.percentC ? ' is-active' : ''}`}
                  style={
                    metricVisibility.percentC
                      ? { borderColor: '#22c55e', background: '#22c55e1f' }
                      : undefined
                  }
                  onClick={() => toggleMetric('percentC')}
                >
                  <i style={{ background: '#22c55e' }} />
                  %c (Success)
                </button>
                <button
                  type="button"
                  className={`test-analysis-color-chip${metricVisibility.chunks ? ' is-active' : ''}`}
                  style={
                    metricVisibility.chunks
                      ? { borderColor: '#38bdf8', background: '#38bdf81f' }
                      : undefined
                  }
                  onClick={() => toggleMetric('chunks')}
                >
                  <i style={{ background: '#38bdf8' }} />
                  Chunks (Count)
                </button>
                <button
                  type="button"
                  className={`test-analysis-color-chip${metricVisibility.probeDepth ? ' is-active' : ''}`}
                  style={
                    metricVisibility.probeDepth
                      ? { borderColor: '#a855f7', background: '#a855f71f' }
                      : undefined
                  }
                  onClick={() => toggleMetric('probeDepth')}
                >
                  <i style={{ background: '#a855f7' }} />
                  Probe Depth
                </button>
              </div>
            </div>
          </details>

          {!compact && (
            <details className="test-analysis-filter-menu is-wide">
              <summary>
                <span>Charts</span>
                <strong>
                  {chartOrder.filter((key) => !chartUi[key].hidden).length}/{chartOrder.length}
                </strong>
              </summary>
              <div className="test-analysis-filter-popover">
                <div className="test-analysis-filter-title is-popover-title">
                  <span>Order</span>
                  <button type="button" onClick={resetChartUi} title="Reset chart layout">
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                </div>
                <div className="test-analysis-chart-order-list">
                  {chartOrder.map((key, index) => (
                    <div
                      key={key}
                      className={`test-analysis-chart-order-row${chartUi[key].hidden ? ' is-hidden' : ''}${draggingChart === key ? ' is-dragging' : ''}`}
                      draggable
                      onDragStart={() => setDraggingChart(key)}
                      onDragEnd={() => setDraggingChart(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (draggingChart) moveChartTo(draggingChart, key)
                        setDraggingChart(null)
                      }}
                    >
                      <span className="test-analysis-chart-order-grip" aria-hidden>
                        <GripVertical className="h-3 w-3" />
                      </span>
                      <button
                        type="button"
                        className="test-analysis-chart-order-name"
                        onClick={() => updateChartUi(key, { hidden: !chartUi[key].hidden })}
                        title={chartUi[key].hidden ? 'Show chart' : 'Hide chart'}
                      >
                        <span>{index + 1}</span>
                        <strong>{CHART_NAMES[key]}</strong>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </aside>

        {/* Dynamic Chart Stack Ordered by Drag & Drop */}
        <div className="test-analysis-chart-stack">
          {/* Question Record Tube Chart */}
          {!chartUi.tube.hidden ? (
            <div
              className={`test-analysis-chart-slot${chartUi.tube.expanded ? ' lg:col-span-2' : ''}`}
              style={{ order: chartOrder.indexOf('tube') }}
            >
              <Panel
                className={chartPanelClass('tube')}
                icon={CircleDot}
                title="Question Record Tube Chart"
                description="Each attempt is one tube. Records are stacked bottom-up: first primary record at the bottom, probe records stacked upwards."
                actions={chartActions('tube')}
                collapsible={false}
              >
                <div
                  className={`standalone-chart-wrap test-analysis-tube-wrap${chartUi.tube.expanded ? ' h-[26rem]' : ''}`}
                >
                  <div
                    className="test-analysis-tube-scroll"
                    role="img"
                    aria-label="Question record tube chart showing N_total color records by attempt"
                  >
                    {recordTubeRows.length ? (
                      recordTubeRows.map((row) => (
                        <div key={row.id} className="test-analysis-tube-col">
                          <div
                            className="test-analysis-tube-stack"
                            title={`${row.label} (${row.sessionLabel}) - N_total ${row.records.length}`}
                          >
                            {row.records.map((record) => (
                              <span
                                key={`${row.id}-${record.index}`}
                                className="test-analysis-tube-bead"
                                style={{ background: COLOR_HEX[record.color] }}
                                title={`${row.label} (${row.sessionLabel}) - ${record.label}`}
                                aria-label={`${row.label} ${record.label}`}
                              />
                            ))}
                          </div>
                          {chartUi.tube.showLabels ? (
                            <>
                              <strong>{row.shortLabel}</strong>
                              <span>{row.records.length}</span>
                            </>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="test-analysis-empty-chart">No finalized records in the current filter.</div>
                    )}
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {/* 7-Color Record Mix by Day */}
          {!chartUi.mix.hidden ? (
            <div
              className={`test-analysis-chart-slot${chartUi.mix.expanded ? ' lg:col-span-2' : ''}`}
              style={{ order: chartOrder.indexOf('mix') }}
            >
              <Panel
                className={chartPanelClass('mix')}
                icon={BarChart3}
                title="7-Color Record Mix by Day"
                description="Stacked count of N_total records by session/day across Red, Orange, Yellow, Green, Blue, Indigo, and Purple."
                actions={chartActions('mix')}
                collapsible={false}
              >
                <div className={`standalone-chart-wrap${chartUi.mix.expanded ? ' h-[26rem]' : ' is-short'}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionRecordMixRows} margin={{ top: 36, right: 20, bottom: 8, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.6} />
                      <XAxis dataKey="shortLabel" stroke="#64748b" fontSize={12} tickLine={false} interval={0} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        allowDecimals={false}
                        label={{ value: 'Records', angle: -90, position: 'insideLeft', fill: '#64748b' }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0]?.payload
                          return (
                            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200 shadow-xl">
                              <div className="mb-1 font-black text-slate-950 dark:text-white">
                                {row.label} - N_total {row.nTotal} - Avg %x:{' '}
                                <span className="font-bold" style={{ color: COLOR_HEX[row.avgXColor as ResultColor] }}>
                                  {Number(row.avgPercentX ?? 0).toFixed(1)}%
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                {SPECTRUM_COLORS.map((color) => (
                                  <span key={color} style={{ color: COLOR_HEX[color] }}>
                                    {COLOR_LABELS[color]}: <strong>{row[color]}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        }}
                      />
                      {SPECTRUM_COLORS.map((color, index) => (
                        <Bar
                          key={color}
                          dataKey={color}
                          stackId="records"
                          name={COLOR_LABELS[color]}
                          fill={COLOR_HEX[color]}
                          isAnimationActive={false}
                        >
                          {chartUi.mix.showLabels && index === SPECTRUM_COLORS.length - 1 ? (
                            <LabelList dataKey="nTotal" position="top" className="test-analysis-chart-label" />
                          ) : null}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          ) : null}

          {/* %c theo Session */}
          {!chartUi.sessionPercentC.hidden ? (
            <div
              className={`test-analysis-chart-slot${chartUi.sessionPercentC.expanded ? ' lg:col-span-2' : ''}`}
              style={{ order: chartOrder.indexOf('sessionPercentC') }}
            >
              <Panel
                className={chartPanelClass('sessionPercentC')}
                icon={LineChartIcon}
                title="%c theo Session"
                description="Theo dõi %c (Avg %x) theo từng phiên học (Session) hoặc nhóm câu hỏi với chỉ số màu quang phổ thực tế."
                actions={chartActions('sessionPercentC')}
                collapsible={false}
              >
                {/* Minimal clean light controls toolbar */}
                <div className="flex items-center justify-between gap-2 mb-2 pb-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="text-[11px] font-medium text-slate-400">Gộp:</span>
                    <select
                      value={sessionGroupMode === 'day' ? 'day' : String(dynamicChunkSize)}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === 'day') {
                          setSessionGroupMode('day')
                        } else {
                          setSessionGroupMode('dynamic')
                          setDynamicChunkSize(Number(val))
                        }
                      }}
                      className="bg-transparent text-slate-700 font-semibold text-xs py-0.5 px-1 rounded hover:bg-slate-100 transition-colors cursor-pointer border-0 outline-none"
                    >
                      <option value="10">10 câu (Mặc định)</option>
                      <option value="5">5 câu</option>
                      <option value="15">15 câu</option>
                      <option value="20">20 câu</option>
                      <option value="day">Theo ngày (D1..DN)</option>
                    </select>
                  </div>

                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 text-slate-500">
                    <button
                      type="button"
                      title="Biểu đồ cột (Bar)"
                      className={`p-1 rounded-md transition-all cursor-pointer ${
                        sessionChartType === 'bar'
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'hover:text-slate-800'
                      }`}
                      onClick={() => setSessionChartType('bar')}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Biểu đồ đường (Line)"
                      className={`p-1 rounded-md transition-all cursor-pointer ${
                        sessionChartType === 'line'
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'hover:text-slate-800'
                      }`}
                      onClick={() => setSessionChartType('line')}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Danh sách (List)"
                      className={`p-1 rounded-md transition-all cursor-pointer ${
                        sessionChartType === 'list'
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'hover:text-slate-800'
                      }`}
                      onClick={() => setSessionChartType('list')}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className={`standalone-chart-wrap${chartUi.sessionPercentC.expanded ? ' h-[26rem]' : ''}`}>
                  {sessionChartType === 'list' ? (
                    <div className="overflow-x-auto max-h-full rounded-xl bg-white border border-slate-100">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold">
                            <th className="py-2 px-3">STT / Phiên</th>
                            {metricVisibility.percentC ? <th className="py-2 px-3">%c (Avg %x)</th> : null}
                            {metricVisibility.rfc ? <th className="py-2 px-3">RFC</th> : null}
                            {metricVisibility.chunks ? <th className="py-2 px-3">Chunks</th> : null}
                            {metricVisibility.probeDepth ? <th className="py-2 px-3">Probe Depth</th> : null}
                            <th className="py-2 px-3">Số câu hỏi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {sessionPercentCBuckets.map((b, idx) => (
                            <tr key={b.id ?? idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {b.label}
                              </td>
                              {metricVisibility.percentC ? (
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                                      style={{ backgroundColor: COLOR_HEX[b.bandColor] }}
                                    />
                                    <span
                                      className="px-2 py-0.5 rounded-md font-mono font-bold text-xs"
                                      style={{
                                        backgroundColor: `${COLOR_HEX[b.bandColor]}20`,
                                        color: COLOR_HEX[b.bandColor],
                                      }}
                                    >
                                      {b.percentC.toFixed(1)}%
                                    </span>
                                  </div>
                                </td>
                              ) : null}
                              {metricVisibility.rfc ? (
                                <td className="py-2.5 px-3 font-mono font-semibold text-red-500">
                                  {b.rfc.toFixed(1)}%
                                </td>
                              ) : null}
                              {metricVisibility.chunks ? (
                                <td className="py-2.5 px-3 font-mono font-semibold text-sky-600">
                                  {b.chunks}
                                </td>
                              ) : null}
                              {metricVisibility.probeDepth ? (
                                <td className="py-2.5 px-3 font-mono font-semibold text-purple-600">
                                  {b.probeDepth.toFixed(1)}
                                </td>
                              ) : null}
                              <td className="py-2.5 px-3 font-mono text-slate-500">
                                {b.questionCount} câu
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={sessionPercentCBuckets}
                        margin={{
                          top: 36,
                          right: metricVisibility.chunks || metricVisibility.probeDepth ? 36 : 24,
                          bottom: 8,
                          left: -12,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.6} />
                        <XAxis
                          dataKey="shortLabel"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickFormatter={(value) => `${value}%`}
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          label={{
                            value: '%c / RFC (%)',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#64748b',
                          }}
                        />
                        {metricVisibility.chunks || metricVisibility.probeDepth ? (
                          <YAxis
                            yAxisId="depth"
                            orientation="right"
                            stroke="#8b5cf6"
                            fontSize={11}
                            tickLine={false}
                            domain={[0, 'auto']}
                            label={{
                              value: 'Chunks / Depth',
                              angle: 90,
                              position: 'insideRight',
                              fill: '#8b5cf6',
                            }}
                          />
                        ) : null}
                        <Tooltip
                          cursor={{
                            fill: 'rgba(255, 255, 255, 0.05)',
                            stroke: '#6366f1',
                            strokeDasharray: '3 3',
                          }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload
                            if (!row) return null
                            return (
                              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200 shadow-xl">
                                <div className="mb-1 font-black text-slate-950 dark:text-white">
                                  {row.label}
                                </div>
                                {metricVisibility.percentC ? (
                                  <div className="flex items-center gap-1.5 my-1">
                                    <span>%c:</span>
                                    <strong
                                      style={{
                                        color: COLOR_HEX[row.bandColor as ResultColor],
                                      }}
                                    >
                                      {Number(row.percentC).toFixed(1)}%
                                    </strong>
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase"
                                      style={{
                                        backgroundColor:
                                          COLOR_HEX[row.bandColor as ResultColor],
                                      }}
                                    >
                                      {COLOR_LABELS[row.bandColor as ResultColor]}
                                    </span>
                                  </div>
                                ) : null}
                                <div>
                                  Questions: <strong>{row.questionCount}</strong>
                                </div>
                                {metricVisibility.rfc ? (
                                  <div>
                                    Struggle (RFC):{' '}
                                    <strong style={{ color: METRIC_HEX.rfc }}>
                                      {Number(row.rfc).toFixed(1)}%
                                    </strong>
                                  </div>
                                ) : null}
                                {metricVisibility.chunks ? (
                                  <div>
                                    Chunks: <strong>{row.chunks}</strong>
                                  </div>
                                ) : null}
                                {metricVisibility.probeDepth ? (
                                  <div>
                                    Probe Depth: <strong>{Number(row.probeDepth).toFixed(1)}</strong>
                                  </div>
                                ) : null}
                              </div>
                            )
                          }}
                        />
                        <ReferenceLine
                          y={50}
                          stroke="#22c55e"
                          strokeDasharray="3 3"
                          label={{
                            value: '50% Green',
                            fill: '#22c55e',
                            fontSize: 10,
                            position: 'insideTopLeft',
                          }}
                        />
                        <ReferenceLine
                          y={75}
                          stroke="#a855f7"
                          strokeDasharray="3 3"
                          label={{
                            value: '75% Mastery',
                            fill: '#a855f7',
                            fontSize: 10,
                            position: 'insideTopLeft',
                          }}
                        />
                        {metricVisibility.chunks ? (
                          <Bar
                            yAxisId="depth"
                            dataKey="chunks"
                            name="Chunks"
                            fill="#38bdf8"
                            opacity={0.6}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                          >
                            {chartUi.sessionPercentC.showLabels ? (
                              <LabelList
                                dataKey="chunks"
                                position="top"
                                fill="#0284c7"
                                className="test-analysis-chart-label font-bold text-xs"
                              />
                            ) : null}
                          </Bar>
                        ) : null}
                        {metricVisibility.percentC ? (
                          sessionChartType === 'bar' ? (
                            <Bar
                              dataKey="percentC"
                              name="%c"
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={false}
                            >
                              {sessionPercentCBuckets.map((b, idx) => (
                                <Cell key={b.id ?? idx} fill={COLOR_HEX[b.bandColor]} />
                              ))}
                              {chartUi.sessionPercentC.showLabels ? (
                                <LabelList
                                  dataKey="percentC"
                                  position="top"
                                  formatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
                                  className="test-analysis-chart-label font-bold text-xs"
                                />
                              ) : null}
                            </Bar>
                          ) : (
                            <Line
                              type="monotone"
                              dataKey="percentC"
                              name="%c"
                              stroke="#16a34a"
                              strokeWidth={3}
                              isAnimationActive={false}
                              dot={(props: any) => {
                                const { cx, cy, payload } = props
                                return (
                                  <circle
                                    key={props.key}
                                    cx={cx}
                                    cy={cy}
                                    r={5}
                                    fill={COLOR_HEX[payload.bandColor as ResultColor]}
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                  />
                                )
                              }}
                              activeDot={{ r: 7, stroke: '#0f172a', strokeWidth: 2 }}
                            >
                              {chartUi.sessionPercentC.showLabels ? (
                                <LabelList
                                  dataKey="percentC"
                                  position="top"
                                  offset={10}
                                  formatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
                                  className="test-analysis-chart-label font-bold text-xs"
                                />
                              ) : null}
                            </Line>
                          )
                        ) : null}
                        {metricVisibility.rfc ? (
                          <Line
                            type="monotone"
                            dataKey="rfc"
                            name="RFC"
                            stroke="#ef4444"
                            strokeWidth={2.5}
                            isAnimationActive={false}
                            dot={{ r: 4, fill: '#ef4444', stroke: '#ffffff', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: '#ef4444', stroke: '#0f172a', strokeWidth: 2 }}
                          >
                            {chartUi.sessionPercentC.showLabels ? (
                              <LabelList
                                dataKey="rfc"
                                position="top"
                                offset={10}
                                formatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
                                fill="#ef4444"
                                className="test-analysis-chart-label font-bold text-xs"
                              />
                            ) : null}
                          </Line>
                        ) : null}
                        {metricVisibility.probeDepth ? (
                          <Line
                            yAxisId="depth"
                            type="monotone"
                            dataKey="probeDepth"
                            name="Probe Depth"
                            stroke="#a855f7"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            isAnimationActive={false}
                            dot={{ r: 4, fill: '#a855f7', stroke: '#ffffff', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: '#a855f7', stroke: '#0f172a', strokeWidth: 2 }}
                          >
                            {chartUi.sessionPercentC.showLabels ? (
                              <LabelList
                                dataKey="probeDepth"
                                position="top"
                                offset={10}
                                formatter={(v: unknown) => `${Number(v).toFixed(1)}`}
                                fill="#a855f7"
                                className="test-analysis-chart-label font-bold text-xs"
                              />
                            ) : null}
                          </Line>
                        ) : null}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Panel>
            </div>
          ) : null}

          {/* Result Color Distribution Pie Chart */}
          {!chartUi.distribution.hidden ? (
            <div
              className={`test-analysis-chart-slot${chartUi.distribution.expanded ? ' lg:col-span-2' : ''}`}
              style={{ order: chartOrder.indexOf('distribution') }}
            >
              <Panel
                className={chartPanelClass('distribution')}
                icon={PieChartIcon}
                title="Result Color Distribution"
                description="Distribution of finalized effective results across the 7-color spectrum."
                actions={chartActions('distribution')}
                collapsible={false}
              >
                <div className={`standalone-chart-wrap${chartUi.distribution.expanded ? ' h-[26rem]' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0]?.payload
                          return (
                            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200 shadow-xl">
                              <div className="font-black" style={{ color: row.fill }}>
                                {row.name}
                              </div>
                              <div>
                                Attempts: <strong>{row.count}</strong>
                              </div>
                              <div>
                                Share: <strong>{row.percent}%</strong>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Pie
                        data={colorDistribution}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="78%"
                        paddingAngle={2}
                        label={
                          chartUi.distribution.showLabels
                            ? ({ payload }: any) => (payload?.percent ? `${payload.percent}%` : '')
                            : false
                        }
                        isAnimationActive={false}
                      >
                        {colorDistribution.map((entry) => (
                          <Cell key={entry.color} fill={entry.fill} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
