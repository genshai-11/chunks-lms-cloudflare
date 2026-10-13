import { COLOR_SCORE, COOL_COLORS, WARM_COLORS, type ResultColor } from '../result-lifecycle/types'

export type MetricKey =
  | 'rfc'
  | 'rac'
  | 'average_performance'
  | 'purple_mastery_rate'
  | 'clarification_rate'
  | 'clarification_depth'
  | 'n_count'
  | 'n_depth_max'
  | 'n_depth_avg'
  | 'awareness_recovery'
  | 'focus_stability'

export type MetricStatus = 'operational' | 'experimental'

export type FinalizedAttempt = {
  effectiveColor: ResultColor
  enteredProbeFlow: boolean
  probeEventCount: number
  /** Ordered score history for focus stability (learner-adjacent). */
  learnerId?: string
  sequenceIndex?: number
}

export const COLOR_PERCENT_X: Record<ResultColor, number> = {
  red: 0,
  orange: 0.17,
  yellow: 0.34,
  green: 0.5,
  blue: 0.67,
  indigo: 0.84,
  purple: 1,
}

export const COLOR_PERCENT_X_VALUES: Record<ResultColor, number> = {
  red: 0,
  orange: 17,
  yellow: 34,
  green: 50,
  blue: 67,
  indigo: 84,
  purple: 100,
}

/**
 * Maps an Avg %x value [0, 100] to its nearest representative Spectrum Color band.
 * Thresholds represent the midpoints between adjacent color benchmarks:
 * - Red (0%): [0, 8.5)
 * - Orange (17%): [8.5, 25.5)
 * - Yellow (34%): [25.5, 42.0)
 * - Green (50%): [42.0, 58.5)
 * - Blue (67%): [58.5, 75.5)
 * - Indigo (84%): [75.5, 92.0)
 * - Purple (100%): [92.0, 100]
 */
export function colorForAvgPercentX(avgPercentX: number | null | undefined): ResultColor {
  if (avgPercentX == null || Number.isNaN(avgPercentX)) return 'red'
  if (avgPercentX < 8.5) return 'red'
  if (avgPercentX < 25.5) return 'orange'
  if (avgPercentX < 42.0) return 'yellow'
  if (avgPercentX < 58.5) return 'green'
  if (avgPercentX < 75.5) return 'blue'
  if (avgPercentX < 92.0) return 'indigo'
  return 'purple'
}


export type SpectrumStepBreakdown = {
  byColor: Record<ResultColor, number>
  primaryRecords: number
  probeRecords: number
  totalRecords: number
  warmSteps: number
  coolSteps: number
  rfc: number | null
  rac: number | null
  sumPercentX: number
  avgPercentX: number | null
}

export type MetricObservation = {
  key: MetricKey
  value: number | null
  sampleSize: number
  unit: 'ratio' | 'score' | 'count'
  direction: 'higher_better' | 'lower_better' | 'contextual'
  status: MetricStatus
  definition: string
}

export type MetricCatalogEntry = {
  key: MetricKey
  version: string
  status: MetricStatus
  definition: string
  direction: MetricObservation['direction']
  unit: MetricObservation['unit']
  minSample: number
}

export const METRIC_CATALOG: MetricCatalogEntry[] = [
  {
    key: 'rfc',
    version: '1.0.0',
    status: 'operational',
    definition: 'warm spectrum steps / N_total',
    direction: 'lower_better',
    unit: 'ratio',
    minSample: 1,
  },
  {
    key: 'rac',
    version: '1.0.0',
    status: 'operational',
    definition: 'Package main %c value: mean normalized 7-color spectrum factor over N_total (Avg %x)',
    direction: 'higher_better',
    unit: 'ratio',
    minSample: 1,
  },
  {
    key: 'average_performance',
    version: '1.0.0',
    status: 'operational',
    definition: 'mean normalized spectrum factor 0..1 over finalized sample',
    direction: 'higher_better',
    unit: 'score',
    minSample: 1,
  },
  {
    key: 'purple_mastery_rate',
    version: '1.0.0',
    status: 'operational',
    definition: 'Purple / finalized sample',
    direction: 'higher_better',
    unit: 'ratio',
    minSample: 1,
  },
  {
    key: 'clarification_rate',
    version: '1.0.0',
    status: 'operational',
    definition: 'attempts entering probe flow / finalized sample',
    direction: 'contextual',
    unit: 'ratio',
    minSample: 1,
  },
  {
    key: 'clarification_depth',
    version: '1.0.0',
    status: 'experimental',
    definition: 'chunks number / probed attempts (legacy alias of avg chunks number)',
    direction: 'contextual',
    unit: 'score',
    minSample: 1,
  },
  {
    key: 'n_count',
    version: '1.0.0',
    status: 'operational',
    definition: 'count of finalized attempts where teacher selected Green (2) / entered probe',
    direction: 'contextual',
    unit: 'count',
    minSample: 1,
  },
  {
    key: 'n_depth_max',
    version: '1.0.0',
    status: 'operational',
    definition: 'max chunks number among probed attempts (not session maxProbeCount)',
    direction: 'contextual',
    unit: 'count',
    minSample: 1,
  },
  {
    key: 'n_depth_avg',
    version: '1.0.0',
    status: 'operational',
    definition: 'mean chunks number among probed attempts',
    direction: 'contextual',
    unit: 'score',
    minSample: 1,
  },
  {
    key: 'awareness_recovery',
    version: '1.0.0',
    status: 'experimental',
    definition: 'probed attempts ending Green or Purple / probed attempts',
    direction: 'higher_better',
    unit: 'ratio',
    minSample: 1,
  },
  {
    key: 'focus_stability',
    version: '1.0.0',
    status: 'experimental',
    definition: 'normalized inverse of adjacent score movement per learner',
    direction: 'contextual',
    unit: 'score',
    minSample: 2,
  },
]

function ratio(num: number, den: number): number | null {
  if (den === 0) return null
  return num / den
}

function emptySpectrumCounts(): Record<ResultColor, number> {
  return {
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    indigo: 0,
    purple: 0,
  }
}

export function calculateSpectrumStepBreakdown(
  finalized: FinalizedAttempt[],
): SpectrumStepBreakdown {
  const byColor = emptySpectrumCounts()
  let primaryRecords = 0
  let probeRecords = 0

  for (const attempt of finalized) {
    primaryRecords += 1
    if (attempt.enteredProbeFlow) {
      byColor.green += 1
      const probeCount = Math.max(0, attempt.probeEventCount)
      if (attempt.effectiveColor === 'yellow') {
        byColor.yellow += 1
        byColor.blue += probeCount
        probeRecords += probeCount + 1
      } else if (attempt.effectiveColor === 'indigo') {
        byColor.indigo += 1
        byColor.blue += Math.max(0, probeCount - 1)
        probeRecords += probeCount
      } else {
        byColor.blue += probeCount
        probeRecords += probeCount
      }
    } else {
      byColor[attempt.effectiveColor] += 1
    }
  }

  const totalRecords = primaryRecords + probeRecords
  const warmSteps = WARM_COLORS.reduce((sum, color) => sum + byColor[color], 0)
  const coolSteps = COOL_COLORS.reduce((sum, color) => sum + byColor[color], 0)
  const sumPercentX = (Object.keys(byColor) as ResultColor[]).reduce(
    (sum, color) => sum + byColor[color] * COLOR_PERCENT_X_VALUES[color],
    0,
  )
  const avgPercentX = totalRecords > 0 ? sumPercentX / totalRecords : null
  return {
    byColor,
    primaryRecords,
    probeRecords,
    totalRecords,
    warmSteps,
    coolSteps,
    rfc: ratio(warmSteps, totalRecords),
    rac: ratio(coolSteps, totalRecords),
    sumPercentX,
    avgPercentX,
  }
}

export function spectrumRecordsForAttempt(attempt: FinalizedAttempt): ResultColor[] {
  if (!attempt.enteredProbeFlow) return [attempt.effectiveColor]

  const probeCount = Math.max(0, attempt.probeEventCount)
  const records: ResultColor[] = ['green']
  if (attempt.effectiveColor === 'yellow') {
    records.push(...Array.from({ length: probeCount }, () => 'blue' as const))
    records.push('yellow')
  } else if (attempt.effectiveColor === 'indigo') {
    records.push(...Array.from({ length: Math.max(0, probeCount - 1) }, () => 'blue' as const))
    records.push('indigo')
  } else {
    records.push(...Array.from({ length: probeCount }, () => 'blue' as const))
  }
  return records
}

function observation(
  key: MetricKey,
  value: number | null,
  sampleSize: number,
): MetricObservation {
  const meta = METRIC_CATALOG.find((m) => m.key === key)!
  const belowMin = sampleSize < meta.minSample
  return {
    key,
    value: belowMin ? null : value,
    sampleSize,
    unit: meta.unit,
    direction: meta.direction,
    status: meta.status,
    definition: meta.definition,
  }
}

export function calculateMetrics(finalized: FinalizedAttempt[]): MetricObservation[] {
  const n = finalized.length
  const spectrum = calculateSpectrumStepBreakdown(finalized)
  const purple = finalized.filter((a) => a.effectiveColor === 'purple').length
  const scoreSum = finalized.reduce((s, a) => s + COLOR_SCORE[a.effectiveColor], 0)
  const probed = finalized.filter((a) => a.enteredProbeFlow)
  const chunksNumbers = probed.map((a) => Math.max(1, a.probeEventCount + 1))
  const chunksNumberTotal = chunksNumbers.reduce((s, value) => s + value, 0)
  const probeDepthMax = probed.length === 0 ? null : Math.max(...chunksNumbers)
  const probeDepthAvg = probed.length === 0 ? null : chunksNumberTotal / probed.length
  const recovered = probed.filter(
    (a) => a.effectiveColor === 'indigo' || a.effectiveColor === 'purple',
  ).length

  const rfc = observation('rfc', spectrum.rfc, spectrum.totalRecords)
  const rac = observation(
    'rac',
    spectrum.avgPercentX == null ? null : spectrum.avgPercentX / 100,
    spectrum.totalRecords,
  )
  const avg = observation('average_performance', n === 0 ? null : scoreSum / n, n)
  const purpleRate = observation('purple_mastery_rate', ratio(purple, n), n)
  // Clarification rate: 0 when finalized sample > 0 and none probed; null when sample = 0
  const clarRate = observation('clarification_rate', n === 0 ? null : probed.length / n, n)
  const clarDepth = observation('clarification_depth', probeDepthAvg, probed.length)
  const nCount = observation('n_count', n === 0 ? null : probed.length, n)
  const nDepthMax = observation('n_depth_max', probeDepthMax, probed.length)
  const nDepthAvg = observation('n_depth_avg', probeDepthAvg, probed.length)
  const awareness = observation(
    'awareness_recovery',
    probed.length === 0 ? null : recovered / probed.length,
    probed.length,
  )
  const stability = observation('focus_stability', focusStability(finalized), n)

  return [
    rfc,
    rac,
    avg,
    purpleRate,
    clarRate,
    clarDepth,
    nCount,
    nDepthMax,
    nDepthAvg,
    awareness,
    stability,
  ]
}

/**
 * Normalized inverse of mean adjacent absolute score deltas across learners.
 * Returns null if fewer than two observations overall.
 */
function focusStability(finalized: FinalizedAttempt[]): number | null {
  if (finalized.length < 2) return null

  const byLearner = new Map<string, number[]>()
  for (const a of finalized) {
    const id = a.learnerId ?? '_all'
    const list = byLearner.get(id) ?? []
    list.push(COLOR_SCORE[a.effectiveColor])
    byLearner.set(id, list)
  }

  const deltas: number[] = []
  for (const scores of byLearner.values()) {
    if (scores.length < 2) continue
    for (let i = 1; i < scores.length; i++) {
      deltas.push(Math.abs(scores[i]! - scores[i - 1]!))
    }
  }
  if (deltas.length === 0) return null

  const meanDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length
  // max adjacent move is 3 (0↔3); stability in [0,1]
  return 1 - meanDelta / 3
}

export type WindowComparison = {
  current: MetricObservation[]
  previous: MetricObservation[] | null
  /** Percentage-point deltas for ratio metrics; null if either side null. */
  deltas: Partial<Record<MetricKey, number | null>>
}

export function compareEqualDurationWindows(
  currentFinalized: FinalizedAttempt[],
  previousFinalized: FinalizedAttempt[] | null,
): WindowComparison {
  const current = calculateMetrics(currentFinalized)
  if (previousFinalized === null) {
    return { current, previous: null, deltas: {} }
  }
  const previous = calculateMetrics(previousFinalized)
  const deltas: WindowComparison['deltas'] = {}
  for (const c of current) {
    const p = previous.find((x) => x.key === c.key)
    if (!p || c.value === null || p.value === null) {
      deltas[c.key] = null
    } else if (c.unit === 'ratio') {
      // percentage-point change
      deltas[c.key] = (c.value - p.value) * 100
    } else {
      deltas[c.key] = c.value - p.value
    }
  }
  return { current, previous, deltas }
}
