import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Activity,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  GripVertical,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { UserAvatar } from '../../components/UserAvatar'
import { ScreenTooltip } from '../../components/ScreenTooltip'
import { EmptyState, Panel } from '../../components/ui'
import { PROBE_ACTIONS } from '../../modules/assessment/probe-actions'
import { probeChunksNumber } from '../../modules/assessment/probe-metrics'
import { listActiveLearners } from '../../modules/roster/service'
import { getTestPackageVersion, listTestPackages, listTestSections } from '../../lib/test-packages'
import {
  completeStandaloneRun,
  findLatestApprovedNarrationVariant,
  getStandaloneRun,
  getStandaloneRunRuntime,
  getStandaloneTestRunBundle,
  listStandaloneAssignments,
  listStandaloneRunItems,
  listStandaloneRuns,
  prepareStandaloneRun,
  recordStandaloneResult,
  resolveStandaloneProbe,
  startStandaloneRun,
  stopStandaloneRun,
  type StandaloneTestRunRow,
} from '../../lib/standalone-tests'
import { getNarrationPlaybackUrl } from '../../modules/catalog/live-test-generation'
import { triggerConfetti } from '../../lib/confetti'
import { useAppState } from '../../state/useAppState'
import { calculateSpectrumStepBreakdown, colorForAvgPercentX } from '../../modules/metrics/calculate'
import { racMetricLabelForPackage, type PackageRacMetricLabel } from '../../modules/metrics/display-labels'
import { SPECTRUM_COLORS, type ProvisionalColor, type ResultColor } from '../../modules/result-lifecycle/types'
import { resultAudioUrl } from '../../lib/color-audio'

type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'played' | 'error'
type AudioTarget = 'item' | 'result_reaction' | 'session_intro' | 'package_start' | 'part_intro_1' | 'part_intro_2' | 'part_intro_3' | 'package_end' | 'item_prefix'
type PartIntroNumber = 1 | 2 | 3
type PrimaryResultColor = ProvisionalColor
type ReactionKind = 'celebrate' | 'happy' | 'fight'
type Reaction = { kind: ReactionKind; color: ResultColor; id: number } | null

type TestItem = Record<string, any>
type ItemPlaybackCacheEntry = { variantId: string; signedUrl: string; isSilent?: boolean }
type RunPageCacheEntry = {
  expiresAt: number
  runDetails: StandaloneTestRunRow | null
  allRuns: StandaloneTestRunRow[]
  items: TestItem[]
  racMetricLabel: PackageRacMetricLabel
  introVariantId: string | null
  sessionIntroVariantIds: Record<number, string | null>
  packageStartVariantId: string | null
  partIntroVariantIds: Record<PartIntroNumber, string | null>
  packageEndVariantId: string | null
}

const RUN_PAGE_CACHE_TTL_MS = 120_000
const runPageCache = new Map<string, RunPageCacheEntry>()

function runPageCacheKey(runId?: string | null, assignmentId?: string | null): string | null {
  if (!runId) return null
  return `${runId}:${assignmentId ?? ''}`
}

const COLORS: Array<{ key: PrimaryResultColor; label: string; num: string; hex: string }> = [
  { key: 'red', label: 'Red', num: '0', hex: '#ef4444' },
  { key: 'orange', label: 'Orange', num: '1', hex: '#f97316' },
  { key: 'green', label: 'Green', num: '2', hex: '#22c55e' },
  { key: 'purple', label: 'Purple', num: '3', hex: '#a855f7' },
]

const COLOR_HEX: Record<ResultColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#38bdf8',
  indigo: '#6366f1',
  purple: '#a855f7',
}

const COLOR_LABEL: Record<ResultColor, string> = {
  red: '0 · Red',
  orange: '1 · Orange',
  yellow: 'F · Yellow',
  green: '2 · Green',
  blue: 'C · Blue',
  indigo: 'D · Indigo',
  purple: '3 · Purple',
}

const SUMMARY_TILE_CLASS: Record<ResultColor, string> = {
  red: 'bg-red-500/10 border-red-500/30',
  orange: 'bg-orange-500/10 border-orange-500/30',
  yellow: 'bg-yellow-500/10 border-yellow-500/30',
  green: 'bg-emerald-500/10 border-emerald-500/30',
  blue: 'bg-sky-500/10 border-sky-500/30',
  indigo: 'bg-indigo-500/10 border-indigo-500/30',
  purple: 'bg-purple-500/10 border-purple-500/30',
}

const SUMMARY_TILE_COUNT_CLASS: Record<ResultColor, string> = {
  red: 'text-red-500',
  orange: 'text-orange-500',
  yellow: 'text-yellow-500',
  green: 'text-emerald-500',
  blue: 'text-sky-500',
  indigo: 'text-indigo-500',
  purple: 'text-purple-500',
}

const SUMMARY_TILE_LABEL_CLASS: Record<ResultColor, string> = {
  red: 'text-red-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-500',
  green: 'text-emerald-400',
  blue: 'text-sky-400',
  indigo: 'text-indigo-400',
  purple: 'text-purple-400',
}

const RAIL_W_KEY = 'chunks-lms:live-test-rail-w'
const RAIL_MIN = 168
const RAIL_MAX = 460
const RAIL_DEFAULT = 342
const RAIL_COLLAPSED = 48
const AUDIO_AUTOPLAY_ITEMS_KEY = 'chunks-lms:live-test-autoplay-items'
const AUDIO_AUTOPLAY_INTRO_KEY = 'chunks-lms:live-test-autoplay-intro'
const AUDIO_AUTOPLAY_PACKAGE_START_KEY = 'chunks-lms:live-test-autoplay-package-start'
const AUDIO_AUTOPLAY_PART_INTRO_KEY = 'chunks-lms:live-test-autoplay-part-intro'
const AUDIO_AUTOPLAY_PACKAGE_END_KEY = 'chunks-lms:live-test-autoplay-package-end'
const AUDIO_STANDARD_FLOW_KEY = 'chunks-lms:live-test-standard-audio-flow-v1'
const AUDIO_RATE_KEY = 'chunks-lms:live-test-audio-rate'
const AUDIO_VOLUME_KEY = 'chunks-lms:live-test-audio-volume'
const AUDIO_PANEL_OPEN_KEY = 'chunks-lms:live-test-audio-panel-open'
const AUDIO_RUN_READY_PREFIX = 'chunks-lms:live-test-audio-ready:'
const AUDIO_RUN_READY_TTL_MS = 12 * 60 * 60 * 1000

function liveAudioReadyKey(runId?: string | null, assignmentId?: string | null) {
  return `${AUDIO_RUN_READY_PREFIX}${assignmentId || runId || 'unknown'}`
}

function readLiveAudioReady(runId?: string | null, assignmentId?: string | null): boolean {
  if (typeof window === 'undefined' || (!runId && !assignmentId)) return false
  try {
    const raw = window.localStorage.getItem(liveAudioReadyKey(runId, assignmentId))
    if (!raw) return false
    const parsed = JSON.parse(raw) as { ready?: boolean; updatedAt?: number }
    return parsed.ready === true && typeof parsed.updatedAt === 'number' && Date.now() - parsed.updatedAt < AUDIO_RUN_READY_TTL_MS
  } catch {
    return false
  }
}

function writeLiveAudioReady(runId?: string | null, assignmentId?: string | null) {
  if (typeof window === 'undefined' || (!runId && !assignmentId)) return
  try {
    window.localStorage.setItem(liveAudioReadyKey(runId, assignmentId), JSON.stringify({ ready: true, updatedAt: Date.now() }))
  } catch {
    /* best effort */
  }
}

function reactionFor(color: ResultColor): ReactionKind {
  if (color === 'purple') return 'celebrate'
  if (color === 'green') return 'happy'
  return 'fight'
}

function getItemAttempt(item: TestItem | null | undefined) {
  return item?.standalone_test_attempts?.[0] ?? null
}

function getItemSnapshot(item: TestItem | null | undefined) {
  return getItemAttempt(item)?.standalone_test_attempt_snapshots ?? null
}

function getItemColor(item: TestItem | null | undefined): ResultColor | null {
  return (getItemSnapshot(item)?.effective_color as ResultColor) ?? null
}

function isItemFinalized(item: TestItem | null | undefined): boolean {
  return ['finalized', 'corrected'].includes(getItemSnapshot(item)?.status)
}

function withStandaloneSnapshot(
  item: TestItem,
  snapshot: { attemptId: string; status: string; effectiveColor: string | null; probeCount: number },
  enteredProbeFlow: boolean,
): TestItem {
  const existingAttempt = getItemAttempt(item) ?? {}
  const existingSnapshot = getItemSnapshot(item) ?? {}
  return {
    ...item,
    standalone_test_attempts: [
      {
        ...existingAttempt,
        id: snapshot.attemptId,
        standalone_test_attempt_snapshots: {
          ...existingSnapshot,
          status: snapshot.status,
          effective_color: snapshot.effectiveColor,
          effectiveColor: snapshot.effectiveColor,
          probe_count: snapshot.probeCount,
          probeCount: snapshot.probeCount,
          entered_probe_flow: enteredProbeFlow,
          enteredProbeFlow,
          finalized_at:
            snapshot.status === 'finalized' || snapshot.status === 'corrected'
              ? (existingSnapshot.finalized_at ?? existingSnapshot.finalizedAt ?? new Date().toISOString())
              : null,
        },
      },
    ],
  }
}

function cpdValue(item: TestItem | null | undefined): number | null {
  if (!item) return null
  const raw = item.cpd ?? (item.cvr !== undefined && item.cci !== undefined ? Number(item.cvr) * Number(item.cci) : null)
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function resultColorScore(color: ResultColor | null): number | null {
  if (!color) return null
  if (color === 'red') return 0
  if (color === 'orange') return 0.17
  if (color === 'yellow') return 0.33
  if (color === 'green') return 0.5
  if (color === 'blue') return 0.67
  if (color === 'indigo') return 0.83
  return 1
}

function achievedCpdValue(item: TestItem | null | undefined): number | null {
  if (!isItemFinalized(item)) return null
  const baseCpd = cpdValue(item)
  if (baseCpd == null) return null
  const snapshot = getItemSnapshot(item)
  const storedScore = Number(snapshot?.effective_score ?? snapshot?.effectiveScore)
  const score = Number.isFinite(storedScore) ? storedScore : resultColorScore(getItemColor(item))
  return score == null ? null : Math.round(baseCpd * score * 100) / 100
}

function metricNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatOhm(value: unknown): string {
  const n = metricNumber(value)
  return n == null ? '—' : `${n} Ω`
}

function formatAmp(value: unknown): string {
  const n = metricNumber(value)
  return n == null ? '—' : `${n}A`
}

function formatVolt(value: unknown): string {
  const n = metricNumber(value)
  return n == null ? '—' : `${Math.round(n * 100) / 100}V`
}

function readSavedRailWidth(): number {
  try {
    const raw = window.localStorage.getItem(RAIL_W_KEY)
    if (!raw || raw === '244') return RAIL_DEFAULT
    const n = Number(raw)
    if (Number.isFinite(n)) return Math.min(RAIL_MAX, Math.max(RAIL_MIN, n))
  } catch {
    /* ignore */
  }
  return RAIL_DEFAULT
}

function readSavedBoolean(key: string, fallback: boolean): boolean {
  try {
    const saved = window.localStorage.getItem(key)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

function clampAudioRate(value: number): number {
  return Math.min(3, Math.max(0.5, Number.isFinite(value) ? value : 1))
}

function readSavedNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const saved = Number(window.localStorage.getItem(key))
    if (Number.isFinite(saved)) return Math.min(max, Math.max(min, saved))
  } catch {
    /* ignore */
  }
  return fallback
}

function readSavedVolume(): number {
  const saved = readSavedNumber(AUDIO_VOLUME_KEY, 0.85, 0, 1)
  return saved <= 0 ? 0.85 : saved
}

function audibleVolume(value: number): number {
  return value <= 0 ? 0.85 : Math.min(1, Math.max(0.05, value))
}

function languageForSectionOrder(
  sectionOrder: number,
  fallback: 'vi' | 'en',
  languagePolicy?: unknown,
): 'vi' | 'en' {
  if (languagePolicy === 'alternating_vi_en') return sectionOrder % 2 === 1 ? 'vi' : 'en'
  if (languagePolicy === 'first4_en_last4_vi') return sectionOrder <= 4 ? 'en' : 'vi'
  if (languagePolicy === 'green_test_49q') return sectionOrder <= 3 || sectionOrder === 7 ? 'en' : 'vi'
  return fallback
}

function partIntroLabel(part: PartIntroNumber): string {
  if (part === 1) return 'Part I'
  if (part === 2) return 'Part II'
  return 'Part III'
}

function partIntroTarget(part: PartIntroNumber): Extract<AudioTarget, 'part_intro_1' | 'part_intro_2' | 'part_intro_3'> {
  if (part === 1) return 'part_intro_1'
  if (part === 2) return 'part_intro_2'
  return 'part_intro_3'
}

export function TeacherTestRunPage() {
  const { runId } = useParams()
  const [searchParams] = useSearchParams()
  const assignmentIdParam = searchParams.get('assignmentId')
  const navigate = useNavigate()
  const { roster } = useAppState()

  const [runDetails, setRunDetails] = useState<StandaloneTestRunRow | null>(null)
  const [allRuns, setAllRuns] = useState<StandaloneTestRunRow[]>([])
  const [items, setItems] = useState<TestItem[]>([])
  const [racMetricLabel, setRacMetricLabel] = useState<PackageRacMetricLabel>('%c')
  const [introVariantId, setIntroVariantId] = useState<string | null>(null)
  const [sessionIntroVariantIds, setSessionIntroVariantIds] = useState<Record<number, string | null>>({})
  const [packageStartVariantId, setPackageStartVariantId] = useState<string | null>(null)
  const [partIntroVariantIds, setPartIntroVariantIds] = useState<Record<PartIntroNumber, string | null>>({ 1: null, 2: null, 3: null })
  const [packageEndVariantId, setPackageEndVariantId] = useState<string | null>(null)
  const [isSummaryShown, setIsSummaryShown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [audioLabel, setAudioLabel] = useState('Current item')
  const [audioState, setAudioState] = useState<AudioState>('idle')
  const [audioRate, setAudioRate] = useState(1)
  const [audioVolume, setAudioVolume] = useState(0.85)
  const [autoPlayItems, setAutoPlayItems] = useState(true)
  const [autoPlaySessionIntro, setAutoPlaySessionIntro] = useState(true)
  const [autoPlayPackageStart, setAutoPlayPackageStart] = useState(true)
  const [autoPlayPartIntro, setAutoPlayPartIntro] = useState(true)
  const [autoPlayPackageEnd, setAutoPlayPackageEnd] = useState(true)
  const [audioPanelOpen, setAudioPanelOpen] = useState(true)
  const [liveAudioStarted, setLiveAudioStarted] = useState(false)
  const [isRestoringRun, setIsRestoringRun] = useState(true)
  const [reaction, setReaction] = useState<Reaction>(null)
  const [message, setMessage] = useState('')
  const [showHeader, setShowHeader] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [mapOpen, setMapOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true,
  )
  const [railWidth, setRailWidth] = useState(readSavedRailWidth)
  const [resizing, setResizing] = useState(false)
  const railWidthRef = useRef(railWidth)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioUrlRef = useRef('')
  const itemPlaybackCacheRef = useRef<Record<string, ItemPlaybackCacheEntry>>({})
  const audioTargetRef = useRef<AudioTarget>('item')
  const liveAudioStartedRef = useRef(false)
  const suppressAutoPlayAfterRestoreRef = useRef(false)
  const autoPlayedItemIdsRef = useRef<Set<string>>(new Set())
  const sessionIntroPlayedRef = useRef<Record<number, boolean>>({})
  const playFirstItemAfterIntroRef = useRef(false)
  const firstItemAfterIntroIndexRef = useRef<number | null>(null)
  const pendingFirstItemAudioIndexRef = useRef<number | null>(null)
  const pendingAfterEndNavigationRef = useRef<string | null>(null)
  const pendingAfterReactionRef = useRef<{ signedUrl: string; label: string; itemId?: string; variantId?: string; isSilent?: boolean } | null>(null)
  const suppressNextItemEffectForIdRef = useRef<string | null>(null)
  const partIntroPlayedRef = useRef<Record<PartIntroNumber, boolean>>({ 1: false, 2: false, 3: false })
  const packageEndPlayedRef = useRef(false)
  const enteringProbeRef = useRef<string | null>(null)
  const pendingItemAudioRef = useRef<{ signedUrl: string | null; variantId: string; isSilent?: boolean } | null>(null)
  const isScoringBusyRef = useRef(false)

  const markAudioReady = useCallback((options: { suppressAutoPlay?: boolean; persist?: boolean; assignmentId?: string | null } = {}) => {
    liveAudioStartedRef.current = true
    suppressAutoPlayAfterRestoreRef.current = options.suppressAutoPlay === true
    setLiveAudioStarted(true)
    if (options.persist !== false) writeLiveAudioReady(runId, options.assignmentId ?? assignmentIdParam)
  }, [assignmentIdParam, runId])

  const resumeAudioAutoFlow = useCallback(() => {
    suppressAutoPlayAfterRestoreRef.current = false
    if (!liveAudioStartedRef.current) markAudioReady({ suppressAutoPlay: false })
  }, [markAudioReady])

  useEffect(() => {
    autoPlayedItemIdsRef.current = new Set()
    sessionIntroPlayedRef.current = {}
    partIntroPlayedRef.current = { 1: false, 2: false, 3: false }
    packageEndPlayedRef.current = false
    itemPlaybackCacheRef.current = {}
    suppressAutoPlayAfterRestoreRef.current = false
    liveAudioStartedRef.current = false
    setLiveAudioStarted(false)
    if (readLiveAudioReady(runId, assignmentIdParam)) {
      markAudioReady({ suppressAutoPlay: true, persist: false, assignmentId: assignmentIdParam })
      setAudioState('ready')
      setAudioLabel('Live test restored')
      setMessage('Live test restored. Audio is ready; auto-play is paused until you press Play or score the next item.')
    }
  }, [assignmentIdParam, markAudioReady, runId])

  useEffect(() => {
    setRailWidth(readSavedRailWidth())
    let forceStandardFlow = false
    try {
      forceStandardFlow = window.localStorage.getItem(AUDIO_STANDARD_FLOW_KEY) !== 'enabled'
      if (forceStandardFlow) {
        window.localStorage.setItem(AUDIO_STANDARD_FLOW_KEY, 'enabled')
        window.localStorage.setItem(AUDIO_AUTOPLAY_ITEMS_KEY, 'true')
        window.localStorage.setItem(AUDIO_AUTOPLAY_INTRO_KEY, 'true')
        window.localStorage.setItem(AUDIO_AUTOPLAY_PACKAGE_START_KEY, 'true')
        window.localStorage.setItem(AUDIO_AUTOPLAY_PART_INTRO_KEY, 'true')
        window.localStorage.setItem(AUDIO_AUTOPLAY_PACKAGE_END_KEY, 'true')
        window.localStorage.setItem(AUDIO_RATE_KEY, '1')
      }
    } catch {
      forceStandardFlow = true
    }
    setAutoPlayItems(forceStandardFlow ? true : readSavedBoolean(AUDIO_AUTOPLAY_ITEMS_KEY, true))
    setAutoPlaySessionIntro(forceStandardFlow ? true : readSavedBoolean(AUDIO_AUTOPLAY_INTRO_KEY, true))
    setAutoPlayPackageStart(forceStandardFlow ? true : readSavedBoolean(AUDIO_AUTOPLAY_PACKAGE_START_KEY, true))
    setAutoPlayPartIntro(forceStandardFlow ? true : readSavedBoolean(AUDIO_AUTOPLAY_PART_INTRO_KEY, true))
    setAutoPlayPackageEnd(forceStandardFlow ? true : readSavedBoolean(AUDIO_AUTOPLAY_PACKAGE_END_KEY, true))
    setAudioRate(clampAudioRate(forceStandardFlow ? 1 : readSavedNumber(AUDIO_RATE_KEY, 1, 0.5, 3)))
    setAudioVolume(readSavedVolume())
    setAudioPanelOpen(readSavedBoolean(AUDIO_PANEL_OPEN_KEY, true))
  }, [])

  useEffect(() => {
    railWidthRef.current = railWidth
  }, [railWidth])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_AUTOPLAY_ITEMS_KEY, String(autoPlayItems))
    } catch {
      /* ignore */
    }
  }, [autoPlayItems])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_AUTOPLAY_INTRO_KEY, String(autoPlaySessionIntro))
    } catch {
      /* ignore */
    }
  }, [autoPlaySessionIntro])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_AUTOPLAY_PACKAGE_START_KEY, String(autoPlayPackageStart))
    } catch {
      /* ignore */
    }
  }, [autoPlayPackageStart])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_AUTOPLAY_PART_INTRO_KEY, String(autoPlayPartIntro))
    } catch {
      /* ignore */
    }
  }, [autoPlayPartIntro])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_AUTOPLAY_PACKAGE_END_KEY, String(autoPlayPackageEnd))
    } catch {
      /* ignore */
    }
  }, [autoPlayPackageEnd])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_PANEL_OPEN_KEY, String(audioPanelOpen))
    } catch {
      /* ignore */
    }
  }, [audioPanelOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_RATE_KEY, String(audioRate))
    } catch {
      /* ignore */
    }
  }, [audioRate])

  useEffect(() => {
    const nextVolume = audibleVolume(audioVolume)
    if (nextVolume !== audioVolume) {
      setAudioVolume(nextVolume)
      return
    }
    try {
      window.localStorage.setItem(AUDIO_VOLUME_KEY, String(nextVolume))
    } catch {
      /* ignore */
    }
  }, [audioVolume])

  const startRailResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!mapOpen) return
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = railWidthRef.current
      setResizing(true)

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startW + (ev.clientX - startX)))
        railWidthRef.current = next
        setRailWidth(next)
      }
      const onUp = () => {
        setResizing(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          window.localStorage.setItem(RAIL_W_KEY, String(railWidthRef.current))
        } catch {
          /* ignore */
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [mapOpen],
  )

  const playReaction = useCallback((color: ResultColor) => {
    const id = Date.now()
    setReaction({ kind: reactionFor(color), color, id })
    if (color === 'purple') {
      triggerConfetti()
    }
    window.setTimeout(() => setReaction((current) => (current?.id === id ? null : current)), 1200)
  }, [])

  const load = useCallback(async () => {
    if (!runId) return
    const cacheKey = runPageCacheKey(runId, assignmentIdParam)
    const cached = cacheKey ? runPageCache.get(cacheKey) : null
    if (cached && cached.expiresAt > Date.now()) {
      setRunDetails(cached.runDetails)
      setAllRuns(cached.allRuns)
      setItems(cached.items)
      setRacMetricLabel(cached.racMetricLabel)
      setIntroVariantId(cached.introVariantId)
      setSessionIntroVariantIds(cached.sessionIntroVariantIds)
      setPackageStartVariantId(cached.packageStartVariantId)
      setPartIntroVariantIds(cached.partIntroVariantIds)
      setPackageEndVariantId(cached.packageEndVariantId)
      const firstUnfinalized = cached.items.findIndex((item) => !isItemFinalized(item))
      if (firstUnfinalized !== -1) {
        setSelectedIndex(firstUnfinalized)
        setIsSummaryShown(false)
      } else if (cached.items.length > 0) {
        setSelectedIndex(cached.items.length - 1)
        setIsSummaryShown(true)
      }
      enteringProbeRef.current = null
      setIsRestoringRun(false)
      return
    }
    setIsRestoringRun(true)
    try {
      const bundleRes = await getStandaloneTestRunBundle(runId, assignmentIdParam || undefined)
      if (bundleRes.ok && bundleRes.data) {
        const bundle = bundleRes.data
        const currentRun = bundle.runDetails
        setRunDetails(currentRun)
        setAllRuns(bundle.allRuns)
        setRacMetricLabel(bundle.racMetricLabel)
        setPackageStartVariantId(bundle.packageAudio.packageStartVariantId)
        setPartIntroVariantIds({
          1: bundle.packageAudio.partIntroVariantIds['1'] ?? null,
          2: bundle.packageAudio.partIntroVariantIds['2'] ?? null,
          3: bundle.packageAudio.partIntroVariantIds['3'] ?? null,
        })
        setPackageEndVariantId(bundle.packageAudio.packageEndVariantId)

        const nextIntroBySession: Record<number, string | null> = {}
        for (const [k, v] of Object.entries(bundle.sessionIntroVariantIds)) {
          nextIntroBySession[Number(k)] = v
        }
        setSessionIntroVariantIds(nextIntroBySession)
        setIntroVariantId(nextIntroBySession[currentRun.sessionNumber] ?? null)

        const combinedItems: TestItem[] = bundle.items.map((item, index) => {
          const standaloneAttempts = item.attempt_id
            ? [
                {
                  id: item.attempt_id,
                  run_id: item.run_id ?? item.parent_run_id,
                  run_item_id: item.id,
                  status: item.attempt_status,
                  standalone_test_attempt_snapshots: {
                    attempt_id: item.attempt_id,
                    status: item.attempt_status,
                    effective_color: item.effective_color,
                    effectiveColor: item.effective_color,
                    entered_probe_flow: item.entered_probe_flow,
                    enteredProbeFlow: item.entered_probe_flow,
                    probe_count: item.probe_count,
                    probeCount: item.probe_count,
                    finalized_at: item.finalized_at,
                  },
                },
              ]
            : []
          const itemAttempts = item.attempt_id
            ? [
                {
                  id: item.attempt_id,
                  status: item.attempt_status,
                  snapshot: {
                    status: item.attempt_status,
                    effectiveColor: item.effective_color,
                    enteredProbeFlow: item.entered_probe_flow,
                    probeCount: item.probe_count,
                    finalizedAt: item.finalized_at,
                  },
                },
              ]
            : []
          return {
            ...item,
            global_item_order: index + 1,
            cvr: item.cvr,
            cci: item.cci,
            cpd: item.cpd,
            standalone_test_attempts: standaloneAttempts,
            attempts: itemAttempts,
          } as unknown as TestItem
        })

        setItems(combinedItems)

        const completed = combinedItems.filter(isItemFinalized).length
        const assignmentId = assignmentIdParam || currentRun.assignmentId
        const restoredReady = readLiveAudioReady(runId, assignmentId)
        if (completed > 0 || restoredReady) {
          markAudioReady({ suppressAutoPlay: true, persist: completed > 0, assignmentId })
          setAudioState((current) => (current === 'idle' ? 'ready' : current))
          setAudioLabel((current) => (current === 'Current item' ? 'Live test restored' : current))
          if (restoredReady && completed === 0) {
            setMessage('Live test restored. Audio is ready; auto-play is paused until you press Play or score the next item.')
          }
        }

        const firstUnfinalized = combinedItems.findIndex((item) => !isItemFinalized(item))
        if (firstUnfinalized !== -1) {
          setSelectedIndex(firstUnfinalized)
          setIsSummaryShown(false)
        } else if (combinedItems.length > 0) {
          setSelectedIndex(combinedItems.length - 1)
          setIsSummaryShown(true)
          triggerConfetti()
        }
        enteringProbeRef.current = null

        if (cacheKey) {
          runPageCache.set(cacheKey, {
            expiresAt: Date.now() + RUN_PAGE_CACHE_TTL_MS,
            runDetails: currentRun,
            allRuns: bundle.allRuns,
            items: combinedItems,
            racMetricLabel: bundle.racMetricLabel,
            introVariantId: nextIntroBySession[currentRun.sessionNumber] ?? null,
            sessionIntroVariantIds: nextIntroBySession,
            packageStartVariantId: bundle.packageAudio.packageStartVariantId,
            partIntroVariantIds: {
              1: bundle.packageAudio.partIntroVariantIds['1'] ?? null,
              2: bundle.packageAudio.partIntroVariantIds['2'] ?? null,
              3: bundle.packageAudio.partIntroVariantIds['3'] ?? null,
            },
            packageEndVariantId: bundle.packageAudio.packageEndVariantId,
          })
        }
        setIsRestoringRun(false)
        return
      }
    } catch {
      // Fall back to legacy sequential queries below
    }

    const primaryRunResult = await getStandaloneRun(runId)
    if (!primaryRunResult.ok || !primaryRunResult.data) {
      setMessage(primaryRunResult.ok ? 'Run not found' : primaryRunResult.error)
      setIsRestoringRun(false)
      return
    }

    const currentRun = primaryRunResult.data
    setRunDetails(currentRun)
    const assignmentId = assignmentIdParam || currentRun.assignmentId
    let targetRuns: StandaloneTestRunRow[] = [currentRun]
    let packageVersionId: string | null = null
    let nextRacMetricLabel: PackageRacMetricLabel = '%c'
    let nextPackageStartVariantId: string | null = null
    let nextPartIntroVariantIds: Record<PartIntroNumber, string | null> = { 1: null, 2: null, 3: null }
    let nextPackageEndVariantId: string | null = null

    if (assignmentId) {
      const assignmentRes = await listStandaloneAssignments()
      if (assignmentRes.ok) {
        const assignment = assignmentRes.data.find((a) => a.id === assignmentId)
        if (assignment) {
          packageVersionId = assignment.packageVersionId
          const sectionsRes = await listTestSections(assignment.packageVersionId)
          const versionRes = await getTestPackageVersion(assignment.packageVersionId)
          if (versionRes.ok && versionRes.data) {
            const packagesRes = await listTestPackages()
            const packageTitle = packagesRes.ok
              ? packagesRes.data.find((pkg) => pkg.id === versionRes.data?.packageId)?.title
              : null
            nextRacMetricLabel = racMetricLabelForPackage(packageTitle ?? versionRes.data.versionLabel)
          }
          const languagePolicy = versionRes.ok ? versionRes.data?.sourceMetadata?.languagePolicy : null
          const existingRunsRes = await listStandaloneRuns(assignmentId)
          const existingRuns = existingRunsRes.ok ? existingRunsRes.data : []
          const existingSectionIds = new Set(existingRuns.map((r) => r.testSectionId))
          if (sectionsRes.ok) {
            for (const sec of sectionsRes.data) {
              if (existingSectionIds.has(sec.id)) continue
              const prep = await prepareStandaloneRun(
                assignmentId,
                sec.id,
                languageForSectionOrder(sec.sectionOrder, currentRun.promptLanguage || 'vi', languagePolicy),
                currentRun.voiceId || 'default',
              )
              if (prep.ok && prep.data.canStart) {
                await startStandaloneRun(prep.data.runId, prep.data.readinessToken)
              }
            }
          }
        }
      }

      const runsResult = await listStandaloneRuns(assignmentId)
      if (runsResult.ok && runsResult.data.length > 0) targetRuns = runsResult.data
    }
    setAllRuns(targetRuns)
    setRacMetricLabel(nextRacMetricLabel)

    if (packageVersionId) {
      const partOneLanguage = targetRuns.find((run) => run.sessionNumber === 1)?.promptLanguage ?? targetRuns[0]?.promptLanguage ?? currentRun.promptLanguage ?? 'vi'
      const partTwoLanguage = targetRuns.find((run) => run.sessionNumber === 4)?.promptLanguage ?? targetRuns[3]?.promptLanguage ?? partOneLanguage
      const partThreeLanguage = targetRuns.find((run) => run.sessionNumber === 7)?.promptLanguage ?? targetRuns[6]?.promptLanguage ?? partOneLanguage
      const findPartIntroAudio = async (part: PartIntroNumber, preferredLanguage: 'vi' | 'en') => {
        const preferred = await findLatestApprovedNarrationVariant({
          target: 'part_intro',
          packageVersionId,
          part,
          language: preferredLanguage,
        })
        // GREEN-TEST-49Q package-level intro scripts are authored/approved in English even
        // when the next session's item language is Vietnamese. Fallback keeps Part II visible.
        if ((preferred.ok && preferred.data) || preferredLanguage === 'en') return preferred
        return findLatestApprovedNarrationVariant({
          target: 'part_intro',
          packageVersionId,
          part,
          language: 'en',
        })
      }
      const [startAudio, partOneAudio, partTwoAudio, partThreeAudio, endAudio] = await Promise.all([
        findLatestApprovedNarrationVariant({
          target: 'package_start',
          packageVersionId,
          language: partOneLanguage,
        }),
        findPartIntroAudio(1, partOneLanguage),
        findPartIntroAudio(2, partTwoLanguage),
        findPartIntroAudio(3, partThreeLanguage),
        findLatestApprovedNarrationVariant({
          target: 'package_end',
          packageVersionId,
          language: partThreeLanguage,
        }),
      ])
      nextPackageStartVariantId = startAudio.ok && startAudio.data ? startAudio.data.id : null
      nextPartIntroVariantIds = {
        1: partOneAudio.ok && partOneAudio.data ? partOneAudio.data.id : null,
        2: partTwoAudio.ok && partTwoAudio.data ? partTwoAudio.data.id : null,
        3: partThreeAudio.ok && partThreeAudio.data ? partThreeAudio.data.id : null,
      }
      nextPackageEndVariantId = endAudio.ok && endAudio.data ? endAudio.data.id : null
      setPackageStartVariantId(nextPackageStartVariantId)
      setPartIntroVariantIds(nextPartIntroVariantIds)
      setPackageEndVariantId(nextPackageEndVariantId)
    } else {
      setPackageStartVariantId(null)
      setPartIntroVariantIds({ 1: null, 2: null, 3: null })
      setPackageEndVariantId(null)
    }

    const runtimeResults = await Promise.all(targetRuns.map((r) => getStandaloneRunRuntime(r.id)))
    const latestIntroResults = await Promise.all(
      targetRuns.map((r) =>
        findLatestApprovedNarrationVariant({
          target: 'section_intro',
          language: r.promptLanguage,
          testSectionId: r.testSectionId,
        }),
      ),
    )
    const nextIntroBySession: Record<number, string | null> = {}
    runtimeResults.forEach((runtimeResult, index) => {
      const sessionNumber = targetRuns[index]?.sessionNumber ?? index + 1
      const latestIntro = latestIntroResults[index]
      nextIntroBySession[sessionNumber] = latestIntro?.ok && latestIntro.data
        ? latestIntro.data.id
        : runtimeResult.ok
          ? runtimeResult.data.introNarrationVariantId
          : null
    })
    setSessionIntroVariantIds(nextIntroBySession)
    setIntroVariantId(nextIntroBySession[currentRun.sessionNumber] ?? null)

    const itemResults = await Promise.all(targetRuns.map((r) => listStandaloneRunItems(r.id)))
    let globalItemIndex = 1
    const combinedItems: TestItem[] = []
    for (let i = 0; i < targetRuns.length; i += 1) {
      const runItemRes = itemResults[i]
      if (!runItemRes?.ok) continue
      for (const item of runItemRes.data) {
        combinedItems.push({
          ...item,
          global_item_order: globalItemIndex,
          parent_run_id: targetRuns[i]!.id,
          session_number: targetRuns[i]!.sessionNumber,
          prompt_language: targetRuns[i]!.promptLanguage,
          voice_id: targetRuns[i]!.voiceId,
          test_section_id: targetRuns[i]!.testSectionId,
          prompt_vi: (item as any).test_items?.prompt_vi ?? (item as any).prompt_vi ?? null,
          prompt_en: (item as any).test_items?.prompt_en ?? (item as any).prompt_en ?? null,
          cvr: targetRuns[i]!.targetCvrOhm,
          cci: targetRuns[i]!.cciValue,
          cpd: targetRuns[i]!.itemCpd,
        })
        globalItemIndex += 1
      }
    }
    setItems(combinedItems)

    const completed = combinedItems.filter(isItemFinalized).length
    const restoredReady = readLiveAudioReady(runId, assignmentId)
    if (completed > 0 || restoredReady) {
      markAudioReady({ suppressAutoPlay: true, persist: completed > 0, assignmentId })
      setAudioState((current) => (current === 'idle' ? 'ready' : current))
      setAudioLabel((current) => (current === 'Current item' ? 'Live test restored' : current))
      if (restoredReady && completed === 0) {
        setMessage('Live test restored. Audio is ready; auto-play is paused until you press Play or score the next item.')
      }
    }

    const firstUnfinalized = combinedItems.findIndex((item) => !isItemFinalized(item))
    if (firstUnfinalized !== -1) {
      setSelectedIndex(firstUnfinalized)
      setIsSummaryShown(false)
    } else if (combinedItems.length > 0) {
      setSelectedIndex(combinedItems.length - 1)
      setIsSummaryShown(true)
      triggerConfetti()
    }
    enteringProbeRef.current = null
    if (cacheKey) {
      runPageCache.set(cacheKey, {
        expiresAt: Date.now() + RUN_PAGE_CACHE_TTL_MS,
        runDetails: currentRun,
        allRuns: targetRuns,
        items: combinedItems,
        racMetricLabel: nextRacMetricLabel,
        introVariantId: nextIntroBySession[currentRun.sessionNumber] ?? null,
        sessionIntroVariantIds: nextIntroBySession,
        packageStartVariantId: nextPackageStartVariantId,
        partIntroVariantIds: nextPartIntroVariantIds,
        packageEndVariantId: nextPackageEndVariantId,
      })
    }
    setIsRestoringRun(false)
  }, [markAudioReady, runId, assignmentIdParam])

  useEffect(() => {
    const cacheKey = runPageCacheKey(runId, assignmentIdParam)
    if (!cacheKey || items.length === 0) return
    runPageCache.set(cacheKey, {
      expiresAt: Date.now() + RUN_PAGE_CACHE_TTL_MS,
      runDetails,
      allRuns,
      items,
      racMetricLabel,
      introVariantId,
      sessionIntroVariantIds,
      packageStartVariantId,
      partIntroVariantIds,
      packageEndVariantId,
    })
  }, [
    allRuns,
    assignmentIdParam,
    introVariantId,
    items,
    racMetricLabel,
    packageEndVariantId,
    packageStartVariantId,
    partIntroVariantIds,
    runDetails,
    runId,
    sessionIntroVariantIds,
  ])

  useEffect(() => {
    partIntroPlayedRef.current = { 1: false, 2: false, 3: false }
    packageEndPlayedRef.current = false
    void load()
  }, [load])

  const currentItem = useMemo(() => items[selectedIndex] ?? null, [items, selectedIndex])
  const completedCount = useMemo(() => items.filter(isItemFinalized).length, [items])
  const currentAttempt = getItemAttempt(currentItem)
  const currentSnapshot = getItemSnapshot(currentItem)
  const probeOpen = currentSnapshot?.status === 'probe_open' || currentSnapshot?.status === 'resolution_required'
  const probeCount = Number(currentSnapshot?.probe_count ?? currentSnapshot?.probeCount ?? 0)
  const chunksNumber = probeChunksNumber({ enteredProbeFlow: Boolean(currentSnapshot?.entered_probe_flow ?? currentSnapshot?.enteredProbeFlow ?? probeOpen), probeCount }) ?? 1
  const currentSessionNumber = currentItem?.session_number || 1
  const currentItemNumber = currentItem?.global_item_order ?? selectedIndex + 1
  const currentItemLanguage = (currentItem?.prompt_language ?? runDetails?.promptLanguage ?? 'vi') as 'vi' | 'en'
  const currentPrimaryPrompt = currentItem?.prompt_text ?? 'Select a question'
  const alternatePrompt = currentItemLanguage === 'vi'
    ? currentItem?.prompt_en
    : currentItem?.prompt_vi
  const alternateLanguageLabel = currentItemLanguage === 'vi' ? 'EN' : 'VI'
  const currentSessionRun = allRuns.find((r) => r.sessionNumber === currentSessionNumber) ?? null
  const currentItemVariantId = currentItem?.narration_variant_id ?? null
  const currentSessionIntroVariantId = sessionIntroVariantIds[currentSessionNumber] ?? introVariantId ?? null
  const canPlayCurrentItemAudio = Boolean(currentItemVariantId || currentItem?.test_item_id)
  const canPlayCurrentSessionIntro = Boolean(currentSessionIntroVariantId || currentSessionRun?.testSectionId)
  const isFirstItemInSession = useMemo(
    () =>
      currentItem
        ? items.findIndex((item) => item.session_number === currentSessionNumber) === selectedIndex
        : false,
    [currentItem, currentSessionNumber, items, selectedIndex],
  )

  useEffect(() => {
    setShowHeader(false)
  }, [currentSessionNumber])

  const activateAudioUrl = useCallback((
    signedUrl: string,
    label: string,
    shouldPlay: boolean,
    target: AudioTarget,
  ) => {
    audioTargetRef.current = target
    if ((target === 'item' || target === 'item_prefix') && shouldPlay && currentItem?.id) {
      autoPlayedItemIdsRef.current.add(String(currentItem.id))
    }
    setAudioLabel(label)
    setAudioState('ready')
    setMessage('')

    const audio = audioRef.current
    if (!audio) return
    const sourceChanged = activeAudioUrlRef.current !== signedUrl
    if (sourceChanged) {
      audio.pause()
      activeAudioUrlRef.current = signedUrl
      // Setting src already starts resource selection. Calling load() here immediately
      // restarts that request and produced duplicate WAV fetches / audible stutter.
      audio.src = signedUrl
    } else {
      audio.pause()
      audio.currentTime = 0
    }
    const nextVolume = audibleVolume(audioVolume)
    audio.muted = false
    audio.volume = nextVolume
    audio.playbackRate = audioRate
    if (!shouldPlay) return
    void audio.play().catch(() => {
      setAudioState('ready')
      const pendingPath = pendingAfterEndNavigationRef.current
      pendingAfterEndNavigationRef.current = null
      if (target === 'package_end' && pendingPath) {
        setMessage('End audio was blocked by the browser. Opening analysis now.')
        navigate(pendingPath)
        return
      }
      suppressAutoPlayAfterRestoreRef.current = true
      setMessage('Audio was blocked by the browser. Press Play on an audio control once to unlock this run. Scoring remains available.')
    })
  }, [audioRate, audioVolume, currentItem?.id, navigate])

  const loadAudioVariant = useCallback(async (
    variantId: string,
    label: string,
    shouldPlay = false,
    target: AudioTarget = 'item',
  ) => {
    setAudioLabel(label)
    setAudioState('loading')
    setMessage('')
    try {
      const playback = await getNarrationPlaybackUrl(variantId)
      activateAudioUrl(playback.signedUrl, label, shouldPlay, target)
    } catch (cause) {
      setAudioState('error')
      setMessage(cause instanceof Error ? cause.message : 'Audio playback failed')
    }
  }, [activateAudioUrl])

  const primeItemPlaybackUrl = useCallback(async (item: TestItem | null | undefined) => {
    if (!item?.id) return null
    const cacheKey = String(item.id)
    const cached = itemPlaybackCacheRef.current[cacheKey]
    if (cached) return cached
    const language = (item.prompt_language ?? runDetails?.promptLanguage ?? 'vi') as 'vi' | 'en'
    const latest = await findLatestApprovedNarrationVariant({
      target: 'test_item',
      language,
      testItemId: String(item.test_item_id),
    })
    if (!latest.ok || !latest.data) return null
    const { id: variantId, voiceId } = latest.data
    const isSilent = voiceId === 'manual-read-direct/silent-placeholder'
    let signedUrl = ''
    if (!isSilent) {
      const playback = await getNarrationPlaybackUrl(variantId)
      signedUrl = playback.signedUrl
    }
    const next = { variantId, signedUrl, isSilent }
    itemPlaybackCacheRef.current[cacheKey] = next
    return next
  }, [runDetails?.promptLanguage])

  const playCurrentItemAudio = useCallback(
    async (shouldPlay = true) => {
      const cached = await primeItemPlaybackUrl(currentItem)
      let variantId = ''
      let signedUrl = ''
      let isSilent = false

      if (cached) {
        variantId = cached.variantId
        signedUrl = cached.signedUrl
        isSilent = cached.isSilent === true
      } else {
        const latest = await findLatestApprovedNarrationVariant({
          target: 'test_item',
          language: currentItemLanguage,
          testItemId: String(currentItem?.test_item_id),
        })
        if (latest.ok && latest.data) {
          variantId = latest.data.id
          isSilent = latest.data.voiceId === 'manual-read-direct/silent-placeholder'
          if (!isSilent) {
            const playback = await getNarrationPlaybackUrl(variantId)
            signedUrl = playback.signedUrl
          }
        }
      }

      if (!variantId) {
        setMessage('No approved item audio is available for the current question/language.')
        return
      }
      playFirstItemAfterIntroRef.current = false

      const questionNumber = currentItem?.item_order ?? 1
      const hasPrefixAudio = questionNumber >= 1 && questionNumber <= 7
      const prefixUrl = hasPrefixAudio ? `/audio/number_${questionNumber}.wav` : null

      if (shouldPlay) {
        resumeAudioAutoFlow()
        if (currentItem?.id) {
          autoPlayedItemIdsRef.current.add(String(currentItem.id))
        }
        if (hasPrefixAudio && prefixUrl) {
          pendingItemAudioRef.current = {
            signedUrl: isSilent ? '' : signedUrl || null,
            variantId,
            isSilent,
          }
          activateAudioUrl(prefixUrl, `Number ${questionNumber}`, true, 'item_prefix')
        } else {
          pendingItemAudioRef.current = null
          if (isSilent) {
            setAudioLabel(`Q${currentItemNumber} item (Teacher read direct)`)
            setAudioState('played')
          } else if (signedUrl) {
            activateAudioUrl(signedUrl, `Q${currentItemNumber} item`, true, 'item')
          } else {
            await loadAudioVariant(variantId, `Q${currentItemNumber} item`, true, 'item')
          }
        }
      } else {
        pendingItemAudioRef.current = null
        if (isSilent) {
          setAudioLabel(`Q${currentItemNumber} item (Teacher read direct)`)
          setAudioState('ready')
        } else if (signedUrl) {
          activateAudioUrl(signedUrl, `Q${currentItemNumber} item`, false, 'item')
        } else {
          await loadAudioVariant(variantId, `Q${currentItemNumber} item`, false, 'item')
        }
      }
    },
    [activateAudioUrl, currentItem, currentItemLanguage, currentItemNumber, loadAudioVariant, primeItemPlaybackUrl, resumeAudioAutoFlow],
  )

  const playPackageStartAudio = useCallback(
    async (shouldPlay = true) => {
      if (!packageStartVariantId) {
        setMessage('No approved Test Start audio is available for this package/language.')
        return
      }
      if (shouldPlay) resumeAudioAutoFlow()
      playFirstItemAfterIntroRef.current = false
      await loadAudioVariant(packageStartVariantId, 'Test Start', shouldPlay, 'package_start')
    },
    [loadAudioVariant, packageStartVariantId, resumeAudioAutoFlow],
  )

  const playPackageEndAudio = useCallback(
    async (shouldPlay = true) => {
      if (!packageEndVariantId) {
        setMessage('No approved Test End audio is available for this package/language.')
        return
      }
      if (shouldPlay) resumeAudioAutoFlow()
      packageEndPlayedRef.current = true
      playFirstItemAfterIntroRef.current = false
      await loadAudioVariant(packageEndVariantId, 'Test End', shouldPlay, 'package_end')
    },
    [loadAudioVariant, packageEndVariantId, resumeAudioAutoFlow],
  )

  const playPartIntroAudio = useCallback(
    async (part: PartIntroNumber, shouldPlay = true) => {
      const variantId = partIntroVariantIds[part]
      const label = partIntroLabel(part)
      if (!variantId) {
        setMessage(`No approved ${label} intro audio is available for this package/language.`)
        return
      }
      if (shouldPlay) resumeAudioAutoFlow()
      partIntroPlayedRef.current[part] = true
      playFirstItemAfterIntroRef.current = false
      await loadAudioVariant(variantId, `${label} intro`, shouldPlay, partIntroTarget(part))
    },
    [loadAudioVariant, partIntroVariantIds, resumeAudioAutoFlow]
  )

  const playEndAfterFinalScore = useCallback(async () => {
    setIsSummaryShown(true)
    if (!autoPlayPackageEnd || !packageEndVariantId || packageEndPlayedRef.current) return
    await playPackageEndAudio(true)
  }, [autoPlayPackageEnd, packageEndVariantId, playPackageEndAudio])

  const playSessionIntroAudio = useCallback(
    async (sessionNumber: number, shouldPlay = true, playFirstItemAfterIntro = true) => {
      const sessionRun = allRuns.find((run) => run.sessionNumber === sessionNumber) ?? null
      let variantId = sessionIntroVariantIds[sessionNumber] ?? null
      if (sessionRun?.testSectionId) {
        const latest = await findLatestApprovedNarrationVariant({
          target: 'section_intro',
          language: sessionRun.promptLanguage,
          testSectionId: sessionRun.testSectionId,
        })
        if (latest.ok && latest.data?.id) variantId = latest.data.id
      }
      if (!variantId) {
        setMessage(`No approved Session ${sessionNumber} intro audio is available.`)
        return
      }
      if (shouldPlay) resumeAudioAutoFlow()
      sessionIntroPlayedRef.current[sessionNumber] = true
      const firstItemIndex = items.findIndex((item) => item.session_number === sessionNumber)
      playFirstItemAfterIntroRef.current = playFirstItemAfterIntro && firstItemIndex >= 0
      firstItemAfterIntroIndexRef.current = playFirstItemAfterIntro && firstItemIndex >= 0 ? firstItemIndex : null
      await loadAudioVariant(variantId, `Session ${sessionNumber} intro`, shouldPlay, 'session_intro')
    },
    [allRuns, items, loadAudioVariant, resumeAudioAutoFlow, sessionIntroVariantIds]
  )

  const playCurrentSessionIntro = useCallback(
    async (shouldPlay = true, playFirstItemAfterIntro = true) => {
      await playSessionIntroAudio(currentSessionNumber, shouldPlay, playFirstItemAfterIntro)
    },
    [currentSessionNumber, playSessionIntroAudio],
  )

  const startLiveAudioFlow = useCallback(async () => {
    markAudioReady({ suppressAutoPlay: false })
    setMessage('')

    if (probeOpen) {
      setMessage('Live audio is ready. Resolve the probe first; probe screens do not auto-play question audio.')
      return
    }

    if (autoPlayPackageStart && packageStartVariantId && completedCount === 0 && currentSessionNumber === 1 && isFirstItemInSession) {
      await playPackageStartAudio(true)
      return
    }

    if (autoPlayPartIntro && isFirstItemInSession) {
      if (currentSessionNumber === 1 && partIntroVariantIds[1] && !partIntroPlayedRef.current[1]) {
        await playPartIntroAudio(1, true)
        return
      }
      if (currentSessionNumber === 4 && partIntroVariantIds[2] && !partIntroPlayedRef.current[2]) {
        await playPartIntroAudio(2, true)
        return
      }
      if (currentSessionNumber === 7 && partIntroVariantIds[3] && !partIntroPlayedRef.current[3]) {
        await playPartIntroAudio(3, true)
        return
      }
    }

    if (autoPlaySessionIntro && canPlayCurrentSessionIntro && isFirstItemInSession && !sessionIntroPlayedRef.current[currentSessionNumber]) {
      await playCurrentSessionIntro(true, true)
      return
    }

    if (autoPlayItems && canPlayCurrentItemAudio) {
      await playCurrentItemAudio(true)
      return
    }

    if (canPlayCurrentItemAudio) {
      await playCurrentItemAudio(false)
      setMessage('Live test is ready. Auto-play is off; press Current Q when you want audio.')
      return
    }

    setMessage('Live test is ready. No approved audio is available for the current question yet.')
  }, [
    autoPlayItems,
    autoPlayPackageStart,
    autoPlayPartIntro,
    autoPlaySessionIntro,
    canPlayCurrentItemAudio,
    canPlayCurrentSessionIntro,
    completedCount,
    currentSessionNumber,
    isFirstItemInSession,
    markAudioReady,
    packageStartVariantId,
    partIntroVariantIds,
    playCurrentItemAudio,
    playCurrentSessionIntro,
    playPackageStartAudio,
    playPartIntroAudio,
    probeOpen,
  ])

  useEffect(() => {
    if (!liveAudioStarted || probeOpen || suppressAutoPlayAfterRestoreRef.current) return
    if (!packageStartVariantId || !autoPlayPackageStart) return
    if (!currentItem?.id || completedCount > 0 || currentSessionNumber !== 1 || !isFirstItemInSession) return
    if (audioTargetRef.current === 'package_start') return
    void playPackageStartAudio(true)
  }, [autoPlayPackageStart, completedCount, currentItem?.id, currentSessionNumber, isFirstItemInSession, liveAudioStarted, packageStartVariantId, playPackageStartAudio, probeOpen])

  useEffect(() => {
    if (probeOpen && enteringProbeRef.current === String(currentItem?.id)) {
      enteringProbeRef.current = null
    }
    if (!liveAudioStarted || probeOpen || suppressAutoPlayAfterRestoreRef.current || enteringProbeRef.current === String(currentItem?.id)) return
    if (!currentItem?.id || !canPlayCurrentItemAudio) return
    if (autoPlayedItemIdsRef.current.has(String(currentItem.id))) return
    if (suppressNextItemEffectForIdRef.current === String(currentItem.id)) {
      suppressNextItemEffectForIdRef.current = null
      return
    }
    if (pendingFirstItemAudioIndexRef.current === selectedIndex) return
    const deferForPackageStart = autoPlayPackageStart && currentSessionNumber === 1 && isFirstItemInSession && audioTargetRef.current !== 'package_start'
    const deferForPartIntro = autoPlayPartIntro && isFirstItemInSession && (
      (currentSessionNumber === 1 && !partIntroPlayedRef.current[1] && Boolean(partIntroVariantIds[1])) ||
      (currentSessionNumber === 4 && !partIntroPlayedRef.current[2] && Boolean(partIntroVariantIds[2])) ||
      (currentSessionNumber === 7 && !partIntroPlayedRef.current[3] && Boolean(partIntroVariantIds[3]))
    )
    const deferForSessionIntro = autoPlaySessionIntro && canPlayCurrentSessionIntro && isFirstItemInSession
    if (deferForPackageStart || deferForPartIntro || deferForSessionIntro) return
    void playCurrentItemAudio(autoPlayItems)
  }, [
    autoPlayItems,
    autoPlayPackageStart,
    autoPlayPartIntro,
    autoPlaySessionIntro,
    canPlayCurrentItemAudio,
    canPlayCurrentSessionIntro,
    currentItem?.id,
    currentSessionNumber,
    isFirstItemInSession,
    liveAudioStarted,
    partIntroVariantIds,
    playCurrentItemAudio,
    probeOpen,
    selectedIndex,
  ])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const nextVolume = audibleVolume(audioVolume)
    audio.muted = false
    audio.volume = nextVolume
    audio.playbackRate = audioRate
  }, [audioRate, audioVolume])

  useEffect(() => {
    if (!liveAudioStarted || probeOpen || suppressAutoPlayAfterRestoreRef.current) return
    if (!isFirstItemInSession) return

    // 1. Check if we should trigger a Part Intro first
    if (autoPlayPartIntro) {
      if (currentSessionNumber === 1 && !autoPlayPackageStart && !partIntroPlayedRef.current[1] && partIntroVariantIds[1]) {
        void playPartIntroAudio(1, true)
        return
      }
      if (currentSessionNumber === 4 && !partIntroPlayedRef.current[2] && partIntroVariantIds[2]) {
        void playPartIntroAudio(2, true)
        return
      }
      if (currentSessionNumber === 7 && !partIntroPlayedRef.current[3] && partIntroVariantIds[3]) {
        void playPartIntroAudio(3, true)
        return
      }
    }

    // 2. If no Part Intro is to be played, check if we should trigger the Session Intro.
    if (autoPlaySessionIntro && canPlayCurrentSessionIntro) {
      if (!sessionIntroPlayedRef.current[currentSessionNumber]) {
        // Guard: if autoPlayPartIntro is enabled and this session is a part boundary, and the corresponding part intro
        // has NOT been played yet, do NOT play session intro now. It will be triggered by handleAudioEnded after part intro ends.
        if (autoPlayPartIntro && currentSessionNumber === 1 && !partIntroPlayedRef.current[1] && partIntroVariantIds[1]) return
        if (autoPlayPartIntro && currentSessionNumber === 4 && !partIntroPlayedRef.current[2] && partIntroVariantIds[2]) return
        if (autoPlayPartIntro && currentSessionNumber === 7 && !partIntroPlayedRef.current[3] && partIntroVariantIds[3]) return

        void playCurrentSessionIntro(true, true)
      }
    }
  }, [
    autoPlayPackageStart,
    autoPlayPartIntro,
    autoPlaySessionIntro,
    canPlayCurrentSessionIntro,
    currentSessionNumber,
    isFirstItemInSession,
    liveAudioStarted,
    partIntroVariantIds,
    playCurrentSessionIntro,
    playPartIntroAudio,
    probeOpen,
  ])

  useEffect(() => {
    if (!items.length) return
    const upcoming = items
      .slice(selectedIndex, selectedIndex + 4)
      .filter((item) => item?.id && item.session_number === currentItem?.session_number && !isItemFinalized(item))
    if (upcoming.length === 0) return
    void Promise.allSettled(upcoming.map((item) => primeItemPlaybackUrl(item))).catch(() => {
      /* best-effort prefetch */
    })
  }, [currentItem?.id, currentItem?.session_number, items, primeItemPlaybackUrl, selectedIndex])

  useEffect(() => {
    const targetIndex = pendingFirstItemAudioIndexRef.current
    if (targetIndex == null || selectedIndex !== targetIndex) return
    if (!liveAudioStarted || probeOpen || suppressAutoPlayAfterRestoreRef.current) return
    if (!currentItem?.id || !canPlayCurrentItemAudio) return
    pendingFirstItemAudioIndexRef.current = null
    void playCurrentItemAudio(true)
  }, [canPlayCurrentItemAudio, currentItem?.id, liveAudioStarted, playCurrentItemAudio, probeOpen, selectedIndex])

  const playScoreFeedbackThenNext = useCallback((color: ResultColor): boolean => {
    if (!currentItem) return false
    const nextIndex = items.findIndex((item, index) => index > selectedIndex && !isItemFinalized(item))
    const nextItem = nextIndex >= 0 ? items[nextIndex] : null

    pendingAfterReactionRef.current = null
    if (nextItem) {
      const isSameSession = nextItem.session_number === currentItem.session_number
      if (liveAudioStartedRef.current && autoPlayItems && isSameSession) {
        const cached = itemPlaybackCacheRef.current[String(nextItem.id)]
        if (cached) {
          const nextNumber = nextItem.global_item_order ?? nextIndex + 1
          pendingAfterReactionRef.current = {
            signedUrl: cached.signedUrl,
            label: `Q${nextNumber} item`,
            itemId: String(nextItem.id),
            variantId: cached.variantId,
            isSilent: cached.isSilent
          }
          suppressNextItemEffectForIdRef.current = String(nextItem.id)
        } else {
          void primeItemPlaybackUrl(nextItem).catch(() => {
            /* best-effort late prefetch */
          })
        }
      }
      pendingFirstItemAudioIndexRef.current = null
      setSelectedIndex(nextIndex)
    }

    activateAudioUrl(resultAudioUrl(color), `${color} result`, true, 'result_reaction')
    return Boolean(pendingAfterReactionRef.current)
  }, [activateAudioUrl, autoPlayItems, currentItem, items, primeItemPlaybackUrl, selectedIndex])

  const handleAudioEnded = useCallback(() => {
    setAudioState('played')
    if (audioTargetRef.current === 'item_prefix') {
      const pending = pendingItemAudioRef.current
      pendingItemAudioRef.current = null
      if (pending && liveAudioStartedRef.current && !probeOpen) {
        if (pending.isSilent) {
          setAudioLabel(`Q${currentItemNumber} item (Teacher read direct)`)
          setAudioState('played')
        } else if (pending.signedUrl) {
          activateAudioUrl(pending.signedUrl, `Q${currentItemNumber} item`, true, 'item')
        } else {
          void loadAudioVariant(pending.variantId, `Q${currentItemNumber} item`, true, 'item')
        }
      }
      return
    }
    if (audioTargetRef.current === 'result_reaction') {
      const next = pendingAfterReactionRef.current
      pendingAfterReactionRef.current = null
      if (next && liveAudioStartedRef.current && !probeOpen) {
        if (next.itemId && next.variantId) {
          const nextItem = items.find((item) => String(item.id) === next.itemId)
          if (nextItem) {
            const questionNumber = nextItem.item_order ?? 1
            const hasPrefixAudio = questionNumber >= 1 && questionNumber <= 7
            const prefixUrl = hasPrefixAudio ? `/audio/number_${questionNumber}.wav` : null
            if (hasPrefixAudio && prefixUrl) {
              pendingItemAudioRef.current = {
                signedUrl: next.isSilent ? '' : next.signedUrl,
                variantId: next.variantId,
                isSilent: next.isSilent,
              }
              activateAudioUrl(prefixUrl, `Number ${questionNumber}`, true, 'item_prefix')
              return
            }
          }
        }
        activateAudioUrl(next.signedUrl, next.label, true, 'item')
      }
      return
    }
    if (audioTargetRef.current === 'package_end' && pendingAfterEndNavigationRef.current) {
      const pendingPath = pendingAfterEndNavigationRef.current
      pendingAfterEndNavigationRef.current = null
      navigate(pendingPath)
      return
    }
    if (!liveAudioStartedRef.current || probeOpen || suppressAutoPlayAfterRestoreRef.current) return
    if (audioTargetRef.current === 'package_start') {
      if (autoPlayPartIntro && partIntroVariantIds[1] && !partIntroPlayedRef.current[1]) {
        void playPartIntroAudio(1, true)
        return
      }
      if (autoPlaySessionIntro && canPlayCurrentSessionIntro) {
        void playCurrentSessionIntro(true, true)
        return
      }
    }
    if (audioTargetRef.current === 'part_intro_1' || audioTargetRef.current === 'part_intro_2' || audioTargetRef.current === 'part_intro_3') {
      if (autoPlaySessionIntro && canPlayCurrentSessionIntro) {
        void playCurrentSessionIntro(true, true)
        return
      }
      if (autoPlayItems && canPlayCurrentItemAudio) {
        void playCurrentItemAudio(true)
      }
      return
    }
    if (audioTargetRef.current !== 'session_intro' || !playFirstItemAfterIntroRef.current) return
    playFirstItemAfterIntroRef.current = false
    const firstItemIndex = firstItemAfterIntroIndexRef.current
    firstItemAfterIntroIndexRef.current = null
    if (firstItemIndex != null && firstItemIndex >= 0 && firstItemIndex !== selectedIndex) {
      pendingFirstItemAudioIndexRef.current = firstItemIndex
      setSelectedIndex(firstItemIndex)
      return
    }
    void playCurrentItemAudio(true)
  }, [activateAudioUrl, autoPlayItems, autoPlayPartIntro, autoPlaySessionIntro, canPlayCurrentItemAudio, canPlayCurrentSessionIntro, currentItemNumber, items, loadAudioVariant, navigate, partIntroVariantIds, playCurrentItemAudio, playCurrentSessionIntro, playPartIntroAudio, probeOpen, selectedIndex])

  const handleRecord = useCallback(
    async (color: PrimaryResultColor) => {
      if (!currentItem || probeOpen || isScoringBusyRef.current) return
      isScoringBusyRef.current = true
      try {
        resumeAudioAutoFlow()
        const isFinalOutstandingItem = !isItemFinalized(currentItem) && items.filter((item) => !isItemFinalized(item)).length === 1
        playReaction(color)
        if (color !== 'green') {
          playScoreFeedbackThenNext(color)
        } else {
          enteringProbeRef.current = String(currentItem.id)
          activateAudioUrl(resultAudioUrl('green'), 'green result', true, 'result_reaction')
        }
        const result = await recordStandaloneResult(currentItem.id, color)
        if (!result.ok) {
          setMessage(result.error)
          return
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === currentItem.id
              ? withStandaloneSnapshot(item, result.data, color === 'green')
              : item,
          ),
        )
        if (isFinalOutstandingItem) await playEndAfterFinalScore()
      } finally {
        isScoringBusyRef.current = false
      }
    },
    [activateAudioUrl, currentItem, items, playEndAfterFinalScore, playReaction, playScoreFeedbackThenNext, probeOpen, resumeAudioAutoFlow],
  )

  const handleProbe = useCallback(
    async (outcome: 'fail' | 'continue' | 'done') => {
      if (!currentAttempt?.id || !probeOpen || isScoringBusyRef.current) return
      isScoringBusyRef.current = true
      try {
        resumeAudioAutoFlow()
        const isFinalOutstandingItem = outcome !== 'continue' && currentItem && !isItemFinalized(currentItem) && items.filter((item) => !isItemFinalized(item)).length === 1
        if (outcome !== 'continue') {
          playScoreFeedbackThenNext(outcome === 'fail' ? 'yellow' : 'indigo')
        } else {
          activateAudioUrl(resultAudioUrl('blue'), 'blue continue result', true, 'result_reaction')
        }
        const result = await resolveStandaloneProbe(String(currentAttempt.id), outcome)
        if (!result.ok) {
          setMessage(result.error)
          return
        }
        const data = { ...result.data }
        if (outcome === 'fail' && typeof probeCount === 'number') {
          data.probeCount = probeCount
        }
        if (outcome === 'continue') {
          setMessage(`Chunks Number=${probeChunksNumber({ enteredProbeFlow: true, probeCount: data.probeCount }) ?? 1}`)
        } else {
          playReaction(outcome === 'fail' ? 'yellow' : 'indigo')
          setMessage('')
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === currentItem.id ? withStandaloneSnapshot(item, data, true) : item,
          ),
        )
        if (isFinalOutstandingItem) await playEndAfterFinalScore()
      } finally {
        isScoringBusyRef.current = false
      }
    },
    [activateAudioUrl, currentAttempt?.id, currentItem, items, playEndAfterFinalScore, playReaction, playScoreFeedbackThenNext, probeOpen, resumeAudioAutoFlow],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!currentItem) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setMapOpen((v) => !v)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowKeys((v) => !v)
        return
      }
      if (probeOpen) {
        if (e.key.toLowerCase() === 'f' || e.key === '1') {
          e.preventDefault()
          void handleProbe('fail')
          return
        }
        if (e.key.toLowerCase() === 'c' || e.key === '2') {
          e.preventDefault()
          void handleProbe('continue')
          return
        }
        if (e.key.toLowerCase() === 'd' || e.key === '3' || e.key === 'Enter') {
          e.preventDefault()
          void handleProbe('done')
          return
        }
      }
      const found = COLORS.find((k) => k.num === e.key)
      if (found) {
        e.preventDefault()
        void handleRecord(found.key)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentItem, handleProbe, handleRecord, probeOpen])

  async function completeAll() {
    const assignmentId = assignmentIdParam || runDetails?.assignmentId
    for (const r of allRuns) {
      const result = await completeStandaloneRun(r.id)
      if (!result.ok) {
        setMessage(result.error)
        setIsSummaryShown(true)
        return
      }
    }
    const analysisPath = assignmentId ? `/teacher/tests/analysis/${assignmentId}` : '/teacher/tests'
    if (autoPlayPackageEnd && packageEndVariantId && !packageEndPlayedRef.current) {
      pendingAfterEndNavigationRef.current = analysisPath
      await playPackageEndAudio(true)
      return
    }
    navigate(analysisPath)
  }

  async function stopCurrentSessionAndOpenSummary() {
    if (!runId) return
    const assignmentId = assignmentIdParam || runDetails?.assignmentId
    if (completedCount === 0) {
      const proceed = window.confirm('No questions are finalized yet. Stop this session anyway and open analysis?')
      if (!proceed) return
    } else {
      const proceed = window.confirm(`Stop this session now? Analysis will include ${completedCount}/${items.length} finalized questions.`)
      if (!proceed) return
    }
    const result = await stopStandaloneRun(runId)
    if (!result.ok) {
      setMessage(result.error)
      setIsSummaryShown(true)
      return
    }
    navigate(assignmentId ? `/teacher/tests/analysis/${assignmentId}` : '/teacher/tests')
  }

  const sessionsGrouped = useMemo(() => {
    const map = new Map<number, TestItem[]>()
    for (const item of items) {
      const sNum = item.session_number || 1
      if (!map.has(sNum)) map.set(sNum, [])
      map.get(sNum)!.push(item)
    }
    return Array.from(map.entries()).map(([sessionNum, sessionItems]) => ({
      sessionNum,
      items: sessionItems,
    }))
  }, [items])

  const summaryMetrics = useMemo(() => {
    const cpdValues = items.map(achievedCpdValue).filter((v): v is number => v !== null)
    const finalized = completedCount
    const spectrumAttempts = []
    for (const item of items) {
      if (!isItemFinalized(item)) continue
      const effectiveColor = getItemColor(item)
      if (!effectiveColor) continue
      const snap = getItemSnapshot(item)
      spectrumAttempts.push({
        effectiveColor,
        enteredProbeFlow: Boolean(snap?.entered_probe_flow ?? snap?.enteredProbeFlow),
        probeEventCount: Number(snap?.probe_count ?? snap?.probeCount ?? 0),
      })
    }
    const spectrum = calculateSpectrumStepBreakdown(spectrumAttempts)
    const nTotal = spectrum.totalRecords
    const rfc = spectrum.rfc == null ? 0 : Math.round(spectrum.rfc * 100)
    const avgPercentX = spectrum.avgPercentX ?? 0
    const rac = Number(avgPercentX.toFixed(1))
    const legacyRac = spectrum.rac == null ? 0 : Math.round(spectrum.rac * 100)
    const sumPercentX = spectrum.sumPercentX
    const avgXColor = colorForAvgPercentX(spectrum.avgPercentX)
    const avgCpd = cpdValues.length
      ? Math.round(cpdValues.reduce((acc, value) => acc + value, 0) / cpdValues.length)
      : 0
    const minCpd = cpdValues.length ? Math.min(...cpdValues) : null
    const maxCpd = cpdValues.length ? Math.max(...cpdValues) : null
    return {
      ...spectrum.byColor,
      finalized,
      warmSteps: spectrum.warmSteps,
      nTotal,
      rfc,
      rac,
      legacyRac,
      avgPercentX,
      sumPercentX,
      avgXColor,
      avgPercentXTitle: `Avg %x = sum(%x) / N_total = ${sumPercentX.toFixed(1)}% / ${nTotal} = ${avgPercentX.toFixed(1)}% (Band: ${COLOR_LABEL[avgXColor]}).\n• Colors: Red (0%), Orange (17%), Yellow (34%), Green (50%), Blue (67%), Indigo (84%), Violet (100%).`,
      rfcTitle: `RFC = warm records / N_total = ${spectrum.warmSteps} / ${nTotal}. Warm = Red + Orange + Yellow.`,
      racTitle: `${racMetricLabel} = Avg %x = sum(%x) / N_total = ${sumPercentX.toFixed(1)}% / ${nTotal} = ${avgPercentX.toFixed(1)}%.`,
      totalTitle: `N_total = primary records + probe records = ${spectrum.primaryRecords} + ${spectrum.probeRecords} = ${nTotal}.`,
      cpdTitle: `Max CPD is the highest achieved CPD among finalized items. Achieved CPD = CVR x CCI x color factor.`,
      avgCpd,
      minCpd,
      maxCpd,
    }
  }, [items, completedCount, racMetricLabel])

  const chartData = useMemo(
    () =>
      items.map((item) => {
        const colorKey = getItemColor(item) ?? undefined
        const finalized = isItemFinalized(item)
        return {
          itemOrder: item.global_item_order,
          label: `Q${item.global_item_order}`,
          cpd: achievedCpdValue(item) ?? 0,
          baseCpd: cpdValue(item) ?? 0,
          cvr: item.cvr ?? 0,
          cci: item.cci ?? 0,
          colorKey: finalized ? colorKey : 'pending',
          hex: finalized && colorKey ? (COLOR_HEX[colorKey] ?? '#cbd5e1') : '#cbd5e1',
          prompt: item.prompt_text,
        }
      }),
    [items],
  )

  if (items.length === 0) {
    return (
      <div className="observe-root flex items-center justify-center" role="status">
        <EmptyState icon={ClipboardCheck} title="Loading Full Package Items…" description={message} />
      </div>
    )
  }

  const activeLearners = listActiveLearners(roster)
  const learner = activeLearners.find((l) => l.id === runDetails?.learnerUserId) ?? null
  const learnerName = learner?.displayName ?? 'Learner'
  const learnerAvatarUrl = learner?.avatarUrl ?? null
  const isAllFinalized = completedCount === items.length
  const totalSessions = allRuns.length || 1
  const currentColor = getItemColor(currentItem)
  const currentCpd = cpdValue(currentItem)
  const railSizeClass = !mapOpen
    ? 'is-narrow'
    : railWidth < 190
      ? 'is-compact'
      : railWidth > 320
        ? 'is-wide'
        : 'is-mid'
  const avatarSize = !mapOpen ? 'sm' : railWidth > 320 ? 'xl' : railWidth > 220 ? 'lg' : 'md'
  const lang = (runDetails?.promptLanguage ?? 'vi').toUpperCase()
  const showStartCard = !isRestoringRun && !liveAudioStarted && completedCount === 0

  return (
    <div
      className={`observe-root${reaction ? ` is-react-${reaction.kind} is-react-${reaction.color}` : ''}${
        mapOpen ? ' is-map-open' : ''
      }${showHeader ? '' : ' is-header-hidden'}`}
      role="application"
      aria-label={`Live Test · ${learnerName}`}
    >
      {!showHeader ? (
        <div
          className="observe-header-hover-zone"
          onMouseEnter={() => setShowHeader(true)}
          onFocus={() => setShowHeader(true)}
          role="button"
          tabIndex={0}
          aria-label="Show live test header"
        />
      ) : null}

      <header
        className={`observe-bar observe-bar-slim${showHeader ? '' : ' is-hidden'}`}
        onMouseLeave={() => setShowHeader(false)}
      >
        <button type="button" className="observe-nav-exit" onClick={() => navigate('/teacher/tests')} aria-label="Exit live test">
          <ChevronLeft aria-hidden strokeWidth={2.5} />
        </button>
        <div className="observe-bar-center">
          <span className="observe-day-badge">Session {currentSessionNumber}/{totalSessions}</span>
          <span className="observe-sep">·</span>
          <span className="observe-mode">
            Q{currentItemNumber}<span className="observe-meta-muted">/{items.length}</span>
          </span>
          <span className="observe-sep observe-hide-phone">·</span>
          <span className="observe-class observe-hide-phone">Live Test · {lang}</span>
        </div>
        <div className="observe-nav-group" role="toolbar" aria-label="Live test tools">
          <button type="button" className={`observe-nav-btn${mapOpen ? ' is-active' : ''}`} onClick={() => setMapOpen((v) => !v)} title="Map (H)">
            {mapOpen ? <PanelLeftClose aria-hidden strokeWidth={2.25} /> : <PanelLeftOpen aria-hidden strokeWidth={2.25} />}
          </button>
          <button type="button" className={`observe-nav-btn observe-hide-phone${showKeys ? ' is-active' : ''}`} onClick={() => setShowKeys((v) => !v)} title="Keys (?)">
            <Keyboard aria-hidden strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="observe-nav-finish live-test-header-finish"
            onClick={() => (isAllFinalized ? void completeAll() : setIsSummaryShown(true))}
            title={isAllFinalized ? 'Finish Test / Complete Run' : 'Open summary before finishing'}
          >
            <CheckCircle2 aria-hidden strokeWidth={2.25} />
            <span className="observe-nav-finish-label">Finish Test</span>
          </button>
        </div>
      </header>

      <button type="button" className="observe-nav-btn observe-header-toggle" onClick={() => setShowHeader((value) => !value)} title={showHeader ? 'Hide header' : 'Show header'}>
        {showHeader ? <ChevronLeft aria-hidden strokeWidth={2.25} /> : <ChevronRight aria-hidden strokeWidth={2.25} />}
      </button>

      <button type="button" className="observe-finish-fab" onClick={() => (isAllFinalized ? void completeAll() : setIsSummaryShown(true))}>
        {isAllFinalized ? <CheckCircle2 aria-hidden strokeWidth={2.25} /> : <BarChart3 aria-hidden strokeWidth={2.25} />}
        <span>{isAllFinalized ? 'Finish' : 'Summary'}</span>
      </button>

      <aside
        className={`observe-rail ${mapOpen ? 'is-open' : 'is-closed'} ${railSizeClass}${resizing ? ' is-resizing' : ''}`}
        style={{ ['--observe-rail-w']: mapOpen ? `${railWidth}px` : `${RAIL_COLLAPSED}px` } as CSSProperties}
        aria-label="Learner and package item map"
      >
        <div className="observe-rail-person">
          <UserAvatar name={learnerName} avatarUrl={learnerAvatarUrl} size={avatarSize} className="observe-rail-avatar" />
          {mapOpen ? (
            <>
              <p className="observe-rail-name">{learnerName}</p>
              <div className="observe-meta-row live-test-rail-meta">
                <ScreenTooltip
                  width={280}
                  ariaLabel={summaryMetrics.rfcTitle}
                  content={
                    <>
                      <span className="observe-tooltip-header">
                        <span>Learner Struggle (RFC)</span>
                        <span className="font-mono text-amber-300 font-bold">{summaryMetrics.rfc}%</span>
                      </span>
                      <span className="observe-tooltip-divider" />
                      <span className="observe-tooltip-body">
                        <span className="observe-tooltip-row">
                          <span className="observe-tooltip-key">Warm steps / N_total:</span>
                          <span className="observe-tooltip-val">{summaryMetrics.warmSteps} / {summaryMetrics.nTotal}</span>
                        </span>
                        <span className="observe-tooltip-note">
                          {summaryMetrics.rfcTitle} Lower RFC means less observed struggle.
                        </span>
                      </span>
                    </>
                  }
                >
                  <span className="observe-learner-rfc is-rfc justify-between min-w-[5.25rem]">
                    <span className="inline-flex items-center gap-1">
                      <Activity className="h-3 w-3 shrink-0" aria-hidden />
                      <span>RFC</span>
                    </span>
                    <span className="font-mono font-bold text-right ml-1.5">{summaryMetrics.rfc}%</span>
                  </span>
                </ScreenTooltip>
                <ScreenTooltip
                  width={280}
                  ariaLabel={summaryMetrics.racTitle}
                  content={
                    <>
                      <span className="observe-tooltip-header">
                        <span>Learner Focus ({racMetricLabel})</span>
                        <span className="font-mono text-emerald-300 font-bold">{summaryMetrics.rac}%</span>
                      </span>
                      <span className="observe-tooltip-divider" />
                      <span className="observe-tooltip-body">
                        <span className="observe-tooltip-row">
                          <span className="observe-tooltip-key">Formula:</span>
                          <span className="observe-tooltip-val">Avg %x over N_total</span>
                        </span>
                        <span className="observe-tooltip-note">
                          {summaryMetrics.racTitle}
                        </span>
                      </span>
                    </>
                  }
                >
                  <span className="observe-learner-rfc is-percent-c justify-between min-w-[5.25rem]">
                    <span>{racMetricLabel}</span>
                    <span className="font-mono font-bold text-right ml-1.5">{summaryMetrics.rac}%</span>
                  </span>
                </ScreenTooltip>
                <ScreenTooltip
                  width={280}
                  ariaLabel={summaryMetrics.cpdTitle}
                  content={
                    <>
                      <span className="observe-tooltip-header">
                        <span>Peak Observed CPD</span>
                        <span className="font-mono text-cyan-300 font-bold">{formatVolt(summaryMetrics.maxCpd)}</span>
                      </span>
                      <span className="observe-tooltip-divider" />
                      <span className="observe-tooltip-body">
                        <span className="observe-tooltip-row">
                          <span className="observe-tooltip-key">Calculation:</span>
                          <span className="observe-tooltip-val">CVR × CCI × factor</span>
                        </span>
                        <span className="observe-tooltip-note">
                          {summaryMetrics.cpdTitle}
                        </span>
                      </span>
                    </>
                  }
                >
                  <span className="observe-learner-rfc is-cpd justify-between min-w-[5.25rem]">
                    <span>Max CPD</span>
                    <span className="font-mono font-bold text-right ml-1.5">{formatVolt(summaryMetrics.maxCpd)}</span>
                  </span>
                </ScreenTooltip>
              </div>
              <p className="observe-rail-n">{completedCount}/{items.length} scored</p>
            </>
          ) : null}
        </div>

        {mapOpen ? (
          <div className="observe-rail-map">
            <div className="observe-heat layout-column">
              <div className="observe-heat-summary">
                <span className="observe-heat-metric">Items <strong>{items.length}</strong></span>
                <span className="observe-heat-metric muted">Done <strong>{completedCount}</strong></span>
                <span className="observe-heat-metric tabular" title={summaryMetrics.totalTitle}>N_total <strong>{summaryMetrics.nTotal}</strong></span>
                <span className="observe-heat-counts" aria-label="Recorded 7-color counts">
                  {SPECTRUM_COLORS.map((color) => (
                    <span key={color} className={`observe-heat-count is-${color}`} title={`${COLOR_LABEL[color]}: ${summaryMetrics[color]} recorded steps`}>
                      <i aria-hidden />
                      {summaryMetrics[color]}
                    </span>
                  ))}
                </span>
              </div>
              <div className="live-test-flow-audio-row" aria-label="Package flow audio shortcuts">
                <button type="button" onClick={() => void playPackageStartAudio(true)} disabled={!packageStartVariantId} title="Play test start audio">
                  <Volume2 className="h-3 w-3" aria-hidden /> Test
                </button>
                <button type="button" onClick={() => void playPartIntroAudio(1, true)} disabled={!partIntroVariantIds[1]} title="Play Part I intro">
                  I
                </button>
                <button type="button" onClick={() => void playPartIntroAudio(2, true)} disabled={!partIntroVariantIds[2]} title="Play Part II intro">
                  II
                </button>
                <button type="button" onClick={() => void playPartIntroAudio(3, true)} disabled={!partIntroVariantIds[3]} title="Play Part III intro">
                  III
                </button>
                <button type="button" onClick={() => void playPackageEndAudio(true)} disabled={!packageEndVariantId} title="Play test end audio">
                  End
                </button>
              </div>
              <div className="live-test-session-heatmap" aria-label="Package item heatmap grouped by session">
                {sessionsGrouped.map(({ sessionNum, items: sessionItems }) => {
                  const sessionDone = sessionItems.filter(isItemFinalized).length
                  const active = sessionNum === currentSessionNumber
                  const firstSessionIndex = items.findIndex((candidate) => candidate.session_number === sessionNum)
                  return (
                    <section key={sessionNum} className={`live-test-heat-session${active ? ' is-active' : ' is-collapsed'}`}>
                      <div className="live-test-heat-session-head" aria-expanded={active}>
                        <button
                          type="button"
                          className="live-test-heat-session-title"
                          onClick={() => {
                            if (firstSessionIndex >= 0) {
                              setSelectedIndex(firstSessionIndex)
                              setIsSummaryShown(false)
                            }
                          }}
                        >
                          <strong>Session {sessionNum}</strong>
                          <span>{sessionDone}/{sessionItems.length}</span>
                        </button>
                        <button
                          type="button"
                          className="live-test-heat-session-audio"
                          onClick={() => {
                            if (firstSessionIndex >= 0) setSelectedIndex(firstSessionIndex)
                            void playSessionIntroAudio(sessionNum, true, false)
                          }}
                          disabled={!sessionIntroVariantIds[sessionNum]}
                          title={sessionIntroVariantIds[sessionNum] ? `Play Session ${sessionNum} intro` : `Session ${sessionNum} intro audio is missing`}
                          aria-label={`Play Session ${sessionNum} intro`}
                        >
                          <Volume2 className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      {active ? (
                        <div className="live-test-heat-session-grid">
                          {sessionItems.map((item) => {
                            const idx = items.findIndex((candidate) => candidate.id === item.id)
                            const color = getItemColor(item)
                            const statusClass = isItemFinalized(item) && color ? `is-${color}` : 'is-empty'
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`observe-heat-dot-btn ${statusClass}${idx === selectedIndex ? ' is-current' : ''}`}
                                title={`Session ${sessionNum} · Q${item.global_item_order}: ${item.prompt_text ?? ''}`}
                                onClick={() => {
                                  setSelectedIndex(idx)
                                  setIsSummaryShown(false)
                                }}
                              >
                                {item.global_item_order}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </section>
                  )
                })}
              </div>

              <div className={`live-test-audio-panel${audioPanelOpen ? ' is-open' : ' is-collapsed'}`} aria-label="Audio controls">
                <button
                  type="button"
                  className="live-test-audio-head"
                  onClick={() => setAudioPanelOpen((value) => !value)}
                  aria-expanded={audioPanelOpen}
                >
                  <span><SlidersHorizontal className="h-3.5 w-3.5" /> Audio</span>
                  <strong>{audioState}</strong>
                  {audioPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <div className="live-test-audio-body" hidden={!audioPanelOpen}>
                    <audio
                      ref={audioRef}
                      id="live-test-current-audio"
                      controls
                      onPlay={() => {
                        markAudioReady({ suppressAutoPlay: false })
                        if ((audioTargetRef.current === 'item' || audioTargetRef.current === 'item_prefix') && currentItem?.id) {
                          autoPlayedItemIdsRef.current.add(String(currentItem.id))
                        }
                        setAudioState('playing')
                      }}
                      onEnded={handleAudioEnded}
                      onError={() => {
                        if (audioTargetRef.current === 'item_prefix') {
                          // Prefix audio failed (e.g. 404 or network glitch). Fallback immediately to question audio!
                          const pending = pendingItemAudioRef.current
                          pendingItemAudioRef.current = null
                          if (pending && !pending.isSilent && pending.signedUrl) {
                            setAudioLabel(`Question ${currentItem?.item_order ?? 1}`)
                            setAudioState('loading')
                            activateAudioUrl(pending.signedUrl, `Question ${currentItem?.item_order ?? 1}`, true, 'item')
                            return
                          }
                        }
                        setAudioState('error')
                      }}
                      className="live-test-audio-el"
                    />
                    <p className="live-test-audio-label">{audioLabel}</p>

                    <div className="live-test-audio-toggles-grid">
                      <label className="live-test-audio-toggle">
                        <input
                          type="checkbox"
                          checked={autoPlayItems}
                          onChange={(event) => setAutoPlayItems(event.target.checked)}
                        />
                        <span>Auto Q</span>
                      </label>
                      <label className="live-test-audio-toggle">
                        <input
                          type="checkbox"
                          checked={autoPlaySessionIntro}
                          onChange={(event) => setAutoPlaySessionIntro(event.target.checked)}
                        />
                        <span>Auto Session</span>
                      </label>
                      <label className="live-test-audio-toggle">
                        <input
                          type="checkbox"
                          checked={autoPlayPackageStart}
                          onChange={(event) => setAutoPlayPackageStart(event.target.checked)}
                        />
                        <span>Auto Start</span>
                      </label>
                      <label className="live-test-audio-toggle">
                        <input
                          type="checkbox"
                          checked={autoPlayPartIntro}
                          onChange={(event) => setAutoPlayPartIntro(event.target.checked)}
                        />
                        <span>Auto Part</span>
                      </label>
                      <label className="live-test-audio-toggle col-span-2">
                        <input
                          type="checkbox"
                          checked={autoPlayPackageEnd}
                          onChange={(event) => setAutoPlayPackageEnd(event.target.checked)}
                        />
                        <span>Auto End</span>
                      </label>
                    </div>
                    <div className="live-test-audio-grid">
                      <label>
                        Speed <span>{audioRate.toFixed(2)}×</span>
                        <select
                          value={[0.75, 1, 1.15, 1.25, 1.5, 1.75, 2].includes(audioRate) ? audioRate : 'custom'}
                          onChange={(event) => {
                            if (event.target.value === 'custom') return
                            setAudioRate(clampAudioRate(Number(event.target.value)))
                          }}
                        >
                          <option value={0.75}>0.75×</option>
                          <option value={1}>1× default</option>
                          <option value={1.15}>1.15×</option>
                          <option value={1.25}>1.25×</option>
                          <option value={1.5}>1.5×</option>
                          <option value={1.75}>1.75×</option>
                          <option value={2}>2×</option>
                          <option value="custom">Custom</option>
                        </select>
                        <input
                          type="number"
                          min="0.5"
                          max="3"
                          step="0.05"
                          value={audioRate}
                          onChange={(event) => setAudioRate(clampAudioRate(Number(event.target.value)))}
                          aria-label="Custom audio speed"
                        />
                      </label>
                      <label>
                        Volume <span>{Math.round(audioVolume * 100)}%</span>
                        <input
                          type="range"
                          min="0.05"
                          max="1"
                          step="0.05"
                          value={audioVolume}
                          onChange={(event) => setAudioVolume(audibleVolume(Number(event.target.value)))}
                        />
                      </label>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="observe-rail-peek" onClick={() => setMapOpen(true)} title="Expand">
            <PanelLeftOpen className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          </button>
        )}

        {mapOpen ? (
          <div className="observe-rail-footer">
            <button type="button" className="observe-rail-collapse" onClick={() => setMapOpen(false)} title="Collapse">
              <PanelLeftClose className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            </button>
          </div>
        ) : null}

        {mapOpen ? (
          <div className="observe-rail-resize" role="separator" aria-orientation="vertical" tabIndex={0} onPointerDown={startRailResize}>
            <GripVertical className="observe-rail-resize-grip" aria-hidden strokeWidth={1.75} />
          </div>
        ) : null}
      </aside>

      <main className="observe-stage observe-stage-tight live-test-stage">
        {!isSummaryShown ? (
          <>
            {showKeys ? (
              <p className="observe-depth-inline live-test-shortcuts text-center my-0.5">
                Shortcuts: 0 Red · 1 Orange · 2 Green · 3 Purple · H map · ? keys
              </p>
            ) : null}

            {reaction ? (
              <div key={reaction.id} className={`observe-react observe-react-${reaction.kind}`} aria-hidden>
                <span className="observe-react-symbol"><Check aria-hidden /></span>
                <span className="observe-react-label">{reaction.kind === 'celebrate' ? 'Xuất sắc!' : reaction.kind === 'happy' ? 'Tập trung tốt!' : 'Cần hỗ trợ'}</span>
                <Sparkles className="observe-react-sparkles" aria-hidden />
                <span className="observe-react-burst" />
              </div>
            ) : null}

            <div className={`observe-dock observe-dock-lg live-test-dock-compact${reaction ? ` is-glowing is-${reaction.color}` : ''}`}>
              {showStartCard ? (
                <div className="live-test-start-card w-full max-w-md border-0 bg-transparent p-0 shadow-none">
                  <button
                    type="button"
                    className="btn primary flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm mx-auto shadow-lg"
                    onClick={() => void startLiveAudioFlow()}
                    disabled={!currentItem}
                  >
                    <PlayCircle className="h-5 w-5" aria-hidden />
                    Start Live Test
                  </button>
                  <p className="mt-2 text-[10px] leading-snug text-emerald-500 font-semibold text-center max-w-xs mx-auto">
                    Unlocks audio once, then standard flow runs: Test → Part → Session → Question. Manual audio buttons remain available in the map.
                  </p>
                </div>
              ) : probeOpen ? (
                <div className="observe-dock-probe live-test-probe-dock" role="group" aria-label="Resolve probe">
                  <p className="live-test-probe-depth">CHUNKS NUMBER <strong>{chunksNumber}</strong></p>
                  {PROBE_ACTIONS.map((action) => (
                    <button
                      key={action.outcome}
                      type="button"
                      className={`observe-dock-probe-btn ${action.className}`}
                      onClick={() => void handleProbe(action.outcome)}
                      aria-label={`${action.colorLabel} (${action.label}) probe`}
                    >
                      <span>{action.colorLabel} ({action.label})</span>
                      <kbd>{action.shortcuts.join(' / ')}</kbd>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="observe-dock-colors" role="group" aria-label="Result color">
                  {COLORS.map((c) => (
                    <button key={c.key} type="button" className={`observe-dock-color is-${c.key}${currentColor === c.key ? ' is-selected' : ''}`} onClick={() => void handleRecord(c.key)} disabled={!currentItem} title={`${c.label} · key ${c.num}`}>
                      <span className="observe-dock-num">{c.label}</span>
                      <span className="observe-dock-label">Key {c.num}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="observe-dock-tools observe-split-tools">
                <p className="observe-day-line live-test-day-line">Session {currentSessionNumber} · Q{currentItemNumber}/{items.length} · {completedCount}/{items.length} finalized</p>
              </div>
            </div>

            <div className="live-test-focus-card">
              <div className="live-test-focus-actions">
                <button type="button" className="ghost" disabled={selectedIndex === 0} onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <button
                  type="button"
                  className="live-test-wave-play"
                  onClick={() => void playCurrentItemAudio(true)}
                  aria-label={audioState === 'error' ? 'Retry current item audio' : 'Play current item audio'}
                >
                  {audioState === 'error' ? <RotateCcw className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span className="live-test-wave" aria-hidden><i /><i /><i /><i /></span>
                  <span>{audioState === 'error' ? 'Retry' : audioState === 'playing' ? 'Playing' : 'Play'}</span>
                </button>
                <button type="button" className="ghost" disabled={selectedIndex === items.length - 1} onClick={() => setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1))}>
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="live-test-prompt-box">
                <p>Item text · Q{currentItemNumber}</p>
                <strong>“{currentPrimaryPrompt}”</strong>
                {alternatePrompt ? (
                  <span className="live-test-prompt-subtitle">
                    {alternateLanguageLabel}: “{alternatePrompt}”
                  </span>
                ) : null}
              </div>

              <div className="live-test-cpd-row">
                <span className="metric-cvr">CVR {formatOhm(currentItem?.cvr)}</span>
                <span className="metric-cci">CCI {formatAmp(currentItem?.cci)}</span>
                <span className="is-strong metric-cpd">CPD {formatVolt(currentCpd)}</span>
                <span className="metric-cpd">Min {formatVolt(summaryMetrics.minCpd)}</span>
                <span className="metric-cpd">Max {formatVolt(summaryMetrics.maxCpd)}</span>
                <span className="metric-cpd">Avg {formatVolt(summaryMetrics.avgCpd)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 w-full max-w-4xl overflow-y-auto p-4">
            <Panel icon={BarChart3} title={`Màn hình Ghi nhận & Xem Kết quả · ${learnerName}`} description={`Tổng số câu trong Package: ${items.length} | Đã hoàn thành: ${summaryMetrics.finalized}/${items.length} | ${summaryMetrics.totalTitle}`} collapsible={false}>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 my-3">
                {SPECTRUM_COLORS.map((color) => (
                  <div key={color} className={`p-3 rounded-xl border text-center ${SUMMARY_TILE_CLASS[color]}`} title={`${COLOR_LABEL[color]}: ${summaryMetrics[color]} recorded steps`}>
                    <div className={`text-2xl font-bold ${SUMMARY_TILE_COUNT_CLASS[color]}`}>{summaryMetrics[color]}</div>
                    <div className={`text-xs font-semibold ${SUMMARY_TILE_LABEL_CLASS[color]}`}>{COLOR_LABEL[color]}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-900 p-4 text-xs font-mono text-white shadow-inner sm:grid-cols-3 lg:grid-cols-5">
                <div title={summaryMetrics.rfcTitle}><span className="text-slate-400">RFC </span><strong className="text-red-400">{summaryMetrics.rfc}%</strong></div>
                <div title={summaryMetrics.racTitle}><span className="text-slate-400">{racMetricLabel} </span><strong className="text-emerald-400">{summaryMetrics.rac}%</strong></div>
                <div><span className="text-slate-400">CPD min </span><strong className="text-blue-300">{formatVolt(summaryMetrics.minCpd)}</strong></div>
                <div><span className="text-slate-400">CPD max </span><strong className="text-blue-300">{formatVolt(summaryMetrics.maxCpd)}</strong></div>
                <div><span className="text-slate-400">CPD avg </span><strong className="text-blue-300">{formatVolt(summaryMetrics.avgCpd)}</strong></div>
              </div>

              <div className="space-y-2 pt-5">
                <h3 className="font-bold text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-500" /> CPD & result colors ({items.length} items)</h3>
                <div className="h-72 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return <div className="p-3 rounded-lg bg-slate-900 text-white text-xs space-y-1 shadow-lg border border-slate-800"><div className="font-bold text-blue-400">{d.label}: {d.prompt}</div><div>Achieved CPD: <strong className="text-blue-300">{formatVolt(d.cpd)}</strong></div><div>Base: {formatVolt(d.baseCpd)} · CVR <span className="text-rose-300">{formatOhm(d.cvr)}</span> × CCI <span className="text-emerald-300">{formatAmp(d.cci)}</span></div><div className="capitalize">Result: <strong>{d.colorKey}</strong></div></div>
                      }} />
                      <Bar dataKey="cpd" radius={[4, 4, 0, 0]}>{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.hex} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-6 sm:flex-row">
                <button type="button" className="ghost flex-1 py-3" onClick={() => setIsSummaryShown(false)}>Back to scoring</button>
                {isAllFinalized ? (
                  <button type="button" className="primary flex-1 py-3" onClick={() => void completeAll()}><CheckCircle2 className="h-5 w-5" /> Finish Run & Open Analysis</button>
                ) : (
                  <button type="button" className="primary flex-1 py-3" onClick={() => void stopCurrentSessionAndOpenSummary()}><CheckCircle2 className="h-5 w-5" /> Stop session & Summary</button>
                )}
              </div>
            </Panel>
          </div>
        )}

      </main>
    </div>
  )
}
