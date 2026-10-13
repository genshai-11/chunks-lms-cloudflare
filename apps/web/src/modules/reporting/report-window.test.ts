import { describe, expect, it } from 'vitest'
import {
  isInWindow,
  precedingEqualDurationWindow,
  resolveReportWindow,
} from './report-window'

describe('report windows', () => {
  it('resolves week and month windows', () => {
    // 2026-07-15 is Wednesday
    const week = resolveReportWindow({ kind: 'week', anchor: '2026-07-15T12:00:00.000Z' })
    expect(week.start.startsWith('2026-07-13')).toBe(true) // Monday
    expect(week.end.startsWith('2026-07-20')).toBe(true)

    const month = resolveReportWindow({ kind: 'month', anchor: '2026-07-15T12:00:00.000Z' })
    expect(month.start).toBe('2026-07-01T00:00:00.000Z')
    expect(month.end).toBe('2026-08-01T00:00:00.000Z')
  })

  it('requires custom end after start', () => {
    expect(() =>
      resolveReportWindow({
        kind: 'custom',
        start: '2026-07-10T00:00:00.000Z',
        end: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow(/end after start/i)

    const w = resolveReportWindow({
      kind: 'custom',
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-07-08T00:00:00.000Z',
    })
    expect(isInWindow('2026-07-05T00:00:00.000Z', w)).toBe(true)
    expect(isInWindow('2026-07-08T00:00:00.000Z', w)).toBe(false)
  })

  it('builds preceding equal-duration window', () => {
    const w = resolveReportWindow({
      kind: 'custom',
      start: '2026-07-08T00:00:00.000Z',
      end: '2026-07-15T00:00:00.000Z',
    })
    const prev = precedingEqualDurationWindow(w)
    expect(prev.end).toBe(w.start)
    expect(prev.start).toBe('2026-07-01T00:00:00.000Z')
  })
})
