export type ReportWindowKind = 'session' | 'week' | 'month' | 'custom' | 'course'

export type ReportWindow = {
  kind: ReportWindowKind
  /** Inclusive start (ISO datetime) */
  start: string
  /** Exclusive end (ISO datetime) — half-open interval [start, end) */
  end: string
  label: string
  /** Optional session filter when kind === 'session' */
  learningSessionId?: string
}

export type ResolveWindowInput =
  | { kind: 'course'; courseStart: string; courseEnd?: string | null; now?: string }
  | { kind: 'session'; learningSessionId: string; sessionStartedAt: string; sessionEndedAt?: string | null }
  | { kind: 'week'; anchor: string }
  | { kind: 'month'; anchor: string }
  | { kind: 'custom'; start: string; end: string }

function parse(iso: string): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`)
  return d
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Resolve a Report Window. Custom windows require end > start.
 */
export function resolveReportWindow(input: ResolveWindowInput): ReportWindow {
  switch (input.kind) {
    case 'course': {
      const start = parse(input.courseStart).toISOString()
      const end = input.courseEnd
        ? parse(input.courseEnd).toISOString()
        : (input.now ?? new Date().toISOString())
      if (parse(end) <= parse(start)) {
        // still return a valid tiny window to avoid crash; callers may show empty
        return {
          kind: 'course',
          start,
          end: new Date(parse(start).getTime() + 1).toISOString(),
          label: 'Course overall',
        }
      }
      return { kind: 'course', start, end, label: 'Course overall' }
    }
    case 'session': {
      const start = parse(input.sessionStartedAt).toISOString()
      const end = input.sessionEndedAt
        ? parse(input.sessionEndedAt).toISOString()
        : new Date().toISOString()
      return {
        kind: 'session',
        start,
        end: parse(end) > parse(start) ? end : new Date(parse(start).getTime() + 1).toISOString(),
        label: 'Session',
        learningSessionId: input.learningSessionId,
      }
    }
    case 'week': {
      const anchor = startOfUtcDay(parse(input.anchor))
      // ISO-ish week: Monday start
      const day = anchor.getUTCDay() // 0 Sun
      const diffToMon = day === 0 ? -6 : 1 - day
      const start = new Date(anchor)
      start.setUTCDate(anchor.getUTCDate() + diffToMon)
      const end = new Date(start)
      end.setUTCDate(start.getUTCDate() + 7)
      return {
        kind: 'week',
        start: start.toISOString(),
        end: end.toISOString(),
        label: `Week of ${start.toISOString().slice(0, 10)}`,
      }
    }
    case 'month': {
      const anchor = parse(input.anchor)
      const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))
      const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1))
      return {
        kind: 'month',
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      }
    }
    case 'custom': {
      const start = parse(input.start)
      const end = parse(input.end)
      if (end <= start) {
        throw new Error('Custom Report Window requires end after start')
      }
      return {
        kind: 'custom',
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
      }
    }
    default: {
      const _e: never = input
      throw new Error(`Unknown window: ${JSON.stringify(_e)}`)
    }
  }
}

/**
 * Immediately preceding equal-duration window (same length, ends at current.start).
 */
export function precedingEqualDurationWindow(window: ReportWindow): ReportWindow {
  const startMs = parse(window.start).getTime()
  const endMs = parse(window.end).getTime()
  const duration = endMs - startMs
  const prevEnd = new Date(startMs)
  const prevStart = new Date(startMs - duration)
  return {
    kind: window.kind,
    start: prevStart.toISOString(),
    end: prevEnd.toISOString(),
    label: `Prior equal window`,
    learningSessionId: undefined,
  }
}

export function isInWindow(isoTimestamp: string, window: ReportWindow): boolean {
  const t = parse(isoTimestamp).getTime()
  return t >= parse(window.start).getTime() && t < parse(window.end).getTime()
}
