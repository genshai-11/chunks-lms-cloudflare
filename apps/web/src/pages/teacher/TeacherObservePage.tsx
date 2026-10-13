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
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Keyboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  advancePosition,
  createCaptureSession,
  currentAttempt,
  jumpToQuestion,
  markSessionCompleted,
  retreatPosition,
  sessionColorSummary,
  type CaptureSessionState,
} from '../../modules/assessment/session-capture'
import { ObserveHeatmap } from '../../components/ObserveHeatmap'
import { ScreenTooltip } from '../../components/ScreenTooltip'
import { UserAvatar } from '../../components/UserAvatar'
import type { ProvisionalColor, ResultColor } from '../../modules/result-lifecycle/types'
import { PROBE_ACTIONS } from '../../modules/assessment/probe-actions'
import { probeChunksNumber } from '../../modules/assessment/probe-metrics'
import type { LiveTestItem } from '../../modules/assessment/live-test'
import {
  audioAssetIdForLanguage,
  blockSummary,
  liveTestExternalRef,
  promptForLanguage,
} from '../../modules/assessment/live-test'
import { audioUrl, listLiveTestBlocks, listLiveTestItems } from '../../lib/live-test-resources'
import {
  resolveSessionDayNumber,
  sessionDayBadge,
  sessionDayHash,
  sessionLabel,
} from '../../modules/reporting/session-series'
import { completeLearningSession } from '../../modules/scheduling/session-lifecycle'
import { learnerCurrentSessionNumber } from '../../modules/teacher/learner-insights'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { useAppState } from '../../state/useAppState'
import {
  createLiveQuestion,
  ensureLearningSessionOnServer,
  loadLiveCapture,
  recordLiveColor,
  replaceLiveAttempt,
  resolveLiveProbe,
} from '../../lib/live-assessment'
import { getSupabase } from '../../lib/supabase'
import { triggerConfetti } from '../../lib/confetti'
import { playColorClick, resultAudioUrl } from '../../lib/color-audio'
import { SPECTRUM_COLORS } from '../../modules/result-lifecycle/types'
import { COLOR_PERCENT_X_VALUES } from '../../modules/metrics/calculate'

const COLORS: { key: ProvisionalColor; label: string; shortcut: string }[] = [
  { key: 'red', label: 'Red', shortcut: '0' },
  { key: 'orange', label: 'Orange', shortcut: '1' },
  { key: 'green', label: 'Green', shortcut: '2' },
  { key: 'purple', label: 'Purple', shortcut: '3' },
]

const SPECTRUM_LABEL: Record<ResultColor, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  indigo: 'Indigo',
  purple: 'Purple',
}

const SPECTRUM_BG: Record<ResultColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-500',
  blue: 'bg-sky-400',
  indigo: 'bg-indigo-500',
  purple: 'bg-fuchsia-500',
}

const SPECTRUM_PILL: Record<ResultColor, string> = {
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  orange: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  yellow: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/20',
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
  indigo: 'bg-indigo-400/10 text-indigo-300 border-indigo-400/20',
  purple: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
}

type ReactionKind = 'celebrate' | 'happy' | 'fight'
type Reaction = { kind: ReactionKind; color: ResultColor; id: number } | null

function reactionFor(color: ResultColor): ReactionKind {
  if (color === 'purple') return 'celebrate'
  if (color === 'green') return 'happy'
  return 'fight'
}

const RAIL_W_KEY = 'chunks-lms:observe-rail-w'
const RAIL_MIN = 152
const RAIL_MAX = 440
const RAIL_DEFAULT = 224
const RAIL_COLLAPSED = 48

function readSavedRailWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(RAIL_W_KEY))
    if (Number.isFinite(n)) return Math.min(RAIL_MAX, Math.max(RAIL_MIN, n))
  } catch {
    /* ignore */
  }
  return RAIL_DEFAULT
}

function formatFinishSummary(
  capture: CaptureSessionState,
  className: string | null,
  dayLabel: string,
): string {
  const summary = sessionColorSummary(capture)
  const unresolved = summary.byColor.open + summary.byColor.draft
  return [
    'Session finished',
    '',
    `${dayLabel}${className ? ` · ${className}` : ''}`,
    `Learners: ${capture.learnerIds.length}`,
    `Questions: ${capture.questions.length}`,
    `Finalized: ${summary.done}/${summary.total}`,
    `0 Red: ${summary.byColor.red}`,
    `1 Orange: ${summary.byColor.orange}`,
    `F Yellow: ${summary.byColor.yellow}`,
    `2 Green: ${summary.byColor.green}`,
    `C Blue: ${summary.byColor.blue}`,
    `D Indigo: ${summary.byColor.indigo}`,
    `3 Purple: ${summary.byColor.purple}`,
    `N_total: ${summary.totalRecords} (${summary.primaryRecords} primary + ${summary.probeRecords} probe)`,
    `Max chunks number: ${summary.maxProbeDepth}`,
    unresolved > 0
      ? `Left unfinalized when session closed: ${unresolved}`
      : 'All captured attempts finalized.',
  ].join('\n')
}

function currentAttemptForLearner(capture: CaptureSessionState, learnerUserId: string) {
  const attempts = capture.attempts.filter((a) => a.learnerUserId === learnerUserId)
  return (
    attempts.find(
      (a) =>
        a.snapshot.status === 'draft' ||
        a.snapshot.status === 'probe_open' ||
        a.snapshot.status === 'resolution_required',
    ) ??
    attempts.at(-1) ??
    null
  )
}

/**
 * Observe: left rail (avatar + collapsible map), big name, large bottom color dock,
 * happy/fight reaction flash. Phone-friendly. Rail is drag-resizable when open.
 */
export function TeacherObservePage() {
  const navigate = useNavigate()
  const exitPath = '/teacher/session'
  const {
    roster,
    ledger,
    capture,
    setCapture,
    appendFinalizedFromCapture,
    scheduling,
    setScheduling,
    activeLearnerUserId,
    syncNow,
  } = useAppState()
  const [toast, setToast] = useState<string | null>(null)
  const [showHeader, setShowHeader] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle')
  const [showKeys, setShowKeys] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [liveLoading, setLiveLoading] = useState(true)
  const [liveSaving, setLiveSaving] = useState(false)
  const [finishSummary, setFinishSummary] = useState<string | null>(null)
  /** Desktop: open by default. Phone: closed so stage + colors stay primary. */
  const [mapOpen, setMapOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true,
  )
  const [reaction, setReaction] = useState<Reaction>(null)
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  )
  const [activeSplitLearnerId, setActiveSplitLearnerId] = useState<string | null>(null)
  const [showHeatmapPopupLearnerId, setShowHeatmapPopupLearnerId] = useState<string | null>(null)
  const [liveTestItems, setLiveTestItems] = useState<LiveTestItem[]>([])
  const [liveTestBlockSummary, setLiveTestBlockSummary] = useState<string | null>(null)
  const [playedIntroForSessionId, setPlayedIntroForSessionId] = useState<string | null>(null)
  const railWidthRef = useRef(railWidth)
  const captureRef = useRef(capture)
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveSavingRef = useRef(liveSaving)
  useEffect(() => {
    liveSavingRef.current = liveSaving
  }, [liveSaving])

  useEffect(() => {
    captureRef.current = capture
  }, [capture])

  useEffect(() => {
    setRailWidth(readSavedRailWidth())
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = () => {
      setIsPhone(mq.matches)
      // When switching to phone, collapse map so dock stays visible
      if (mq.matches) setMapOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    railWidthRef.current = railWidth
  }, [railWidth])

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

  const railSizeClass = !mapOpen
    ? 'is-narrow'
    : railWidth < 190
      ? 'is-compact'
      : railWidth > 300
        ? 'is-wide'
        : 'is-mid'

  const avatarSize = !mapOpen ? 'sm' : railWidth > 300 ? 'xl' : railWidth > 200 ? 'lg' : 'md'

  const { classRow, teacher } = useTeacherClassContext()
  const openSession = scheduling.learningSessions.find(
    (s) => s.classId === classRow?.id && s.status === 'open',
  )
  const activeLearnerIds = useMemo(
    () =>
      classRow
        ? roster.enrollments
            .filter(
              (enrollment) => enrollment.classId === classRow.id && enrollment.status === 'active',
            )
            .map((enrollment) => enrollment.learnerUserId)
        : [],
    [classRow, roster.enrollments],
  )
  const isLiveTest = openSession?.sessionFormat === 'test'
  const liveTestLanguage = openSession?.promptLanguage ?? 'vi'

  useEffect(() => {
    if (!isLiveTest || !openSession?.liveTestBlockId) {
      setLiveTestItems([])
      setLiveTestBlockSummary(null)
      return
    }
    let cancelled = false
    void Promise.all([
      listLiveTestItems(openSession.liveTestBlockId),
      openSession.liveTestResourceId ? listLiveTestBlocks(openSession.liveTestResourceId) : Promise.resolve(null),
    ]).then(([itemsResult, blocksResult]) => {
      if (cancelled) return
      if (itemsResult.ok) setLiveTestItems(itemsResult.data)
      if (blocksResult && blocksResult.ok) {
        const block = blocksResult.data.find((b) => b.id === openSession.liveTestBlockId)
        setLiveTestBlockSummary(block ? `Session ${block.blockNumber} · ${blockSummary(block)}` : null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isLiveTest, openSession?.liveTestBlockId, openSession?.liveTestResourceId])

  const refreshLiveCapture = useCallback(async () => {
    if (!openSession || !teacher) {
      setLiveLoading(false)
      return
    }
    const learnerIds = openSession.participantLearnerIds?.length
      ? openSession.participantLearnerIds
      : activeLearnerIds

    // Push open day to server (best-effort) so RPC can work when online
    void ensureLearningSessionOnServer(openSession)

    // Prefer existing capture board only when it belongs to the same live session and same learners.
    // Never reuse a richer board from another learner/session — that opens Observe on the wrong learner.
    const existing = captureRef.current
    const compatibleExisting =
      existing &&
      existing.learningSessionId === openSession.id &&
      existing.learnerIds.length === learnerIds.length &&
      learnerIds.every((id) => existing.learnerIds.includes(id))
        ? existing
        : null
    const localFallback =
      compatibleExisting ??
      createCaptureSession({
        learningSessionId: openSession.id,
        teacherUserId: teacher.id,
        learnerIds,
        maxProbeCount: openSession.maxProbeCount,
      })

    // Render immediately. Supabase can reconcile in the background, but Day 1 Observe
    // must never stay on a blank loading screen while the network/database warms up.
    if (!compatibleExisting) setCapture(localFallback)
    setLiveLoading(false)

    const result = await loadLiveCapture({
      learningSessionId: openSession.id,
      teacherUserId: teacher.id,
      learnerIds,
      sessionStatus: openSession.status,
      maxProbeCount: openSession.maxProbeCount,
      fallback: localFallback,
    })
    if (!result.ok) return

    // Don't overwrite a richer compatible local board with an empty/older cloud board.
    const latest = captureRef.current
    const latestCompatible =
      latest &&
      latest.learningSessionId === openSession.id &&
      latest.learnerIds.length === learnerIds.length &&
      learnerIds.every((id) => latest.learnerIds.includes(id))
        ? latest
        : localFallback
    if (
      latestCompatible.questions.length > 0 &&
      result.data.questions.length < latestCompatible.questions.length
    ) {
      return
    }
    setCapture(result.data)
  }, [openSession, teacher, activeLearnerIds, setCapture])

  useEffect(() => {
    void refreshLiveCapture()
  }, [refreshLiveCapture])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase || !openSession) return
    const channel = supabase
      .channel(`observe-session:${openSession.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assessment_attempt_snapshots' },
        () => {
          if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current)
          const scheduleRefresh = (delay = 150) => {
            liveRefreshTimer.current = window.setTimeout(() => {
              if (liveSavingRef.current) {
                // Scoring in-flight: wait and retry after save completes to avoid clobbering state
                scheduleRefresh(200)
                return
              }
              void refreshLiveCapture()
            }, delay)
          }
          scheduleRefresh(150)
        },
      )
      .subscribe()
    return () => {
      if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [openSession, refreshLiveCapture])

  const attempt = capture ? currentAttempt(capture) : null
  const learner = attempt ? roster.users.find((u) => u.id === attempt.learnerUserId) : null

  const plannedCount = scheduling.scheduledSessions.filter(
    (s) => s.classId === classRow?.id && s.status !== 'cancelled' && s.status !== 'rescheduled',
  ).length
  const totalDays =
    classRow?.schedule?.sessionCount && classRow.schedule.sessionCount > 0
      ? classRow.schedule.sessionCount
      : plannedCount > 0
        ? plannedCount
        : null

  const dayNumber = openSession
    ? resolveSessionDayNumber(openSession, {
        scheduledSessions: scheduling.scheduledSessions,
        learningSessions: scheduling.learningSessions,
      })
    : null

  const targetDayNumber = openSession
    ? (openSession.sessionNumber ?? dayNumber)
    : (activeLearnerUserId
        ? learnerCurrentSessionNumber({
            ledger,
            scheduling,
            learnerUserId: activeLearnerUserId,
            classId: classRow?.id,
          })
        : dayNumber)

  const dayLabel = sessionLabel(targetDayNumber, openSession?.startedAt, totalDays)
  const finishMetrics = useMemo(() => {
    if (!capture) return null
    const summary = sessionColorSummary(capture)
    const unresolved = summary.byColor.open + summary.byColor.draft
    return {
      className: classRow?.name ?? 'Class',
      dayLabel,
      learnerCount: capture.learnerIds.length,
      questionCount: capture.questions.length,
      done: summary.done,
      total: summary.total,
      red: summary.byColor.red,
      orange: summary.byColor.orange,
      yellow: summary.byColor.yellow,
      green: summary.byColor.green,
      blue: summary.byColor.blue,
      indigo: summary.byColor.indigo,
      purple: summary.byColor.purple,
      recordedByColor: summary.recordedByColor,
      totalRecords: summary.totalRecords,
      maxProbeDepth: summary.maxProbeDepth,
      unresolved,
    }
  }, [capture, classRow?.name, dayLabel])
  const finishButtonLabel =
    saveStatus === 'success' ? 'Saved!' : saveStatus === 'saving' || finishing ? 'Saving…' : 'Finish'
  const confirmFinishLabel =
    saveStatus === 'success'
      ? 'Saved!'
      : saveStatus === 'saving' || finishing
        ? 'Saving…'
        : 'Save & Finish'
  useEffect(() => {
    if (isPhone && (capture?.questions.length ?? 0) > 0) setShowHeader(false)
  }, [isPhone, capture?.questions.length])

  const dayBadge = sessionDayBadge(targetDayNumber, totalDays)
  const openParticipants = openSession?.participantLearnerIds?.length
    ? openSession.participantLearnerIds
    : activeLearnerIds
  const activeLearnerMismatch = Boolean(
    activeLearnerUserId && openSession && !openParticipants.includes(activeLearnerUserId),
  )
  const activeLearnerName = activeLearnerUserId
    ? (roster.users.find((user) => user.id === activeLearnerUserId)?.displayName ??
      activeLearnerUserId.slice(0, 6))
    : null
  const openLearnerNames = openParticipants
    .map((id) => roster.users.find((user) => user.id === id)?.displayName ?? id.slice(0, 6))
    .join(', ')

  // Keep browser URL in sync: /teacher/observe#day-3
  useEffect(() => {
    if (targetDayNumber == null) return
    const hash = sessionDayHash(targetDayNumber)
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
    }
    document.title = `${dayBadge} · Observe · Chunks LMS`
  }, [targetDayNumber, dayBadge])

  const qNum = capture ? capture.position.questionIndex + 1 : 0
  const qTotal = capture?.questions.length ?? 0
  const currentQuestion = capture?.questions[capture.position.questionIndex] ?? null
  const currentLiveTestItem = currentQuestion?.externalRef?.startsWith('live-test-item:')
    ? liveTestItems.find((item) => currentQuestion.externalRef === liveTestExternalRef(item.id)) ?? null
    : null
  const currentLiveTestPrompt = currentLiveTestItem
    ? promptForLanguage(currentLiveTestItem, liveTestLanguage)
    : null

  useEffect(() => {
    if (!isLiveTest || !openSession || playedIntroForSessionId === openSession.id) return
    setPlayedIntroForSessionId(openSession.id)
    // Intro audio URL lookup is best-effort; prompt text remains visible without audio.
  }, [isLiveTest, openSession, playedIntroForSessionId])

  useEffect(() => {
    const assetId = currentLiveTestItem
      ? audioAssetIdForLanguage(currentLiveTestItem, liveTestLanguage)
      : null
    if (!assetId) return
    let cancelled = false
    void audioUrl(assetId).then((url) => {
      if (cancelled || !url) return
      const audio = new Audio(url)
      void audio.play().catch((err) => console.warn('[observe] test audio play failed:', err))
    })
    return () => {
      cancelled = true
    }
  }, [currentLiveTestItem, liveTestLanguage])

  const chunksNumber = attempt?.snapshot
    ? (probeChunksNumber(attempt.snapshot) ?? 1)
    : 1
  const isFinalized =
    attempt?.snapshot.status === 'finalized' || attempt?.snapshot.status === 'corrected'
  const probeOpen =
    attempt?.snapshot.status === 'probe_open' || attempt?.snapshot.status === 'resolution_required'
  const summary = capture ? sessionColorSummary(capture) : null
  const warmRecords = summary
    ? summary.recordedByColor.red + summary.recordedByColor.orange + summary.recordedByColor.yellow
    : 0
  const coolRecords = summary
    ? summary.recordedByColor.green + summary.recordedByColor.blue + summary.recordedByColor.indigo + summary.recordedByColor.purple
    : 0
  const done = summary ? summary.done : 0
  const rfcPct = summary?.totalRecords ? Math.round((warmRecords / summary.totalRecords) * 100) : 0
  const sumPercentX = summary
    ? SPECTRUM_COLORS.reduce((acc, c) => acc + summary.recordedByColor[c] * COLOR_PERCENT_X_VALUES[c], 0)
    : 0
  const avgPercentX = summary?.totalRecords ? sumPercentX / summary.totalRecords : 0
  const racPct = Math.round(avgPercentX)
  const legacyRacPct = summary?.totalRecords ? Math.round((coolRecords / summary.totalRecords) * 100) : 0
  const rfcTitle = summary
    ? `RFC = warm records / N_total = ${warmRecords} / ${summary.totalRecords}. Warm = Red + Orange + Yellow.`
    : 'RFC = warm records / N_total'
  const racTitle = summary
    ? `%c = Avg %x = sum(%x) / N_total = ${sumPercentX.toFixed(1)}% / ${summary.totalRecords} = ${avgPercentX.toFixed(1)}%. (Legacy RAC = ${legacyRacPct}%).`
    : '%c = Avg %x = sum(%x) / N_total'
  const splitMode = capture?.learnerIds.length === 2

  const learnerName = useCallback(
    (id: string) => roster.users.find((u) => u.id === id)?.displayName ?? id.slice(0, 6),
    [roster.users],
  )

  useEffect(() => {
    if (!capture || capture.learnerIds.length !== 2) return
    if (!activeSplitLearnerId || !capture.learnerIds.includes(activeSplitLearnerId)) {
      setActiveSplitLearnerId(capture.learnerIds[0] ?? null)
    }
  }, [capture, activeSplitLearnerId])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 900)
  }, [])

  const nextLiveTestExternalRef = useCallback(
    (state: CaptureSessionState): string | null | undefined => {
      if (!isLiveTest) return undefined
      const item = liveTestItems[state.questions.length]
      return item ? liveTestExternalRef(item.id) : null
    },
    [isLiveTest, liveTestItems],
  )

  const playReaction = useCallback((color: ResultColor) => {
    const id = Date.now()
    setReaction({ kind: reactionFor(color), color, id })
    if (color === 'purple') {
      triggerConfetti()
    }

    try {
      playColorClick(color)
      const audio = new Audio(resultAudioUrl(color))
      void audio.play().catch((err) => {
        console.warn('[observe] audio play failed:', err)
      })
    } catch (e) {
      console.warn('[observe] audio init failed:', e)
    }

    window.setTimeout(() => setReaction((current) => (current?.id === id ? null : current)), 1200)
  }, [])

  const advanceAfterFinal = useCallback(
    async (state: CaptureSessionState): Promise<CaptureSessionState> => {
      if (state.position.questionIndex < state.questions.length - 1) {
        return advancePosition(state)
      }
      const externalRef = nextLiveTestExternalRef(state)
      if (externalRef === null) {
        flash('Live-test block complete')
        return state
      }
      try {
        const created = await createLiveQuestion({
          capture: state,
          openSession: openSession ?? null,
          externalRef,
        })
        if (!created.ok) {
          flash(created.error)
          if (state.position.questionIndex < state.questions.length - 1) {
            return advancePosition(state)
          }
          return state
        }
        return created.data
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Failed to create next question')
        if (state.position.questionIndex < state.questions.length - 1) {
          return advancePosition(state)
        }
        return state
      }
    },
    [flash, openSession, nextLiveTestExternalRef],
  )

  const recordColor = useCallback(
    async (color: ProvisionalColor) => {
      if (!capture || !attempt || liveSaving) return
      const wasFinal = isFinalized
      setLiveSaving(true)
      try {
        const result = await recordLiveColor(attempt, color)
        if (!result.ok) {
          flash(result.error)
          return
        }
        let next = replaceLiveAttempt(capture, result.data)
        setCapture(next)
        appendFinalizedFromCapture(next)
        if (
          result.data.snapshot.status === 'finalized' ||
          result.data.snapshot.status === 'corrected'
        ) {
          playReaction(color)
          if (!wasFinal) {
            next = await advanceAfterFinal(next)
            setCapture(next)
            appendFinalizedFromCapture(next)
          }
        } else if (color === 'green') {
          playReaction('green')
        }
      } finally {
        setLiveSaving(false)
      }
    },
    [
      capture,
      attempt,
      liveSaving,
      isFinalized,
      setCapture,
      appendFinalizedFromCapture,
      playReaction,
      advanceAfterFinal,
      flash,
    ],
  )

  const resolveProbe = useCallback(
    async (outcome: 'fail' | 'continue' | 'done') => {
      if (!capture || !attempt || liveSaving) return
      setLiveSaving(true)
      try {
        const result = await resolveLiveProbe(attempt, outcome)
        if (!result.ok) {
          flash(result.error)
          return
        }
        let next = replaceLiveAttempt(capture, result.data)
        setCapture(next)
        appendFinalizedFromCapture(next)
        if (
          result.data.snapshot.status === 'finalized' ||
          result.data.snapshot.status === 'corrected'
        ) {
          const color: ResultColor = outcome === 'fail' ? 'yellow' : 'indigo'
          playReaction(color)
          next = await advanceAfterFinal(next)
          setCapture(next)
          appendFinalizedFromCapture(next)
        } else if (outcome === 'continue') {
          try {
            playColorClick('blue')
            const audio = new Audio(resultAudioUrl('blue'))
            void audio.play().catch((err) => {
              console.warn('[observe] audio play failed:', err)
            })
          } catch (e) {
            console.warn('[observe] audio init failed:', e)
          }
          flash(`Chunks Number=${probeChunksNumber(result.data.snapshot) ?? 1}`)
        }
      } finally {
        setLiveSaving(false)
      }
    },
    [
      capture,
      attempt,
      liveSaving,
      setCapture,
      appendFinalizedFromCapture,
      playReaction,
      advanceAfterFinal,
      flash,
    ],
  )

  const advanceLearnerPane = useCallback(
    async (state: CaptureSessionState, learnerUserId: string): Promise<CaptureSessionState> => {
      const externalRef = nextLiveTestExternalRef(state)
      if (externalRef === null) {
        flash('Live-test block complete')
        return state
      }
      try {
        const created = await createLiveQuestion({
          capture: state,
          openSession: openSession ?? null,
          learnerUserId,
          externalRef,
        })
        if (!created.ok) {
          flash(created.error)
          return state
        }
        return created.data
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Failed to advance learner')
        return state
      }
    },
    [flash, openSession, nextLiveTestExternalRef],
  )
  const recordColorForLearner = useCallback(
    async (learnerUserId: string, color: ProvisionalColor) => {
      if (!capture || liveSaving) return
      const learnerAttempt = currentAttemptForLearner(capture, learnerUserId)
      if (!learnerAttempt) return
      const wasFinal =
        learnerAttempt.snapshot.status === 'finalized' ||
        learnerAttempt.snapshot.status === 'corrected'
      setLiveSaving(true)
      try {
        const result = await recordLiveColor(learnerAttempt, color)
        if (!result.ok) {
          flash(result.error)
          return
        }
        let next = replaceLiveAttempt(capture, result.data)
        setCapture(next)
        appendFinalizedFromCapture(next)
        if (
          result.data.snapshot.status === 'finalized' ||
          result.data.snapshot.status === 'corrected'
        ) {
          playReaction(color)
          if (!wasFinal) {
            next = await advanceLearnerPane(next, learnerUserId)
            setCapture(next)
            appendFinalizedFromCapture(next)
          }
        } else if (color === 'green') {
          playReaction('green')
        }
      } finally {
        setLiveSaving(false)
      }
    },
    [
      capture,
      liveSaving,
      setCapture,
      appendFinalizedFromCapture,
      playReaction,
      advanceLearnerPane,
      flash,
    ],
  )

  const resolveProbeForLearner = useCallback(
    async (learnerUserId: string, outcome: 'fail' | 'continue' | 'done') => {
      if (!capture || liveSaving) return
      const learnerAttempt = currentAttemptForLearner(capture, learnerUserId)
      if (!learnerAttempt) return
      setLiveSaving(true)
      try {
        const result = await resolveLiveProbe(learnerAttempt, outcome)
        if (!result.ok) {
          flash(result.error)
          return
        }
        let next = replaceLiveAttempt(capture, result.data)
        setCapture(next)
        appendFinalizedFromCapture(next)
        if (
          result.data.snapshot.status === 'finalized' ||
          result.data.snapshot.status === 'corrected'
        ) {
          const color: ResultColor = outcome === 'fail' ? 'yellow' : 'indigo'
          playReaction(color)
          next = await advanceLearnerPane(next, learnerUserId)
          setCapture(next)
          appendFinalizedFromCapture(next)
        } else if (outcome === 'continue') {
          try {
            playColorClick('blue')
            const audio = new Audio(resultAudioUrl('blue'))
            void audio.play().catch((err) => {
              console.warn('[observe] audio play failed:', err)
            })
          } catch (e) {
            console.warn('[observe] audio init failed:', e)
          }
          flash(`Chunks Number=${probeChunksNumber(result.data.snapshot) ?? 1}`)
        }
      } finally {
        setLiveSaving(false)
      }
    },
    [
      capture,
      liveSaving,
      setCapture,
      appendFinalizedFromCapture,
      playReaction,
      advanceLearnerPane,
      flash,
    ],
  )

  const startFirst = useCallback(async () => {
    if (!capture || liveSaving) return
    setLiveSaving(true)
    try {
      if (openSession) {
        const ensured = await ensureLearningSessionOnServer(openSession)
        if (!ensured.ok) {
          // Local observe still works; surface soft warning once
          console.warn('[observe] session push:', ensured.error)
        }
      }
      const firstLearners = capture.learnerIds.length === 2 ? capture.learnerIds : [null]
      let next = capture
      for (const learnerUserId of firstLearners) {
        const externalRef = nextLiveTestExternalRef(next)
        if (externalRef === null) {
          flash('Live-test block complete')
          return
        }
        const result = await createLiveQuestion({
          capture: next,
          openSession: openSession ?? null,
          learnerUserId,
          externalRef,
        })
        if (!result.ok) {
          flash(result.error)
          return
        }
        next = result.data
      }
      setCapture(next)
      flash(capture.learnerIds.length === 2 ? '2 learners ready' : 'Q1 ready')
    } finally {
      setLiveSaving(false)
    }
  }, [capture, liveSaving, setCapture, flash, openSession, nextLiveTestExternalRef])

  const prevCell = useCallback(() => {
    if (!capture || capture.questions.length === 0) return
    setCapture(retreatPosition(capture))
  }, [capture, setCapture])

  const nextCell = useCallback(() => {
    if (!capture || capture.questions.length === 0) return
    if (capture.position.questionIndex < capture.questions.length - 1) {
      setCapture(advancePosition(capture))
    }
  }, [capture, setCapture])

  const selectQuestion = useCallback(
    (questionIndex: number) => {
      if (!capture) return
      setCapture(jumpToQuestion(capture, questionIndex))
    },
    [capture, setCapture],
  )

  /**
   * Finish live session + persist:
   * - sets learning session completedAt so it cannot be resumed
   * - freezes capture (sessionStatus completed)
   * - persists the completed scheduling snapshot explicitly (avoids stale React state)
   * - ledger already has finalized results via appendFinalizedFromCapture
   */
  const handleConfirmFinish = useCallback(async () => {
    if (!capture || !openSession || finishing) return
    setFinishing(true)
    setSaveStatus('saving')
    try {
      const done = completeLearningSession(scheduling, openSession.id, capture.learnerIds)
      if (!done.ok) {
        flash(done.error)
        setSaveStatus('idle')
        return
      }

      const completedCapture = markSessionCompleted(capture)
      setScheduling(done.state)
      setCapture(completedCapture)
      appendFinalizedFromCapture(completedCapture)
      try {
        const { syncCaptureSessionToServer } = await import('../../lib/live-assessment')
        await syncCaptureSessionToServer(completedCapture)
        await syncNow({ scheduling: done.state })
      } catch {
        /* local persist still holds; backend may be offline */
      }
      setSaveStatus('success')
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
      setFinishSummary(null)
      navigate('/teacher/analysis')
    } catch {
      setSaveStatus('idle')
    } finally {
      setFinishing(false)
    }
  }, [
    capture,
    openSession,
    finishing,
    scheduling,
    setScheduling,
    setCapture,
    appendFinalizedFromCapture,
    syncNow,
    navigate,
    flash,
  ])

  const finishSessionAndSave = useCallback(() => {
    if (!capture || !openSession || finishing) return
    setFinishSummary(formatFinishSummary(capture, classRow?.name ?? null, dayLabel))
  }, [capture, openSession, finishing, classRow?.name, dayLabel])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        e.preventDefault()
        if (finishSummary) setFinishSummary(null)
        else navigate(exitPath)
        return
      }
      if (finishSummary) {
        e.preventDefault()
        return
      }
      if (k === '?' || (e.shiftKey && k === '/')) {
        e.preventDefault()
        setShowKeys((v) => !v)
        return
      }
      const splitLearnerId = splitMode ? activeSplitLearnerId : null
      const splitAttempt =
        splitLearnerId && capture ? currentAttemptForLearner(capture, splitLearnerId) : null
      const splitProbeOpen = Boolean(
        splitAttempt?.snapshot.status === 'probe_open' ||
        splitAttempt?.snapshot.status === 'resolution_required',
      )
      if (k === 'f' && !(splitMode ? splitProbeOpen : probeOpen)) {
        e.preventDefault()
        finishSessionAndSave()
        return
      }
      if (k === 'h' || k === 'm') {
        e.preventDefault()
        setMapOpen((v) => !v)
        return
      }
      if (k === 'arrowleft' || k === 'b') {
        e.preventDefault()
        prevCell()
        return
      }
      if (k === 'arrowright') {
        e.preventDefault()
        nextCell()
        return
      }
      if (k === 'n' && capture?.questions.length === 0) {
        e.preventDefault()
        startFirst()
        return
      }
      if (splitMode && splitLearnerId) {
        if (k === 'tab') {
          e.preventDefault()
          const [a, b] = capture?.learnerIds ?? []
          setActiveSplitLearnerId(splitLearnerId === a ? (b ?? a ?? null) : (a ?? null))
          return
        }
        if (splitProbeOpen) {
          if (k === 'f' || k === '1') {
            e.preventDefault()
            resolveProbeForLearner(splitLearnerId, 'fail')
          } else if (k === 'c' || k === '2') {
            e.preventDefault()
            resolveProbeForLearner(splitLearnerId, 'continue')
          } else if (k === 'd' || k === '3' || k === 'enter') {
            e.preventDefault()
            resolveProbeForLearner(splitLearnerId, 'done')
          }
          return
        }
        if (k === '0') {
          e.preventDefault()
          recordColorForLearner(splitLearnerId, 'red')
          return
        }
        if (k === '1') {
          e.preventDefault()
          recordColorForLearner(splitLearnerId, 'orange')
          return
        }
        if (k === '2') {
          e.preventDefault()
          recordColorForLearner(splitLearnerId, 'green')
          return
        }
        if (k === '3') {
          e.preventDefault()
          recordColorForLearner(splitLearnerId, 'purple')
          return
        }
        return
      }
      if (probeOpen) {
        if (k === 'f' || k === '1') {
          e.preventDefault()
          resolveProbe('fail')
        } else if (k === 'c' || k === '2') {
          e.preventDefault()
          resolveProbe('continue')
        } else if (k === 'd' || k === '3' || k === 'enter') {
          e.preventDefault()
          resolveProbe('done')
        }
        return
      }
      if (k === '0') {
        e.preventDefault()
        recordColor('red')
        return
      }
      if (k === '1') {
        e.preventDefault()
        recordColor('orange')
        return
      }
      if (k === '2') {
        e.preventDefault()
        recordColor('green')
        return
      }
      if (k === '3') {
        e.preventDefault()
        recordColor('purple')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    navigate,
    exitPath,
    prevCell,
    nextCell,
    recordColor,
    resolveProbe,
    probeOpen,
    capture,
    startFirst,
    finishSessionAndSave,
    finishSummary,
    splitMode,
    activeSplitLearnerId,
    recordColorForLearner,
    resolveProbeForLearner,
  ])

  if (!openSession) {
    return <Navigate to={exitPath} replace />
  }

  if (activeLearnerMismatch) {
    return (
      <div className="observe-root flex items-center justify-center">
        <div className="observe-modal-card" role="alert">
          <h2 className="observe-modal-title">Wrong live session</h2>
          <p className="observe-modal-desc">
            {activeLearnerName} is selected, but the open live session is for{' '}
            {openLearnerNames || 'another learner'}. Finish that live session before starting a new
            one.
          </p>
          <div className="observe-modal-actions">
            <button
              type="button"
              className="observe-modal-btn observe-modal-confirm"
              onClick={() => navigate('/teacher')}
            >
              Back to learners
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (liveLoading || !capture || capture.learningSessionId !== openSession.id) {
    return (
      <div className="observe-root flex items-center justify-center" role="status">
        <p className="text-sm font-semibold text-slate-300">Loading live session…</p>
      </div>
    )
  }

  if (capture.sessionStatus !== 'open') {
    return <Navigate to={exitPath} replace />
  }

  const renderLearnerPane = (learnerId: string) => {
    const paneAttempt = currentAttemptForLearner(capture, learnerId)
    const user = roster.users.find((u) => u.id === learnerId)
    const learnerQuestions = capture.questions.filter((q) => q.assignedLearnerUserId === learnerId)
    const learnerAttempts = capture.attempts.filter((a) => a.learnerUserId === learnerId)
    const paneProbeOpen =
      paneAttempt?.snapshot.status === 'probe_open' ||
      paneAttempt?.snapshot.status === 'resolution_required'
    const paneFinalized =
      paneAttempt?.snapshot.status === 'finalized' || paneAttempt?.snapshot.status === 'corrected'
    const paneChunksNumber = paneAttempt?.snapshot
      ? (probeChunksNumber(paneAttempt.snapshot) ?? 1)
      : 1
    const learnerQuestionIndex = paneAttempt
      ? Math.max(
          0,
          learnerQuestions.findIndex((q) => q.id === paneAttempt.sessionQuestionId),
        )
      : 0
    const learnerDone = learnerAttempts.filter(
      (a) => a.snapshot.status === 'finalized' || a.snapshot.status === 'corrected',
    ).length
    const learnerWarm = learnerAttempts.filter(
      (a) =>
        a.snapshot.effectiveColor === 'red' ||
        a.snapshot.effectiveColor === 'orange' ||
        a.snapshot.effectiveColor === 'yellow',
    ).length
    const learnerRfc = learnerDone > 0 ? Math.round((learnerWarm / learnerDone) * 100) : 0
    const active = activeSplitLearnerId === learnerId
    const paneLearnerDayNumber = learnerCurrentSessionNumber({
      ledger,
      scheduling,
      learnerUserId: learnerId,
      classId: classRow?.id,
    })

    return (
      <section
        key={learnerId}
        className={`observe-split-pane${active ? ' is-active' : ''}`}
        aria-label={`Observe ${user?.displayName ?? learnerId}`}
        onPointerDown={() => setActiveSplitLearnerId(learnerId)}
      >
        <div className="observe-split-head">
          <UserAvatar
            name={user?.displayName ?? 'Learner'}
            avatarUrl={user?.avatarUrl}
            size="sm"
          />

          <div className="observe-stage-hero observe-split-hero">
            <h2 className="observe-learner observe-learner-solo observe-split-name flex items-center justify-center gap-2">
              <span>{user?.displayName ?? 'Learner'}</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono font-bold">
                Day {paneLearnerDayNumber}
              </span>
            </h2>
            <div className="observe-meta-row">
              <ScreenTooltip
                width={280}
                ariaLabel={`Learner Struggle (RFC): ${learnerDone ? `${learnerRfc}%` : '—'}`}
                content={
                  <>
                    <span className="observe-tooltip-header">
                      <span>Learner Struggle (RFC)</span>
                      <span className="font-mono text-amber-300 font-bold">{learnerDone ? `${learnerRfc}%` : '—'}</span>
                    </span>
                    <span className="observe-tooltip-divider" />
                    <span className="observe-tooltip-body">
                      <span className="observe-tooltip-row">
                        <span className="observe-tooltip-key">Warm steps / finalized:</span>
                        <span className="observe-tooltip-val">{learnerWarm} / {learnerDone}</span>
                      </span>
                      <span className="observe-tooltip-note">
                        Learner RFC uses this learner's finalized effective colors only.
                      </span>
                    </span>
                  </>
                }
              >
                <span className="observe-learner-rfc is-rfc justify-between min-w-[5.25rem]">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" aria-hidden />
                    <span>RFC</span>
                  </span>
                  <span className="font-mono font-bold text-right ml-1.5">{learnerDone ? `${learnerRfc}%` : '—'}</span>
                </span>
              </ScreenTooltip>
              <span className="observe-meta-muted">
                {learnerDone}/{Math.max(learnerAttempts.length, 1)} done
              </span>
            </div>
            {paneProbeOpen ? (
              <p className="observe-depth-inline" title="Chunks Number starts at 1 when Green opens probe; each Continue adds 1.">
                CHUNKS NUMBER <strong>{paneChunksNumber}</strong>
              </p>
            ) : null}
          </div>
        </div>

        <div className="absolute top-3 right-3 z-10">
          <button
            type="button"
            className="btn ghost sm p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
            title="View Heatmap"
            onClick={(e) => {
              e.stopPropagation()
              setShowHeatmapPopupLearnerId(learnerId)
            }}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </button>
        </div>


        {paneAttempt ? (
          <>
            <div
              className={`observe-dock observe-dock-lg${reaction ? ` is-glowing is-${reaction.color}` : ''}`}
            >
              {paneProbeOpen ? (
                <div
                  className="observe-dock-probe"
                  role="group"
                  aria-label={`Resolve probe for ${user?.displayName ?? 'learner'}`}
                >
                  {PROBE_ACTIONS.map((action) => (
                    <button
                      key={action.outcome}
                      type="button"
                      className={`observe-dock-probe-btn ${action.className}`}
                      onClick={() => resolveProbeForLearner(learnerId, action.outcome)}
                      disabled={liveSaving}
                      aria-label={`${action.colorLabel} (${action.label}) probe`}
                    >
                      <span>{action.colorLabel} ({action.label})</span>
                      <kbd>{action.shortcuts.join(' / ')}</kbd>
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="observe-dock-colors"
                  role="group"
                  aria-label={`Result color for ${user?.displayName ?? 'learner'}`}
                >
                  {COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`observe-dock-color is-${c.key}${
                        paneFinalized && paneAttempt.snapshot.effectiveColor === c.key
                          ? ' is-selected'
                          : ''
                      }`}
                      onClick={() => recordColorForLearner(learnerId, c.key)}
                      disabled={liveSaving}
                      aria-label={c.label}
                    >
                      <span className="observe-dock-num">{c.label}</span>
                      <span className="observe-dock-label">Key {c.shortcut}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="observe-dock-tools observe-split-tools">
                <span className="observe-dock-q" aria-live="polite">
                  Q{learnerQuestionIndex + 1}/{Math.max(learnerQuestions.length, 1)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="observe-cta"
            disabled={liveSaving}
            onClick={() => {
              setActiveSplitLearnerId(learnerId)
              void advanceLearnerPane(capture, learnerId).then(setCapture)
            }}
          >
            <Plus className="h-5 w-5" aria-hidden />
            Start {user?.displayName ?? 'learner'}
          </button>
        )}
      </section>
    )
  }

  const stageHeroNode = (
    <div className="observe-stage-hero">
      <div className="observe-phone-avatar" aria-hidden={false}>
        <UserAvatar
          name={learner?.displayName ?? 'Learner'}
          avatarUrl={learner?.avatarUrl}
          size="md"
        />
      </div>
      <div className="observe-meta-row">
        {done > 0 ? (
          <>
            <ScreenTooltip
              ariaLabel={rfcTitle}
              width={290}
              content={
                <>
                  <span className="observe-tooltip-header">
                    <span>Struggle (RFC)</span>
                    <span className="font-mono text-amber-300 font-bold">{rfcPct}%</span>
                  </span>
                  <span className="observe-tooltip-divider" />
                  <span className="observe-tooltip-body">
                    <span className="observe-tooltip-row">
                      <span className="observe-tooltip-key">Formula:</span>
                      <span className="observe-tooltip-val font-mono text-[10px]">warm records / N_total</span>
                    </span>
                    <span className="observe-tooltip-row">
                      <span className="observe-tooltip-key">Warm steps:</span>
                      <span className="observe-tooltip-val">
                        {warmRecords} / {summary?.totalRecords ?? 0}{' '}
                        <span className="text-slate-400 font-normal">(Red + Orange + Yellow)</span>
                      </span>
                    </span>
                    <span className="observe-tooltip-note">
                      Lower RFC indicates less observed struggle.
                    </span>
                  </span>
                </>
              }
            >
              <span
                className="observe-learner-rfc is-rfc justify-between min-w-[5.25rem]"
                aria-label={rfcTitle}
              >
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" aria-hidden />
                  <span>RFC</span>
                </span>
                <span className="font-mono font-bold text-right ml-1.5">{rfcPct}%</span>
              </span>
            </ScreenTooltip>

            <ScreenTooltip
              ariaLabel={racTitle}
              width={310}
              content={
                <>
                  <span className="observe-tooltip-header">
                    <span>Awareness / Success (%c)</span>
                    <span className="font-mono text-emerald-300 font-bold">{racPct}%</span>
                  </span>
                  <span className="observe-tooltip-divider" />
                  <span className="observe-tooltip-body">
                    <span className="observe-tooltip-row">
                      <span className="observe-tooltip-key">Formula:</span>
                      <span className="observe-tooltip-val font-mono text-[10px]">Avg %x = sum(%x) / N_total</span>
                    </span>
                    <span className="observe-tooltip-row">
                      <span className="observe-tooltip-key">7-color weighted:</span>
                      <span className="observe-tooltip-val">
                        {sumPercentX.toFixed(1)}% / {summary?.totalRecords ?? 0} = {avgPercentX.toFixed(1)}%
                      </span>
                    </span>
                    <span className="observe-tooltip-row">
                      <span className="observe-tooltip-key">Legacy RAC:</span>
                      <span className="observe-tooltip-val">
                        {legacyRacPct}%{' '}
                        <span className="text-slate-400 font-normal">
                          ({summary ? summary.recordedByColor.green + summary.recordedByColor.blue + summary.recordedByColor.indigo + summary.recordedByColor.purple : 0}/{summary?.totalRecords ?? 0} cool records)
                        </span>
                      </span>
                    </span>
                    <span className="observe-tooltip-note">
                      Weights: Red 0%, Orange 17%, Yellow 34%, Green 50%, Blue 67%, Indigo 84%, Purple 100%.
                    </span>
                  </span>
                </>
              }
            >
              <span className="observe-learner-rfc is-percent-c justify-between min-w-[5.25rem]" aria-label={racTitle}>
                <span>%c</span>
                <span className="font-mono font-bold text-right ml-1.5">{racPct}%</span>
              </span>
            </ScreenTooltip>
          </>
        ) : (
          <span className="observe-meta-muted observe-phone-only observe-hint-phone">
            Tap a color
          </span>
        )}
        {done > 0 && summary ? (
          <span
            className="observe-heat-metric muted tabular observe-hide-phone"
            aria-label={`N_total: ${summary.totalRecords}`}
          >
            N_total {summary.totalRecords}/{Math.max(summary.total + summary.probeRecords, 1)}
            {summary.maxProbeDepth > 0 ? ` · max chunks=${summary.maxProbeDepth}` : ''}
          </span>
        ) : null}
      </div>
      {probeOpen ? (
        <p className="observe-depth-inline" title="Chunks Number starts at 1 when Green opens probe; each Continue adds 1.">
          CHUNKS NUMBER <strong>{chunksNumber}</strong>
        </p>
      ) : null}
      {isLiveTest ? (
        <div className="mt-3 rounded-2xl border border-indigo-300/20 bg-indigo-950/25 px-4 py-3 text-center shadow-lg shadow-indigo-950/20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-200/80">
            {liveTestBlockSummary ?? 'Live Test'} · {liveTestLanguage.toUpperCase()}
          </p>
          <p className="mt-1 text-sm font-black text-white">
            Number {String(qNum).padStart(2, '0')}
          </p>
          <p className="mt-1 text-base font-semibold text-indigo-50">
            {currentLiveTestPrompt ?? 'Prompt pending'}
          </p>
          {currentLiveTestItem ? (
            <p className="mt-1 text-xs text-indigo-100/80">
              CCI {currentLiveTestItem.cciValue == null ? '—' : `${currentLiveTestItem.cciValue}A`} · CVR {currentLiveTestItem.cvrValue == null ? '—' : `${currentLiveTestItem.cvrValue} Ω`} · CPD {currentLiveTestItem.cpdValue == null ? '—' : `${currentLiveTestItem.cpdValue}V`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <div
      className={`observe-root${reaction ? ` is-react-${reaction.kind} is-react-${reaction.color}` : ''}${
        isPhone ? ' is-phone' : ''
      }${mapOpen ? ' is-map-open' : ''}${showHeader ? '' : ' is-header-hidden'}`}
      role="application"
      aria-label={`${dayLabel} · Focus and Awareness observation`}
    >
      <header className={`observe-bar observe-bar-slim${showHeader ? '' : ' is-hidden'}`}>
        <Link to={exitPath} className="observe-nav-exit" aria-label="Exit observe">
          <X aria-hidden strokeWidth={2.5} />
        </Link>
        <div className="observe-bar-center">
          <span className="observe-day-badge" title={dayLabel}>
            {targetDayNumber ? `Day ${targetDayNumber}` : 'Day —'}
          </span>
          {qTotal > 0 ? (
            <>
              <span className="observe-sep">·</span>
              <span className="observe-mode">
                Q{qNum}
                <span className="observe-meta-muted">/{qTotal}</span>
              </span>
            </>
          ) : null}
          <span className="observe-sep observe-hide-phone">·</span>
          <span className="observe-class observe-hide-phone">{classRow?.name ?? 'Class'}</span>
        </div>
        <div className="observe-nav-group" role="toolbar" aria-label="Observe tools">
          {capture.questions.length > 0 ? (
            <button
              type="button"
              className={`observe-nav-btn${mapOpen ? ' is-active' : ''}`}
              onClick={() => setMapOpen((v) => !v)}
              aria-pressed={mapOpen}
              aria-label={mapOpen ? 'Hide question map' : 'Show question map'}
              title="Map (H)"
            >
              {/* Grid = question map (clearer than panel icons on phone) */}
              <LayoutGrid aria-hidden strokeWidth={2.25} />
            </button>
          ) : null}
          <button
            type="button"
            className={`observe-nav-btn observe-hide-phone${showKeys ? ' is-active' : ''}`}
            onClick={() => setShowKeys((v) => !v)}
            aria-pressed={showKeys}
            aria-label="Keyboard shortcuts"
            title="Keys (?)"
          >
            <Keyboard aria-hidden strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <button
        type="button"
        className="observe-nav-btn observe-header-toggle"
        onClick={() => setShowHeader((value) => !value)}
        aria-pressed={showHeader}
        aria-label={showHeader ? 'Hide observe header' : 'Show observe header'}
        title={showHeader ? 'Hide header' : 'Show header'}
      >
        {showHeader ? (
          <ChevronUp aria-hidden strokeWidth={2.25} />
        ) : (
          <ChevronDown aria-hidden strokeWidth={2.25} />
        )}
      </button>

      <button
        type="button"
        className="observe-finish-fab"
        onClick={() => void finishSessionAndSave()}
        disabled={finishing}
        aria-label="Finish session and save"
        title="Finish & save (F)"
      >
        <CheckCircle2 aria-hidden strokeWidth={2.25} />
        <span>{finishButtonLabel}</span>
      </button>

      {/* Desktop left rail (resizable). Phone uses bottom map sheet instead. */}
      {capture.questions.length > 0 && !isPhone && !splitMode ? (
        <aside
          className={`observe-rail ${mapOpen ? 'is-open' : 'is-closed'} ${railSizeClass}${
            resizing ? ' is-resizing' : ''
          }`}
          style={
            {
              ['--observe-rail-w']: mapOpen ? `${railWidth}px` : `${RAIL_COLLAPSED}px`,
            } as CSSProperties
          }
          aria-label="Learner and progress map"
        >
          <div className="observe-rail-person">
            <UserAvatar
              name={learner?.displayName ?? 'Learner'}
              avatarUrl={learner?.avatarUrl}
              size={avatarSize}
              className="observe-rail-avatar"
            />
            {mapOpen ? (
              <>
                <p className="observe-rail-name">{learner?.displayName ?? 'Learner'}</p>
                {probeOpen ? (
                  <p className="observe-rail-n" title="Chunks Number starts at 1 when Green opens probe">
                    chunks={chunksNumber}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {mapOpen ? (
            <div className="observe-rail-map">
              <ObserveHeatmap
                capture={capture}
                currentQuestionIndex={capture.position.questionIndex}
                learnerName={learnerName}
                onSelectQuestion={selectQuestion}
                layout="column"
              >
                {stageHeroNode}
              </ObserveHeatmap>
            </div>
          ) : (
            <button
              type="button"
              className="observe-rail-peek"
              onClick={() => setMapOpen(true)}
              aria-label="Expand sidebar"
              title="Expand"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            </button>
          )}

          {mapOpen ? (
            <div className="observe-rail-footer">
              <button
                type="button"
                className="observe-rail-collapse"
                onClick={() => setMapOpen(false)}
                aria-label="Collapse sidebar"
                title="Collapse"
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              </button>
            </div>
          ) : null}

          {mapOpen ? (
            <div
              className="observe-rail-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-valuemin={RAIL_MIN}
              aria-valuemax={RAIL_MAX}
              aria-valuenow={Math.round(railWidth)}
              tabIndex={0}
              onPointerDown={startRailResize}
              onDoubleClick={() => {
                setRailWidth(RAIL_DEFAULT)
                try {
                  window.localStorage.setItem(RAIL_W_KEY, String(RAIL_DEFAULT))
                } catch {
                  /* ignore */
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  setRailWidth((w) => {
                    const next = Math.max(RAIL_MIN, w - 16)
                    try {
                      window.localStorage.setItem(RAIL_W_KEY, String(next))
                    } catch {
                      /* ignore */
                    }
                    return next
                  })
                }
                if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  setRailWidth((w) => {
                    const next = Math.min(RAIL_MAX, w + 16)
                    try {
                      window.localStorage.setItem(RAIL_W_KEY, String(next))
                    } catch {
                      /* ignore */
                    }
                    return next
                  })
                }
              }}
            >
              <GripVertical className="observe-rail-resize-grip" aria-hidden strokeWidth={1.5} />
            </div>
          ) : null}
        </aside>
      ) : null}

      {/* Center: name + fixed color dock (phone-first stack) */}
      <main className="observe-stage observe-stage-tight">
        {splitMode && capture.questions.length > 0 ? (
          <div className="observe-split">
            {capture.learnerIds.map(renderLearnerPane)}
          </div>
        ) : capture.questions.length === 0 ? (
          <div className="observe-empty">
            <p className="observe-day-empty">{dayLabel}</p>
            <p className="observe-empty-title">Observe</p>
            <button type="button" className="observe-cta" onClick={startFirst}>
              <Plus className="h-5 w-5" aria-hidden />
              Start
            </button>
          </div>
        ) : (
          <>
            {(!mapOpen || isPhone) ? stageHeroNode : null}

            {reaction && reaction.kind === 'happy' ? (
              <div key={reaction.id} className="observe-react observe-react-happy" aria-hidden>
                <span className="observe-react-symbol">
                  <Check aria-hidden />
                </span>
                <span className="observe-react-label">Tập trung tốt!</span>
                <Sparkles className="observe-react-sparkles" aria-hidden />
                <span className="observe-react-burst" />
              </div>
            ) : null}

            <div
              className={`observe-dock observe-dock-lg${reaction ? ` is-glowing is-${reaction.color}` : ''}`}
            >
              {probeOpen ? (
                <div className="observe-dock-probe" role="group" aria-label="Resolve probe">
                  <p className="live-test-probe-depth observe-depth-inline">
                    CHUNKS NUMBER <strong>{chunksNumber}</strong>
                  </p>
                  {PROBE_ACTIONS.map((action) => (
                    <button
                      key={action.outcome}
                      type="button"
                      className={`observe-dock-probe-btn ${action.className}`}
                      onClick={() => resolveProbe(action.outcome)}
                      disabled={liveSaving}
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
                    <button
                      key={c.key}
                      type="button"
                      className={`observe-dock-color is-${c.key}${
                        isFinalized && attempt?.snapshot.effectiveColor === c.key
                          ? ' is-selected'
                          : ''
                      }`}
                      onClick={() => recordColor(c.key)}
                      disabled={!attempt || liveSaving}
                      aria-label={c.label}
                    >
                      <span className="observe-dock-num">{c.label}</span>
                      <span className="observe-dock-label">Key {c.shortcut}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="observe-dock-tools">
                <button
                  type="button"
                  className="observe-tool"
                  onClick={prevCell}
                  disabled={capture.position.questionIndex <= 0}
                  aria-label="Previous question"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                  <span className="observe-tool-text">Prev</span>
                </button>
                <span className="observe-dock-q" aria-live="polite">
                  Q{qNum}/{qTotal}
                </span>
                <button
                  type="button"
                  className="observe-tool"
                  onClick={nextCell}
                  disabled={capture.position.questionIndex >= capture.questions.length - 1}
                  aria-label="Next question"
                >
                  <span className="observe-tool-text">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Phone: question map as bottom sheet (not a side rail) */}
      {isPhone && mapOpen && capture.questions.length > 0 ? (
        <>
          <button
            type="button"
            className="observe-sheet-backdrop"
            aria-label="Close map"
            onClick={() => setMapOpen(false)}
          />
          <div className="observe-map-sheet" role="dialog" aria-label="Question map">
            <div className="observe-map-sheet-handle" aria-hidden />
            <div className="observe-map-sheet-head">
              <span className="observe-map-sheet-title">Questions</span>
              <button
                type="button"
                className="observe-nav-btn"
                onClick={() => setMapOpen(false)}
                aria-label="Close map"
              >
                <X aria-hidden strokeWidth={2.5} />
              </button>
            </div>
            <ObserveHeatmap
              capture={capture}
              currentQuestionIndex={capture.position.questionIndex}
              learnerName={learnerName}
              onSelectQuestion={(i) => {
                selectQuestion(i)
                setMapOpen(false)
              }}
              layout="column"
            />
          </div>
        </>
      ) : null}

      {showKeys && !isPhone && (
        <div className="observe-keys-panel" role="dialog" aria-label="Keyboard shortcuts">
          <div className="observe-keys-header">
            <h3 className="observe-keys-title">Keyboard Commands</h3>
            <button
              type="button"
              className="observe-keys-close"
              onClick={() => setShowKeys(false)}
              aria-label="Close shortcuts"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="observe-keys-grid">
            <div className="observe-keys-group">
              <span className="observe-keys-group-title">Assessment</span>
              <div className="observe-key-row">
                <span>
                  <kbd>0</kbd>–<kbd>3</kbd> Assess Color
                </span>
              </div>
              <div className="observe-key-row">
                <span>
                  <kbd>F</kbd>/<kbd>C</kbd>/<kbd>D</kbd> Fail / Continue / Done
                </span>
              </div>
            </div>
            <div className="observe-keys-group">
              <span className="observe-keys-group-title">Navigation</span>
              <div className="observe-key-row">
                <span>
                  <kbd>←</kbd> / <kbd>→</kbd> Prev / Next
                </span>
              </div>
              <div className="observe-key-row">
                <span>
                  <kbd>H</kbd> / <kbd>M</kbd> Toggle Map
                </span>
              </div>
              <div className="observe-key-row">
                <span>
                  <kbd>Esc</kbd> Exit Observe
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="observe-toast" role="status">
          {toast}
        </div>
      )}

      {showHeatmapPopupLearnerId && (
        <div className="observe-modal-container" style={{ zIndex: 100 }}>
          <div className="observe-modal-backdrop" aria-hidden="true" onClick={() => setShowHeatmapPopupLearnerId(null)} />
          <div
            className="observe-modal-card"
            style={{ maxWidth: '500px', width: '100%' }}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 className="text-lg font-bold text-white flex items-center gap-2 m-0">
                <LayoutGrid className="h-5 w-5 text-indigo-400" />
                Heatmap: {
                  roster.users.find(u => u.id === showHeatmapPopupLearnerId)?.displayName ?? 'Learner'
                }
              </h3>
              <button
                type="button"
                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/5 transition border-0 bg-transparent cursor-pointer"
                onClick={() => setShowHeatmapPopupLearnerId(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-2 overflow-y-auto hide-scrollbar" style={{ maxHeight: '60vh' }}>
              {(() => {
                const learnerId = showHeatmapPopupLearnerId
                const learnerQuestions = capture.questions.filter((q) => q.assignedLearnerUserId === learnerId)
                const learnerQuestionIds = new Set(learnerQuestions.map((q) => q.id))
                const paneAttempt = currentAttemptForLearner(capture, learnerId)
                const learnerQuestionIndex = paneAttempt
                  ? Math.max(
                      0,
                      learnerQuestions.findIndex((q) => q.id === paneAttempt.sessionQuestionId),
                    )
                  : 0
                const learnerCapture: CaptureSessionState = {
                  ...capture,
                  learnerIds: [learnerId],
                  questions: learnerQuestions,
                  attempts: capture.attempts.filter((a) => learnerQuestionIds.has(a.sessionQuestionId)),
                  position: {
                    ...capture.position,
                    questionIndex: learnerQuestionIndex,
                    learnerIndex: 0,
                  },
                }
                return (
                  <ObserveHeatmap
                    capture={learnerCapture}
                    currentQuestionIndex={learnerQuestionIndex}
                    learnerName={learnerName}
                    onSelectQuestion={(i) => {
                      const q = learnerQuestions[i]
                      if (!q) return
                      const originalIndex = capture.questions.findIndex((x) => x.id === q.id)
                      setActiveSplitLearnerId(learnerId)
                      setCapture(jumpToQuestion(capture, originalIndex))
                      setShowHeatmapPopupLearnerId(null)
                    }}
                    layout="row"
                  />
                )
              })()}
            </div>
            <div className="flex justify-end mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                className="btn secondary px-4 py-2"
                onClick={() => setShowHeatmapPopupLearnerId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {finishSummary && (
        <div className="observe-modal-container">
          <div className="observe-modal-backdrop" aria-hidden="true" />
          <div
            className="observe-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-finish-summary-title"
          >
            <div className="observe-modal-icon">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <h2 id="modal-finish-summary-title" className="observe-modal-title">
              Session Summary
            </h2>
            <p className="observe-modal-desc">
              Review this session summary. Save & Finish will close this day permanently, then the
              next visit starts a new day.
            </p>
            {finishMetrics && (
              <div className="w-full flex flex-col gap-4 text-left my-4 bg-slate-900/50 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-sm font-semibold text-slate-200">{finishMetrics.dayLabel}</span>
                  <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold uppercase">{finishMetrics.className}</span>
                </div>
                
                {/* 3 KPIs */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-white/5">
                    <p className="text-[10px] text-slate-400 uppercase font-medium">Learners</p>
                    <p className="text-lg font-bold text-white mt-0.5">{finishMetrics.learnerCount}</p>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-white/5">
                    <p className="text-[10px] text-slate-400 uppercase font-medium">Questions</p>
                    <p className="text-lg font-bold text-white mt-0.5">{finishMetrics.questionCount}</p>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-white/5">
                    <p className="text-[10px] text-slate-400 uppercase font-medium">Finalized</p>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">{finishMetrics.done}/{finishMetrics.total}</p>
                  </div>
                </div>

                {/* Color distribution bar */}
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-1.5">Recorded 7-color distribution</p>
                  <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden flex">
                    {SPECTRUM_COLORS.map((color) =>
                      finishMetrics.recordedByColor[color] > 0 ? (
                        <div
                          key={color}
                          className={`h-full ${SPECTRUM_BG[color]}`}
                          style={{ width: `${(finishMetrics.recordedByColor[color] / Math.max(finishMetrics.totalRecords, 1)) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2.5 text-center text-[10px]">
                    {SPECTRUM_COLORS.map((color) => (
                      <div key={color} className={`${SPECTRUM_PILL[color]} border py-1 rounded font-bold`}>
                        {SPECTRUM_LABEL[color]}: {finishMetrics.recordedByColor[color]}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5">
                  <span className="text-slate-400">N_total:</span>
                  <span className="font-mono font-bold text-white">{finishMetrics.totalRecords}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5">
                  <span className="text-slate-400">Max chunks number:</span>
                  <span className="font-mono font-bold text-white">{finishMetrics.maxProbeDepth}</span>
                </div>

                {/* Unresolved / status info */}
                <div className="mt-1">
                  {finishMetrics.unresolved > 0 ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg p-2 text-[11px] font-medium">
                      ⚠️ Left unfinalized when session closed: {finishMetrics.unresolved}
                    </div>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg p-2 text-[11px] font-medium text-center">
                      ✓ All captured attempts finalized.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="observe-modal-actions">
              <button
                type="button"
                className="observe-modal-btn observe-modal-cancel"
                onClick={() => setFinishSummary(null)}
                disabled={finishing}
              >
                Review More
              </button>
              <button
                type="button"
                className="observe-modal-btn observe-modal-confirm"
                onClick={() => void handleConfirmFinish()}
                disabled={finishing}
              >
                {confirmFinishLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
