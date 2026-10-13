import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BarChart3, Brain, CircleDot, Eye, EyeOff, Gauge, GripVertical, LineChart as LineChartIcon, Maximize2, Minimize2, PieChart as PieChartIcon, RotateCcw, ShieldAlert, Target, X, Zap } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import { listActiveLearners } from '../../modules/roster/service'
import { getStandaloneAssignmentAnalysis, type StandaloneTestRunRow } from '../../lib/standalone-tests'
import { getTestPackageVersion, listTestPackages } from '../../lib/test-packages'
import { useAppState } from '../../state/useAppState'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { useStaffSession } from '../../auth/useStaffSession'
import { probeChunksNumber } from '../../modules/assessment/probe-metrics'
import { calculateDynamicAcn, useDynamicAcnConfig } from '../../modules/assessment/dynamic-acn'
import { calculateSpectrumStepBreakdown, spectrumRecordsForAttempt, COLOR_PERCENT_X_VALUES, colorForAvgPercentX } from '../../modules/metrics/calculate'
import { racMetricLabelForPackage, type PackageRacMetricLabel } from '../../modules/metrics/display-labels'
import {
  evaluateStandaloneFormula,
  standaloneMetricLabel,
  type StandaloneFormulaContext,
  type StandaloneTestMetricSetting,
} from '../../modules/metrics/standalone-settings'
import { COLOR_SCORE, COOL_COLORS, SPECTRUM_COLORS, WARM_COLORS, type ResultColor } from '../../modules/result-lifecycle/types'

type AnalysisItem = Record<string, any>
type QuestionRecord = { color: ResultColor; index: number; label: string; score: number; cpd: number }
type ChartKey = 'tube' | 'mix' | 'recordCpdQuestion' | 'recordCpdTimeline' | 'questionCpd' | 'percentSession' | 'percentCpd' | 'distribution'
type ChartUiState = Record<ChartKey, { showLabels: boolean; expanded: boolean; hidden: boolean }>
type MetricUiState = Record<string, boolean>

const DEFAULT_CHART_UI: ChartUiState = {
  tube: { showLabels: true, expanded: false, hidden: false },
  mix: { showLabels: true, expanded: false, hidden: false },
  recordCpdQuestion: { showLabels: true, expanded: false, hidden: false },
  recordCpdTimeline: { showLabels: true, expanded: false, hidden: false },
  questionCpd: { showLabels: true, expanded: false, hidden: false },
  percentSession: { showLabels: true, expanded: false, hidden: false },
  percentCpd: { showLabels: true, expanded: false, hidden: false },
  distribution: { showLabels: true, expanded: false, hidden: false },
}

const DEFAULT_CHART_ORDER: ChartKey[] = ['tube', 'mix', 'recordCpdQuestion', 'recordCpdTimeline', 'questionCpd', 'percentSession', 'percentCpd', 'distribution']

const CHART_NAMES: Record<ChartKey, string> = {
  tube: 'Tube',
  mix: '7-color records',
  recordCpdQuestion: 'Record CPD by Q',
  recordCpdTimeline: 'Record CPD timeline',
  questionCpd: 'CPD by Q',
  percentSession: '% by session',
  percentCpd: '% + CPD',
  distribution: 'Color distribution',
}

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#38bdf8',
  indigo: '#6366f1',
  purple: '#a855f7',
  pending: '#64748b',
}

const COLOR_LABELS: Record<string, string> = {
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
  rfc: '#dc2626',
  percentC: '#16a34a',
  cvr: '#dc2626',
  cci: '#16a34a',
  cpd: '#2563eb',
}

function snapshot(item: AnalysisItem) {
  return item?.standalone_test_attempts?.[0]?.standalone_test_attempt_snapshots ?? null
}

function colorOf(item: AnalysisItem): ResultColor | 'pending' {
  return (snapshot(item)?.effective_color as ResultColor | undefined) ?? 'pending'
}

function isFinal(item: AnalysisItem): boolean {
  return ['finalized', 'corrected'].includes(snapshot(item)?.status)
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function pct(value: number): string {
  return `${Math.round(value)}%`
}

function ohm(value: number): string {
  return `${value.toFixed(1)} \u03A9`
}

function amp(value: number): string {
  return `${value.toFixed(1)}A`
}

function volt(value: number): string {
  return `${value.toFixed(1)}V`
}

function resultScore(color: ResultColor | 'pending', snap: any): number {
  const stored = Number(snap?.effective_score ?? snap?.effectiveScore)
  if (Number.isFinite(stored)) return stored
  return color === 'pending' ? 0 : COLOR_SCORE[color]
}

function ResultDot(props: any) {
  const { cx, cy, payload } = props
  if (typeof cx !== 'number' || typeof cy !== 'number') return null
  const fill = payload?.colorHex ?? COLOR_HEX.pending
  const isPending = payload?.color === 'pending'
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isPending ? 4 : 6}
      fill={fill}
      stroke="#0f172a"
      strokeWidth={2}
      aria-label={`${payload?.label ?? 'Question'} CPD ${payload?.cpd ?? '-'}`}
    />
  )
}

function recordLabel(color: ResultColor, index: number, total: number): string {
  if (index === 1 && color === 'green') return `Record ${index}/${total}: Green primary opens probe flow`
  if (color === 'blue') return `Record ${index}/${total}: Blue probe Continue`
  if (color === 'yellow') return `Record ${index}/${total}: Yellow probe Fail`
  if (color === 'indigo') return `Record ${index}/${total}: Indigo probe Done`
  return `Record ${index}/${total}: ${COLOR_LABELS[color]} primary`
}

function formatStandaloneMetricValue(
  metric: StandaloneTestMetricSetting,
  value: number | null,
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  if (metric.unit === 'percent') return pct(value)
  if (metric.unit === 'ohm') return ohm(value)
  if (metric.unit === 'amp') return amp(value)
  if (metric.unit === 'volt') return volt(value)
  if (metric.unit === 'count') return String(Math.round(value))
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
}

function standaloneMetricCardClass(metric: StandaloneTestMetricSetting): string {
  if (metric.key === 'rfc') return 'standalone-metric-card metric-rfc'
  if (metric.key === 'package_percent') return 'standalone-metric-card metric-avg-x'
  if (metric.key === 'legacy_rac') return 'standalone-metric-card metric-percent-c'
  if (metric.key === 'avg_cvr') return 'standalone-metric-card metric-cvr'
  if (metric.key === 'avg_cci') return 'standalone-metric-card metric-cci'
  if (metric.key === 'avg_cpd') return 'standalone-metric-card metric-cpd'
  if (metric.key === 'acn') return 'standalone-metric-card metric-acn'
  return 'standalone-metric-card'
}

function standaloneMetricTitle(
  metric: StandaloneTestMetricSetting,
  metrics: {
    rfcTitle: string
    percentCTitle: string
    legacyRacTitle: string
    acnTitle: string
  },
): string {
  if (metric.key === 'rfc') return `${metrics.rfcTitle}\nFormula setting: ${metric.formula}`
  if (metric.key === 'package_percent') return `${metrics.percentCTitle}\nFormula setting: ${metric.formula}`
  if (metric.key === 'legacy_rac') return `${metrics.legacyRacTitle}\nFormula setting: ${metric.formula}`
  if (metric.key === 'acn') return `${metrics.acnTitle}\nFormula setting: ${metric.formula}`
  return `${metric.definition}\nFormula setting: ${metric.formula}`
}

function StandaloneMetricIcon({ metric }: { metric: StandaloneTestMetricSetting }) {
  if (metric.key === 'package_percent' || metric.key === 'legacy_rac') return <Target className="h-5 w-5" />
  if (metric.key === 'avg_cvr') return <Gauge className="h-5 w-5" />
  if (metric.key === 'avg_cci') return <Brain className="h-5 w-5" />
  if (metric.key === 'avg_cpd') return <Zap className="h-5 w-5" />
  if (metric.key === 'acn') return <LineChartIcon className="h-5 w-5" />
  if (metric.key === 'n_total') return <BarChart3 className="h-5 w-5 text-slate-400" />
  return <Activity className="h-5 w-5" />
}

export function TeacherTestAnalysisPage() {
  const { assignmentId } = useParams()
  const { roster, metricSettings } = useAppState()
  const staffSession = useStaffSession()
  const { options } = useTeacherClassContext()
  const [runs, setRuns] = useState<StandaloneTestRunRow[]>([])
  const [items, setItems] = useState<AnalysisItem[]>([])
  const [learnerId, setLearnerId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedSessions, setSelectedSessions] = useState<number[]>([])
  const [selectedColors, setSelectedColors] = useState<ResultColor[]>([...SPECTRUM_COLORS])
  const [chartUi, setChartUi] = useState<ChartUiState>(DEFAULT_CHART_UI)
  const [chartOrder, setChartOrder] = useState<ChartKey[]>(DEFAULT_CHART_ORDER)
  const [draggingChart, setDraggingChart] = useState<ChartKey | null>(null)
  const [metricUi, setMetricUi] = useState<MetricUiState>({})
  const [racMetricLabel, setRacMetricLabel] = useState<PackageRacMetricLabel>('%c')
  const [sessionBrushRange, setSessionBrushRange] = useState<{ startIndex?: number; endIndex?: number }>({})
  const filterCardRef = useRef<HTMLElement | null>(null)
  const acnConfig = useDynamicAcnConfig()

  useEffect(() => {
    if (!assignmentId) return
    let active = true
    setLoading(true)
    void (async () => {
      const result = await getStandaloneAssignmentAnalysis(assignmentId)
      if (!active) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setRuns(result.data.runs)
      setItems(result.data.items)
      setLearnerId(result.data.assignment?.learnerUserId ?? result.data.runs[0]?.learnerUserId ?? '')
      const packageVersionId = result.data.assignment?.packageVersionId
      if (packageVersionId) {
        const versionResult = await getTestPackageVersion(packageVersionId)
        if (versionResult.ok && versionResult.data) {
          const packagesResult = await listTestPackages()
          const packageTitle = packagesResult.ok
            ? packagesResult.data.find((pkg) => pkg.id === versionResult.data?.packageId)?.title
            : null
          setRacMetricLabel(racMetricLabelForPackage(packageTitle ?? versionResult.data.versionLabel))
        }
      } else {
        setRacMetricLabel('%c')
      }
    })()
    return () => {
      active = false
    }
  }, [assignmentId])

  useEffect(() => {
    setSessionBrushRange({})
  }, [selectedColors, selectedSessions])

  useEffect(() => {
    function closeFilters(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && filterCardRef.current?.contains(target)) return
      filterCardRef.current?.querySelectorAll('details[open]').forEach((detail) => detail.removeAttribute('open'))
    }
    window.addEventListener('pointerdown', closeFilters)
    return () => window.removeEventListener('pointerdown', closeFilters)
  }, [])

  const learner = listActiveLearners(roster).find((l) => l.id === learnerId)
  const isAccessDenied = useMemo(() => {
    if (loading || !learnerId) return false
    if (staffSession.canAccess('admin')) return false

    const operableClassIds = new Set(options.map((o) => o.classRow.id))
    if (operableClassIds.size === 0) return true

    const learnerEnrollments = roster.enrollments.filter(
      (e) => e.learnerUserId === learnerId && e.status === 'active',
    )
    const learnerClassIds = learnerEnrollments.map((e) => e.classId)
    return !learnerClassIds.some((cid) => operableClassIds.has(cid))
  }, [loading, learnerId, staffSession, options, roster.enrollments])

  const learnerEnrollment = useMemo(
    () => roster.enrollments.find((e) => e.learnerUserId === learnerId && e.status === 'active') ?? null,
    [roster.enrollments, learnerId],
  )
  const learnerClass = useMemo(
    () => (learnerEnrollment ? roster.classes.find((c) => c.id === learnerEnrollment.classId) ?? null : null),
    [roster.classes, learnerEnrollment],
  )
  const learnerCourse = useMemo(
    () => (learnerClass ? roster.courses.find((crs) => crs.id === learnerClass.courseId) ?? null : null),
    [roster.courses, learnerClass],
  )

  const rows = useMemo(
    () =>
      items.map((item, index) => {
        const run = runs.find((r) => r.id === item.parent_run_id)
        const color = colorOf(item)
        const snap = snapshot(item)
        const cvr = num(item.target_cvr_ohm, run?.targetCvrOhm ?? 0)
        const cci = num(item.cci_value, run?.cciValue ?? 0)
        const baseCpd = num(item.item_cpd, run?.itemCpd ?? cvr * cci)
        const score = resultScore(color, snap)
        const finalCpd = Number((baseCpd * score).toFixed(2))
        return {
          index: index + 1,
          label: `Question ${index + 1}`,
          shortLabel: `Q${index + 1}`,
          prompt: String(item.prompt_text ?? ''),
          session: num(item.session_number, run?.sessionNumber ?? 1),
          language: String(item.prompt_language ?? run?.promptLanguage ?? 'vi').toUpperCase(),
          cvr,
          cci,
          baseCpd,
          resultScore: score,
          cpd: finalCpd,
          enteredProbeFlow: Boolean(snap?.entered_probe_flow ?? snap?.enteredProbeFlow),
          probeEventCount: num(snap?.probe_count ?? snap?.probeCount, 0),
          probeDepth: probeChunksNumber({
            enteredProbeFlow: Boolean(snap?.entered_probe_flow ?? snap?.enteredProbeFlow),
            probeCount: num(snap?.probe_count ?? snap?.probeCount, 0),
          }) ?? 0,
          color,
          colorHex: COLOR_HEX[color],
          finalized: isFinal(item),
        }
      }),
    [items, runs],
  )

  const availableSessions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.session))).sort((a, b) => a - b),
    [rows],
  )

  const chartRows = useMemo(() => {
    const sessionSet = selectedSessions.length ? new Set(selectedSessions) : null
    const colorSet = new Set<ResultColor>(selectedColors)
    return rows.filter((row) => {
      if (sessionSet && !sessionSet.has(row.session)) return false
      if (row.color !== 'pending' && !colorSet.has(row.color)) return false
      return true
    })
  }, [rows, selectedColors, selectedSessions])

  const metrics = useMemo(() => {
    const finalized = chartRows.filter((row) => row.finalized)
    const count = Math.max(finalized.length, 1)
    const probed = finalized.filter((row) => row.enteredProbeFlow)
    const spectrum = calculateSpectrumStepBreakdown(
      finalized
        .filter((row) => row.color !== 'pending')
        .map((row) => ({
          effectiveColor: row.color as ResultColor,
          enteredProbeFlow: row.enteredProbeFlow,
          probeEventCount: row.probeEventCount,
        })),
    )
    const acnResult = calculateDynamicAcn({
      spectrum,
      finalizedCount: finalized.length,
      probedCount: probed.length,
      legacyProbeDepthSum: probed.reduce((sum, row) => sum + row.probeDepth, 0),
      totalItemsCount: 49
    }, acnConfig.config)
    const avgXColor = colorForAvgPercentX(spectrum.avgPercentX)
    return {
      finalized: finalized.length,
      total: chartRows.length,
      nTotal: spectrum.totalRecords,
      warmSteps: spectrum.warmSteps,
      coolSteps: spectrum.coolSteps,
      rfc: spectrum.rfc == null ? 0 : spectrum.rfc * 100,
      percentC: spectrum.avgPercentX ?? 0,
      legacyRac: spectrum.rac == null ? 0 : spectrum.rac * 100,
      avgPercentX: spectrum.avgPercentX ?? 0,
      sumPercentX: spectrum.sumPercentX,
      avgXColor,
      avgPercentXTitle: `Avg %x = sum(%x) / N_total = ${spectrum.sumPercentX.toFixed(1)}% / ${spectrum.totalRecords} = ${(spectrum.avgPercentX ?? 0).toFixed(1)}% (Band: ${COLOR_LABELS[avgXColor]}).\n* Colors: Red (0%), Orange (17%), Yellow (34%), Green (50%), Blue (67%), Indigo (84%), Purple (100%).`,
      rfcTitle: `RFC = warm records / N_total = ${spectrum.warmSteps} / ${spectrum.totalRecords}. Warm = Red + Orange + Yellow.`,
      percentCTitle: `${racMetricLabel} = Avg %x = sum(%x) / N_total = ${spectrum.sumPercentX.toFixed(1)}% / ${spectrum.totalRecords} = ${(spectrum.avgPercentX ?? 0).toFixed(1)}%.`,
      legacyRacTitle: `RAC legacy = cool records / N_total = ${spectrum.coolSteps} / ${spectrum.totalRecords}. Cool = Green + Blue + Indigo + Purple. When N_total > 0, RAC legacy = 100 - RFC.`,
      nTotalTitle: `N_total = primary records + probe records = ${spectrum.primaryRecords} + ${spectrum.probeRecords} = ${spectrum.totalRecords}.`,
      avgCvr: finalized.reduce((sum, row) => sum + row.cvr, 0) / count,
      avgCci: finalized.reduce((sum, row) => sum + row.cci, 0) / count,
      avgCpd: finalized.reduce((sum, row) => sum + row.cpd, 0) / count,
      acn: acnResult.acn,
      acnTitle: acnResult.acnTitle,
      acnFormulaDescription: acnResult.formulaDescription,
      formulaContext: {
        rfc: spectrum.rfc == null ? null : spectrum.rfc * 100,
        rac: spectrum.rac == null ? null : spectrum.rac * 100,
        avgPercentX: spectrum.avgPercentX,
        legacyRac: spectrum.rac == null ? null : spectrum.rac * 100,
        avgCvr: finalized.length ? finalized.reduce((sum, row) => sum + row.cvr, 0) / count : null,
        avgCci: finalized.length ? finalized.reduce((sum, row) => sum + row.cci, 0) / count : null,
        avgCpd: finalized.length ? finalized.reduce((sum, row) => sum + row.cpd, 0) / count : null,
        acn: acnResult.acn,
        nTotal: spectrum.totalRecords,
        warmSteps: spectrum.warmSteps,
        coolSteps: spectrum.coolSteps,
        finalized: finalized.length,
        total: chartRows.length,
        sumPercentX: spectrum.sumPercentX,
        primaryRecords: spectrum.primaryRecords,
        probeRecords: spectrum.probeRecords,
        enteredProbeCount: probed.length,
        redSteps: spectrum.byColor.red,
        orangeSteps: spectrum.byColor.orange,
        yellowSteps: spectrum.byColor.yellow,
        greenSteps: spectrum.byColor.green,
        blueSteps: spectrum.byColor.blue,
        indigoSteps: spectrum.byColor.indigo,
        purpleSteps: spectrum.byColor.purple,
      } satisfies StandaloneFormulaContext,
    }
  }, [chartRows, racMetricLabel, acnConfig.config])

  const percentCTimelineRows = useMemo(() => {
    const map = new Map<number, typeof chartRows>()
    for (const row of chartRows) {
      if (!map.has(row.session)) map.set(row.session, [])
      map.get(row.session)!.push(row)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([session, group]) => {
        const finalized = group.filter((row) => row.finalized)
        const spectrum = calculateSpectrumStepBreakdown(
          finalized
            .filter((row) => row.color !== 'pending')
            .map((row) => ({
              effectiveColor: row.color as ResultColor,
              enteredProbeFlow: row.enteredProbeFlow,
              probeEventCount: row.probeEventCount,
            })),
        )
        const denom = Math.max(finalized.length, 1)
        const avgCpd = finalized.length
          ? finalized.reduce((sum, row) => sum + row.cpd, 0) / denom
          : 0
        const avgPercentX = spectrum.avgPercentX ?? 0
        const avgXColor = colorForAvgPercentX(spectrum.avgPercentX)
        return {
          session,
          label: `Session ${session}`,
          shortLabel: `S${session}`,
          percentC: spectrum.avgPercentX == null ? 0 : Number(spectrum.avgPercentX.toFixed(1)),
          legacyRac: spectrum.rac == null ? 0 : Math.round(spectrum.rac * 100),
          avgPercentX,
          avgXColor,
          sumPercentX: spectrum.sumPercentX,
          avgCpd: Number(avgCpd.toFixed(2)),
          percentCLabel: spectrum.avgPercentX == null ? '-' : `${spectrum.avgPercentX.toFixed(1)}%`,
          avgCpdLabel: finalized.length ? `CPD ${avgCpd.toFixed(0)}V` : 'CPD -',
          finalized: finalized.length,
          nTotal: spectrum.totalRecords,
          warmSteps: spectrum.warmSteps,
          coolSteps: spectrum.coolSteps,
          byColor: spectrum.byColor,
        }
      })
  }, [chartRows])

  const maxSessionBrushIndex = Math.max(percentCTimelineRows.length - 1, 0)
  const sessionBrushStart = Math.min(maxSessionBrushIndex, Math.max(0, sessionBrushRange.startIndex ?? 0))
  const sessionBrushEnd = Math.max(
    sessionBrushStart,
    Math.min(maxSessionBrushIndex, sessionBrushRange.endIndex ?? maxSessionBrushIndex),
  )

  const brushedSessionRows = useMemo(
    () => percentCTimelineRows.slice(sessionBrushStart, sessionBrushEnd + 1),
    [percentCTimelineRows, sessionBrushEnd, sessionBrushStart],
  )

  const brushedSessionSet = useMemo(
    () => new Set(brushedSessionRows.map((row) => row.session)),
    [brushedSessionRows],
  )

  const cpdBrushIndexes = useMemo(() => {
    const indexes = chartRows
      .map((row, index) => (brushedSessionSet.size === 0 || brushedSessionSet.has(row.session) ? index : -1))
      .filter((index) => index >= 0)
    if (!indexes.length) return { startIndex: 0, endIndex: Math.max(chartRows.length - 1, 0) }
    return { startIndex: Math.min(...indexes), endIndex: Math.max(...indexes) }
  }, [brushedSessionSet, chartRows])

  const handleSessionBrushChange = useCallback((range: { startIndex?: number; endIndex?: number } | null) => {
    if (!range) return
    setSessionBrushRange(range)
  }, [])

  const handleQuestionBrushChange = useCallback((range: { startIndex?: number; endIndex?: number } | null) => {
    if (!range) return
    const start = Math.max(0, range.startIndex ?? 0)
    const end = Math.min(Math.max(chartRows.length - 1, 0), range.endIndex ?? Math.max(chartRows.length - 1, 0))
    const visible = chartRows.slice(start, end + 1)
    if (!visible.length) return
    const visibleSessions = new Set(visible.map((row) => row.session))
    const sessionIndexes = percentCTimelineRows
      .map((row, index) => (visibleSessions.has(row.session) ? index : -1))
      .filter((index) => index >= 0)
    if (!sessionIndexes.length) return
    setSessionBrushRange({ startIndex: Math.min(...sessionIndexes), endIndex: Math.max(...sessionIndexes) })
  }, [chartRows, percentCTimelineRows])

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
        if (next.length === 0) {
          return [...SPECTRUM_COLORS]
        }
        return next
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

  const toggleMetric = useCallback((key: string) => {
    setMetricUi((current) => ({ ...current, [key]: current[key] === false }))
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
          >
            {chartUi[key].showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => updateChartUi(key, { expanded: !chartUi[key].expanded })}
          title={chartUi[key].expanded ? 'Shrink chart' : 'Expand chart'}
        >
          {chartUi[key].expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => updateChartUi(key, { hidden: true })} title="Hide chart">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    [chartUi, updateChartUi],
  )

  const selectedColorGroup = useMemo(() => {
    const selected = new Set(selectedColors)
    const isWarm = COLOR_GROUPS.warm.length === selectedColors.length && COLOR_GROUPS.warm.every((color) => selected.has(color))
    const isCool = COLOR_GROUPS.cool.length === selectedColors.length && COLOR_GROUPS.cool.every((color) => selected.has(color))
    if (isWarm) return 'warm'
    if (isCool) return 'cool'
    return 'custom'
  }, [selectedColors])

  const colorDistribution = useMemo(() => {
    const finalized = chartRows.filter((row) => row.finalized && row.color !== 'pending')
    const total = Math.max(finalized.length, 1)
    return SPECTRUM_COLORS.map((color) => {
      const count = finalized.filter((row) => row.color === color).length
      return {
        color,
        name: COLOR_LABELS[color],
        count,
        percent: finalized.length ? Math.round((count / total) * 100) : 0,
        fill: COLOR_HEX[color],
      }
    })
  }, [chartRows])

  const recordTubeRows = useMemo(() => {
    return chartRows
      .filter((row) => row.finalized && row.color !== 'pending')
      .map((row) => {
        const records = spectrumRecordsForAttempt({
          effectiveColor: row.color as ResultColor,
          enteredProbeFlow: row.enteredProbeFlow,
          probeEventCount: row.probeEventCount,
        }).map((color, index, all): QuestionRecord => ({
          color,
          index: index + 1,
          label: recordLabel(color, index + 1, all.length),
          score: COLOR_SCORE[color],
          cpd: Number((row.baseCpd * COLOR_SCORE[color]).toFixed(2)),
        }))
        return { ...row, records }
      })
  }, [chartRows])

  const recordCpdRows = useMemo(() => {
    let globalRecord = 1
    return recordTubeRows.flatMap((row) => row.records.map((record) => ({
      key: `${row.shortLabel}-R${record.index}`,
      label: `${row.shortLabel}-R${record.index}`,
      globalRecord: globalRecord++,
      question: row.shortLabel,
      session: row.session,
      recordIndex: record.index,
      color: record.color,
      colorHex: COLOR_HEX[record.color],
      colorLabel: COLOR_LABELS[record.color],
      recordLabel: record.label,
      baseCpd: row.baseCpd,
      score: record.score,
      cpd: record.cpd,
    })))
  }, [recordTubeRows])

  const sessionRecordMixRows = useMemo(() => {
    const map = new Map<number, Record<ResultColor, number> & { session: number; shortLabel: string; nTotal: number }>()
    for (const row of recordTubeRows) {
      if (!map.has(row.session)) {
        map.set(row.session, {
          session: row.session,
          shortLabel: `S${row.session}`,
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
      .map((entry) => {
        const sumPercentX = SPECTRUM_COLORS.reduce((s, color) => s + entry[color] * COLOR_PERCENT_X_VALUES[color], 0)
        const avgPercentX = entry.nTotal > 0 ? sumPercentX / entry.nTotal : 0
        const avgXColor = colorForAvgPercentX(avgPercentX)
        return { ...entry, sumPercentX, avgPercentX, avgXColor }
      })
  }, [recordTubeRows])

  const standaloneMetricCards = useMemo(
    () =>
      metricSettings.standaloneTestMetrics
        .filter((metric) => metric.enabled && metricUi[metric.key] !== false)
        .map((metric) => ({
          metric,
          label: standaloneMetricLabel(metric, racMetricLabel),
          value: evaluateStandaloneFormula(metric.formula, metrics.formulaContext),
          title: standaloneMetricTitle(metric, metrics),
        })),
    [metricSettings.standaloneTestMetrics, metricUi, metrics, racMetricLabel],
  )

  const enabledStandaloneMetricCount = metricSettings.standaloneTestMetrics.filter((metric) => metric.enabled).length

  if (loading) return <EmptyState icon={BarChart3} title="Loading standalone analysis..." />
  if (error) return <EmptyState icon={BarChart3} title="Could not load analysis" description={error} />

  if (isAccessDenied) {
    return (
      <div className="test-analysis-page">
        <PageHeader
          icon={ShieldAlert}
          kicker="Teacher - Phân quyền Tests 1-1"
          title="Không có quyền xem phân tích bài test này"
          subtitle="Học viên này thuộc lớp học do giáo viên khác phụ trách."
          actions={
            <Link className="btn ghost" to="/teacher/tests">
              Quay lại Tests
            </Link>
          }
        />
        <EmptyState
          icon={ShieldAlert}
          title="Bài kiểm tra thuộc lớp khác"
          description="Bạn chỉ có thể xem phân tích Tests 1-1 của các học viên thuộc lớp do bạn giảng dạy. Bài kiểm tra này thuộc lớp của giáo viên khác."
          action={
            <Link className="btn primary" to="/teacher/tests">
              Danh sách Tests của bạn
            </Link>
          }
        />
      </div>
    )
  }
  return (
    <div className="test-analysis-page">
      <PageHeader
        icon={BarChart3}
        kicker="Teacher - Standalone Test Analysis"
        title={learner?.displayName ? `${learner.displayName} - Test Analysis` : 'Standalone Test Analysis'}
        subtitle={
          learnerClass
            ? `Lớp: ${learnerClass.name} (${learnerCourse?.name ?? 'Course'}) · Phân tích chi tiết Tests 1-1`
            : 'Dedicated analysis for Tests 1-1, separate from class/session analysis.'
        }
        actions={
          <Link className="btn ghost" to="/teacher/tests">
            Back to Tests
          </Link>
        }
      />

      <div className="standalone-analysis-grid">
        {standaloneMetricCards.map(({ metric, label, value, title }) => {
          const isPackagePercent = metric.key === 'package_percent'
          return (
            <div
              key={metric.key}
              className={`${standaloneMetricCardClass(metric)}${isPackagePercent ? ` is-${metrics.avgXColor}` : ''}`}
              style={
                isPackagePercent
                  ? {
                      borderColor: `${COLOR_HEX[metrics.avgXColor]}55`,
                      boxShadow: `0 0 16px -4px ${COLOR_HEX[metrics.avgXColor]}33`,
                    }
                  : undefined
              }
              title={title}
            >
              <StandaloneMetricIcon metric={metric} />
              <span>{label}</span>
              <strong style={isPackagePercent ? { color: COLOR_HEX[metrics.avgXColor] } : undefined}>
                {formatStandaloneMetricValue(metric, value)}
              </strong>
            </div>
          )
        })}
      </div>

      <div className="test-analysis-workbench">
        <aside ref={filterCardRef} className="test-analysis-filter-card" aria-label="Chart filters">
          <div className="test-analysis-filter-head">
            <Gauge className="h-4 w-4" />
            <div>
              <strong>Filters</strong>
              <span>{chartRows.length}/{rows.length} questions</span>
            </div>
          </div>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Sessions</span>
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
                    S{session}
                  </button>
                )
              })}
              </div>
            </div>
          </details>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Colors</span>
              <strong>{selectedColors.length === SPECTRUM_COLORS.length ? 'All' : `${selectedColors.length} selected`}</strong>
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
                title="Warm = Red + Orange + Yellow"
              >
                Warm
              </button>
              <button
                type="button"
                className={`test-analysis-color-chip${selectedColorGroup === 'cool' ? ' is-active' : ''}`}
                onClick={() => selectColorGroup('cool')}
                title="Cool = Green + Blue + Indigo + Purple"
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
                    style={active ? { borderColor: COLOR_HEX[color], background: `${COLOR_HEX[color]}1f` } : undefined}
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
              <span>ACN Formula</span>
              <strong>{acnConfig.config.preset === 'v2_completed' ? 'v2 Default' : acnConfig.config.preset === 'v2_fixed49' ? 'v2 Fixed 49' : acnConfig.config.preset === 'v1_legacy_probe_avg' ? 'v1 Legacy' : 'Custom'}</strong>
            </summary>
            <div className="test-analysis-filter-popover" style={{ minWidth: '220px' }}>
              <div className="test-analysis-filter-title is-popover-title">
                <span>Select Formula</span>
                <button type="button" onClick={acnConfig.reset} title="Reset to v2 Default">
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <button
                  type="button"
                  className={`test-analysis-chip justify-start text-left${acnConfig.config.preset === 'v2_completed' ? ' is-active' : ''}`}
                  onClick={() => acnConfig.setPreset('v2_completed')}
                >
                  v2: (N_total - n count) / completed items
                </button>
                <button
                  type="button"
                  className={`test-analysis-chip justify-start text-left${acnConfig.config.preset === 'v2_fixed49' ? ' is-active' : ''}`}
                  onClick={() => acnConfig.setPreset('v2_fixed49')}
                >
                  v2: (N_total - n count) / 49 items
                </button>
                <button
                  type="button"
                  className={`test-analysis-chip justify-start text-left${acnConfig.config.preset === 'v1_legacy_probe_avg' ? ' is-active' : ''}`}
                  onClick={() => acnConfig.setPreset('v1_legacy_probe_avg')}
                >
                  v1: Probed Depth Avg (legacy)
                </button>
                <button
                  type="button"
                  className={`test-analysis-chip justify-start text-left${acnConfig.config.preset === 'custom' ? ' is-active' : ''}`}
                  onClick={() => acnConfig.setPreset('custom')}
                >
                  Custom Formula
                </button>
                {acnConfig.config.preset === 'custom' && (
                  <input
                    type="text"
                    className="mt-1 px-2 py-1 text-xs border rounded border-slate-300 dark:border-slate-700 bg-transparent"
                    value={acnConfig.config.customFormula || ''}
                    onChange={(e) => acnConfig.setCustomFormula(e.target.value)}
                    placeholder="(N_total - totalN) / finalized_count"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          </details>

          <details className="test-analysis-filter-menu">
            <summary>
              <span>Metrics</span>
              <strong>{standaloneMetricCards.length}/{enabledStandaloneMetricCount}</strong>
            </summary>
            <div className="test-analysis-filter-popover">
              <div className="test-analysis-chip-grid is-tight">
              {metricSettings.standaloneTestMetrics.filter((metric) => metric.enabled).map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={`test-analysis-chip${metricUi[metric.key] !== false ? ' is-active' : ''}`}
                  onClick={() => toggleMetric(metric.key)}
                  title={metricUi[metric.key] !== false ? 'Hide metric' : 'Show metric'}
                >
                  {standaloneMetricLabel(metric, racMetricLabel)}
                </button>
              ))}
              </div>
            </div>
          </details>

          <details className="test-analysis-filter-menu is-wide">
            <summary>
              <span>Charts</span>
              <strong>{chartOrder.filter((key) => !chartUi[key].hidden).length}/{chartOrder.length}</strong>
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
        </aside>

        <div className="test-analysis-chart-stack">
          <div className="test-analysis-chart-row">
            {!chartUi.tube.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('tube') }}>
            <Panel
              className={chartPanelClass('tube')}
              icon={CircleDot}
              title="Question Record Tube Chart"
              description="Each question is one tube. Records are stacked bottom-up: first primary record at the bottom, final probe record at the top. Finalized/corrected questions only."
              actions={chartActions('tube')}
              collapsible={false}
            >
              <div className="standalone-chart-wrap test-analysis-tube-wrap">
                <div className="test-analysis-tube-scroll" role="img" aria-label="Question record tube chart showing N_total color records by question">
                  {recordTubeRows.length ? recordTubeRows.map((row) => (
                    <div key={row.index} className="test-analysis-tube-col">
                      <div className="test-analysis-tube-stack" title={`${row.label} - N_total ${row.records.length}`}>
                        {row.records.map((record) => (
                          <span
                            key={`${row.index}-${record.index}`}
                            className="test-analysis-tube-bead"
                            style={{ background: COLOR_HEX[record.color] }}
                            title={`${row.label} - ${record.label}`}
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
                  )) : (
                    <div className="test-analysis-empty-chart">No finalized records in the current filter.</div>
                  )}
                </div>
              </div>
            </Panel>
            </div>
            ) : null}

            {!chartUi.mix.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('mix') }}>
            <Panel
              className={chartPanelClass('mix')}
              icon={BarChart3}
              title="7-Color Record Mix by Session"
              description="Stacked count of N_total records by session across Red, Orange, Yellow, Green, Blue, Indigo, and Purple."
              actions={chartActions('mix')}
              collapsible={false}
            >
              <div className="standalone-chart-wrap is-short">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sessionRecordMixRows} margin={{ top: 36, right: 20, bottom: 8, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="shortLabel" stroke="#334155" fontSize={12} tickLine={false} interval={0} />
                    <YAxis stroke="#334155" fontSize={11} tickLine={false} allowDecimals={false} label={{ value: 'Records', angle: -90, position: 'insideLeft', fill: '#334155' }} />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                            <div className="mb-1 font-black text-slate-950">
                              Session {row.session} - N_total {row.nTotal} - Avg %x: <span className="font-bold" style={{ color: COLOR_HEX[row.avgXColor] }}>{Number(row.avgPercentX ?? 0).toFixed(1)}%</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {SPECTRUM_COLORS.map((color) => (
                                <span key={color} style={{ color: COLOR_HEX[color] }}>{COLOR_LABELS[color]}: <strong>{row[color]}</strong></span>
                              ))}
                            </div>
                          </div>
                        )
                      }}
                    />
                    {SPECTRUM_COLORS.map((color, index) => (
                      <Bar key={color} dataKey={color} stackId="records" name={COLOR_LABELS[color]} fill={COLOR_HEX[color]} isAnimationActive={false}>
                        {chartUi.mix.showLabels && index === SPECTRUM_COLORS.length - 1 ? <LabelList dataKey="nTotal" position="top" className="test-analysis-chart-label" /> : null}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            </div>
            ) : null}
          </div>

          <div className="test-analysis-chart-row">
            {!chartUi.recordCpdQuestion.hidden ? (
              <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('recordCpdQuestion') }}>
              <Panel
                className={chartPanelClass('recordCpdQuestion')}
                icon={Zap}
                title="Record CPD by Question"
                description="Each question groups its N_total records. Record CPD = base CPD x the 7-color factor for that record."
                actions={chartActions('recordCpdQuestion')}
                collapsible={false}
              >
                <div className="standalone-chart-wrap test-analysis-record-cpd-wrap">
                  <div className="test-analysis-record-cpd-scroll" role="img" aria-label="CPD for each N_total record grouped by question">
                    {recordTubeRows.length ? recordTubeRows.map((row) => {
                      const maxCpd = Math.max(...row.records.map((record) => record.cpd), 1)
                      return (
                        <div key={row.index} className="test-analysis-record-cpd-group">
                          <div className="test-analysis-record-cpd-bars" title={`${row.label} - ${row.records.length} records`}>
                            {row.records.map((record) => (
                              <span
                                key={`${row.index}-${record.index}`}
                                className="test-analysis-record-cpd-bar"
                                style={{ height: `${Math.max(8, (record.cpd / maxCpd) * 100)}%`, background: COLOR_HEX[record.color] }}
                                title={`${row.shortLabel}-R${record.index} - ${COLOR_LABELS[record.color]} - CPD ${volt(record.cpd)}`}
                              />
                            ))}
                          </div>
                          {chartUi.recordCpdQuestion.showLabels ? (
                            <>
                              <strong>{row.shortLabel}</strong>
                              <span>{row.records.length} records</span>
                            </>
                          ) : null}
                        </div>
                      )
                    }) : (
                      <div className="test-analysis-empty-chart">No finalized record CPD in the current filter.</div>
                    )}
                  </div>
                </div>
              </Panel>
              </div>
            ) : null}

            {!chartUi.recordCpdTimeline.hidden ? (
              <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('recordCpdTimeline') }}>
              <Panel
                className={chartPanelClass('recordCpdTimeline')}
                icon={LineChartIcon}
                title="Record CPD Timeline"
                description="One point per N_total record in package order: Q1-R1, Q2-R1, Q2-R2, and so on."
                actions={chartActions('recordCpdTimeline')}
                collapsible={false}
              >
                <div className="standalone-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={recordCpdRows} margin={{ top: 36, right: 20, bottom: 8, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="label" stroke="#334155" fontSize={11} interval={0} tickLine={false} />
                      <YAxis stroke={METRIC_HEX.cpd} fontSize={11} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}V`} label={{ value: 'Record CPD (V)', angle: -90, position: 'insideLeft', fill: METRIC_HEX.cpd }} />
                      <Tooltip
                        cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0]?.payload
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                              <div className="mb-1 font-black text-slate-950">{row.label}</div>
                              <div>Record CPD: <strong style={{ color: METRIC_HEX.cpd }}>{volt(row.cpd)}</strong></div>
                              <div>Formula: {volt(row.baseCpd)} x {row.score}</div>
                              <div>Result record: <strong style={{ color: row.colorHex }}>{row.colorLabel}</strong></div>
                              <div>Session: <strong>{row.session}</strong></div>
                            </div>
                          )
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cpd"
                        name="Record CPD"
                        stroke={METRIC_HEX.cpd}
                        strokeWidth={3}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props
                          if (typeof cx !== 'number' || typeof cy !== 'number') return null
                          return <circle cx={cx} cy={cy} r={5} fill={payload.colorHex} stroke="#0f172a" strokeWidth={2} />
                        }}
                        activeDot={(props: any) => {
                          const { cx, cy, payload } = props
                          if (typeof cx !== 'number' || typeof cy !== 'number') return null
                          return <circle cx={cx} cy={cy} r={7} fill={payload.colorHex} stroke="#0f172a" strokeWidth={2} />
                        }}
                        isAnimationActive={false}
                      >
                        {chartUi.recordCpdTimeline.showLabels ? <LabelList dataKey="cpd" position="top" offset={10} formatter={(value: unknown) => `${Number(value).toFixed(0)}V`} className="test-analysis-chart-label" /> : null}
                      </Line>
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              </div>
            ) : null}
          </div>

          <div className="test-analysis-chart-row">
            {!chartUi.questionCpd.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('questionCpd') }}>
          <Panel
            className={chartPanelClass('questionCpd')}
            icon={LineChartIcon}
            title="CPD by Question"
              description={`${metrics.finalized}/${metrics.total} finalized questions - Final CPD = CVR x CCI x color score.`}
              actions={chartActions('questionCpd')}
              collapsible={false}
            >
              <div className="standalone-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={chartRows} margin={{ top: 36, right: 20, bottom: 8, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="label" stroke="#334155" fontSize={11} interval="preserveStartEnd" tickLine={false} />
                    <YAxis
                      stroke="#334155"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(value) => `${value}V`}
                      label={{ value: 'Final CPD (V)', angle: -90, position: 'insideLeft', fill: METRIC_HEX.cpd }}
                    />
                    <Tooltip
                      cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                            <div className="mb-1 font-black text-slate-950">{row.label}</div>
                            <div>Final CPD: <strong style={{ color: METRIC_HEX.cpd }}>{volt(row.cpd)}</strong></div>
                            <div>Formula: {volt(row.baseCpd)} x {row.resultScore}</div>
                            <div>CVR: <strong style={{ color: METRIC_HEX.cvr }}>{ohm(row.cvr)}</strong> - CCI: <strong style={{ color: METRIC_HEX.cci }}>{amp(row.cci)}</strong></div>
                            <div>Result: <strong className="capitalize" style={{ color: row.colorHex }}>{row.color}</strong></div>
                            <div>Session: <strong>{row.session}</strong> - {row.language}</div>
                            {row.prompt ? <div className="mt-1 max-w-xs text-slate-600">"{row.prompt}"</div> : null}
                          </div>
                        )
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cpd"
                      name="Final CPD"
                      stroke={METRIC_HEX.cpd}
                      strokeWidth={3}
                      dot={<ResultDot />}
                      activeDot={<ResultDot />}
                      isAnimationActive={false}
                    >
                      {chartUi.questionCpd.showLabels ? <LabelList dataKey="cpd" position="top" offset={10} formatter={(value: unknown) => `${Number(value).toFixed(0)}V`} className="test-analysis-chart-label" /> : null}
                    </Line>
                    <Brush
                      dataKey="label"
                      height={24}
                      stroke={METRIC_HEX.cpd}
                      travellerWidth={10}
                      startIndex={cpdBrushIndexes.startIndex}
                      endIndex={cpdBrushIndexes.endIndex}
                      onChange={handleQuestionBrushChange}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
          </Panel>
            </div>
            ) : null}

            {!chartUi.percentSession.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('percentSession') }}>
            <Panel
              className={chartPanelClass('percentSession')}
              icon={LineChartIcon}
              title={`${racMetricLabel} by Session`}
              description={`${racMetricLabel} = Avg %x for each session. Legacy RAC remains available as an optional Admin metric.`}
              actions={chartActions('percentSession')}
              collapsible={false}
            >
              <div className="standalone-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={percentCTimelineRows} margin={{ top: 42, right: 20, bottom: 8, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="shortLabel" stroke="#334155" fontSize={12} tickLine={false} interval={0} />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      stroke="#334155"
                      fontSize={11}
                      tickLine={false}
                      label={{ value: racMetricLabel, angle: -90, position: 'insideLeft', fill: METRIC_HEX.percentC }}
                    />
                    <Tooltip
                      cursor={{ stroke: METRIC_HEX.percentC, strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                            <div className="mb-1 font-black text-slate-950">{row.label}</div>
                            <div>{racMetricLabel}: <strong style={{ color: METRIC_HEX.percentC }}>{Number(row.percentC ?? 0).toFixed(1)}%</strong> <span style={{ color: COLOR_HEX[row.avgXColor] }}>({COLOR_LABELS[row.avgXColor]})</span></div>
                            <div>Legacy RAC: <strong>{row.legacyRac}%</strong></div>
                            <div>Formula: <strong>{row.sumPercentX.toFixed(1)} / {row.nTotal}</strong> average normalized spectrum factor.</div>
                            <div>Finalized: <strong>{row.finalized}</strong> questions</div>
                            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                              {SPECTRUM_COLORS.map((color) => (
                                <span key={color} style={{ color: COLOR_HEX[color] }}>{COLOR_LABELS[color]}: {row.byColor[color]}</span>
                              ))}
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="percentC"
                      name={racMetricLabel}
                      stroke={METRIC_HEX.percentC}
                      strokeWidth={3}
                      dot={{ r: 5, fill: METRIC_HEX.percentC, stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: METRIC_HEX.percentC, stroke: '#0f172a', strokeWidth: 2 }}
                      isAnimationActive={false}
                    >
                      {chartUi.percentSession.showLabels ? (
                        <LabelList dataKey="percentCLabel" position="top" offset={10} fill={METRIC_HEX.percentC} className="test-analysis-chart-label" />
                      ) : null}
                    </Line>
                    <Brush
                      dataKey="shortLabel"
                      height={24}
                      stroke={METRIC_HEX.percentC}
                      travellerWidth={10}
                      startIndex={sessionBrushStart}
                      endIndex={sessionBrushEnd}
                      onChange={handleSessionBrushChange}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            </div>
            ) : null}
          </div>

          <div className="test-analysis-chart-row">
            {!chartUi.percentCpd.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('percentCpd') }}>
            <Panel
              className={chartPanelClass('percentCpd')}
              icon={LineChartIcon}
              title={`${racMetricLabel} & Avg CPD by Session`}
              description={`Dual-axis line chart: Session on X, ${racMetricLabel} as Avg %x, Avg CPD as the blue line.`}
              actions={chartActions('percentCpd')}
              collapsible={false}
            >
              <div className="standalone-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={percentCTimelineRows} margin={{ top: 42, right: 18, bottom: 8, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="shortLabel" stroke="#334155" fontSize={12} tickLine={false} interval={0} />
                    <YAxis
                      yAxisId="percent"
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      stroke={METRIC_HEX.percentC}
                      fontSize={11}
                      tickLine={false}
                      label={{ value: racMetricLabel, angle: -90, position: 'insideLeft', fill: METRIC_HEX.percentC }}
                    />
                    <YAxis
                      yAxisId="cpd"
                      orientation="right"
                      tickFormatter={(value) => `${Number(value).toFixed(0)}V`}
                      stroke={METRIC_HEX.cpd}
                      fontSize={11}
                      tickLine={false}
                      label={{ value: 'Avg CPD (V)', angle: 90, position: 'insideRight', fill: METRIC_HEX.cpd }}
                    />
                    <Tooltip
                      cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                            <div className="mb-1 font-black text-slate-950">{row.label}</div>
                            <div>{racMetricLabel}: <strong style={{ color: METRIC_HEX.percentC }}>{Number(row.percentC ?? 0).toFixed(1)}%</strong> <span style={{ color: COLOR_HEX[row.avgXColor] }}>({COLOR_LABELS[row.avgXColor]})</span></div>
                            <div>Legacy RAC: <strong>{row.legacyRac}%</strong></div>
                            <div>Formula: <strong>{row.sumPercentX.toFixed(1)} / {row.nTotal}</strong> average normalized spectrum factor.</div>
                            <div>Avg CPD: <strong style={{ color: METRIC_HEX.cpd }}>{volt(row.avgCpd)}</strong></div>
                            <div>Finalized: <strong>{row.finalized}</strong> questions</div>
                          </div>
                        )
                      }}
                    />
                    <Line
                      yAxisId="percent"
                      type="monotone"
                      dataKey="percentC"
                      name={racMetricLabel}
                      stroke={METRIC_HEX.percentC}
                      strokeWidth={3}
                      dot={{ r: 5, fill: METRIC_HEX.percentC, stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: METRIC_HEX.percentC, stroke: '#0f172a', strokeWidth: 2 }}
                      isAnimationActive={false}
                    >
                      {chartUi.percentCpd.showLabels ? (
                        <LabelList dataKey="percentCLabel" position="top" offset={10} fill={METRIC_HEX.percentC} className="test-analysis-chart-label" />
                      ) : null}
                    </Line>
                    <Line
                      yAxisId="cpd"
                      type="monotone"
                      dataKey="avgCpd"
                      name="Avg CPD"
                      stroke={METRIC_HEX.cpd}
                      strokeWidth={3}
                      dot={{ r: 5, fill: METRIC_HEX.cpd, stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: METRIC_HEX.cpd, stroke: '#0f172a', strokeWidth: 2 }}
                      isAnimationActive={false}
                    >
                      {chartUi.percentCpd.showLabels ? <LabelList dataKey="avgCpd" position="bottom" offset={10} formatter={(value: unknown) => `${Number(value).toFixed(0)}V`} className="test-analysis-chart-label" /> : null}
                    </Line>
                    <Brush
                      dataKey="shortLabel"
                      height={24}
                      stroke={METRIC_HEX.cpd}
                      travellerWidth={10}
                      startIndex={sessionBrushStart}
                      endIndex={sessionBrushEnd}
                      onChange={handleSessionBrushChange}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            </div>
            ) : null}

            {!chartUi.distribution.hidden ? (
            <div className="test-analysis-chart-slot" style={{ order: chartOrder.indexOf('distribution') }}>
            <Panel
              className={chartPanelClass('distribution')}
              icon={PieChartIcon}
              title="Result Color Distribution"
              description="Distribution of finalized effective results across the 7-color spectrum."
              actions={chartActions('distribution')}
              collapsible={false}
            >
            <div className="standalone-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                          <div className="font-black" style={{ color: row.fill }}>{row.name}</div>
                          <div>Questions: <strong>{row.count}</strong></div>
                          <div>Share: <strong>{row.percent}%</strong></div>
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
                    label={chartUi.distribution.showLabels ? ({ payload }: any) => (payload?.percent ? `${payload.percent}%` : '') : false}
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
  </div>
  )
}
