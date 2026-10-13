export type SpectrumColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'purple'

export type ResultColor = SpectrumColor

export type ProvisionalColor = 'red' | 'orange' | 'green' | 'purple'

export type ProbeOutcome = 'fail' | 'continue' | 'done'

export type AttemptStatus =
  | 'draft'
  | 'probe_open'
  | 'resolution_required'
  | 'finalized'
  | 'corrected'

export type AssessmentEventType =
  | 'assessment_created'
  | 'provisional_recorded'
  | 'probe_failed'
  | 'probe_continued'
  | 'probe_completed'
  | 'result_finalized'
  | 'result_corrected'

export type AssessmentSnapshot = {
  status: AttemptStatus
  provisionalColor: ProvisionalColor | null
  effectiveColor: ResultColor | null
  effectiveScore: number | null
  probeCount: number
  maxProbeCount: number
  enteredProbeFlow: boolean
  finalizedAt: string | null
}

export type LifecycleCommand =
  | { type: 'record_provisional'; color: ProvisionalColor; at: string }
  | { type: 'resolve_probe'; outcome: ProbeOutcome; at: string }
  | { type: 'correct'; color: ResultColor; reason: string; at: string; actorId: string }

export type LifecycleResult =
  | { ok: true; snapshot: AssessmentSnapshot; events: AssessmentEventType[] }
  | { ok: false; error: string }

export const SPECTRUM_COLORS: readonly SpectrumColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'purple',
] as const

export const PRIMARY_CAPTURE_COLORS: readonly ProvisionalColor[] = [
  'red',
  'orange',
  'green',
  'purple',
] as const

export const WARM_COLORS: readonly SpectrumColor[] = ['red', 'orange', 'yellow']
export const COOL_COLORS: readonly SpectrumColor[] = [
  'green',
  'blue',
  'indigo',
  'purple',
]

/** Normalized CPD color factors across the 7-color spectrum. */
export const COLOR_SCORE: Record<ResultColor, number> = {
  red: 0,
  orange: 0.17,
  yellow: 0.33,
  green: 0.5,
  blue: 0.67,
  indigo: 0.83,
  purple: 1,
}

/**
 * Historical field kept for storage/compat. Probe continue is unlimited in UI/domain;
 * depth is tracked only via probeCount ("n").
 */
export const DEFAULT_MAX_PROBE_COUNT = 99
