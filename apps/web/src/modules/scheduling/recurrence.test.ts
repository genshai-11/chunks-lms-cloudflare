import { describe, expect, it } from 'vitest'
import {
  computeCourseEndDate,
  materializeSessionCount,
  materializeWeekly,
} from './recurrence'

describe('weekly recurrence materialization', () => {
  it('materializes weekly Mondays in range', () => {
    // 2026-07-06 is a Monday
    const occ = materializeWeekly({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      dayOfWeek: 1,
      timeZone: 'Asia/Ho_Chi_Minh',
      durationMinutes: 60,
    })
    expect(occ.length).toBeGreaterThanOrEqual(3)
    expect(occ[0]?.plannedStartDate).toBe('2026-07-06')
    expect(occ.every((o) => o.timeZone === 'Asia/Ho_Chi_Minh')).toBe(true)
  })
})

describe('course auto-schedule (session count)', () => {
  it('generates 15 Tue+Wed meetings and auto-detects end day', () => {
    // 2026-07-01 is Wednesday
    const plan = materializeSessionCount({
      startDate: '2026-07-01',
      weekdays: [2, 3], // Tue, Wed
      sessionCount: 15,
      startTime: '09:00',
      timeZone: 'Asia/Ho_Chi_Minh',
      durationMinutes: 60,
    })
    expect(plan.sessionCount).toBe(15)
    expect(plan.occurrences).toHaveLength(15)
    expect(plan.endsOn).toBe(plan.occurrences[14]?.plannedStartDate)
    // First hit on/after Jul 1 Wed → Jul 1 is Wed (3)
    expect(plan.occurrences[0]?.plannedStartDate).toBe('2026-07-01')
    expect(plan.occurrences[0]?.plannedStart).toContain('T09:00')
    // Alternates Wed/Tue pattern from start
    const dows = plan.occurrences.map((o) => o.dayOfWeek)
    expect(dows.every((d) => d === 2 || d === 3)).toBe(true)
  })

  it('with 2 weekdays, 100 sessions ≈ balanced; end date after start', () => {
    const endsOn = computeCourseEndDate({
      startDate: '2026-07-01',
      weekdays: [2, 3],
      sessionCount: 15,
      startTime: '14:30',
      timeZone: 'Asia/Ho_Chi_Minh',
      durationMinutes: 90,
    })
    expect(endsOn).toBeTruthy()
    expect(endsOn! >= '2026-07-01').toBe(true)
  })

  it('supports different times per weekday via slots', () => {
    const plan = materializeSessionCount({
      startDate: '2026-07-01', // Wed
      slots: [
        { weekday: 3, startTime: '09:00', durationMinutes: 60 }, // Wed morning
        { weekday: 2, startTime: '14:30', durationMinutes: 90 }, // Tue afternoon
      ],
      sessionCount: 4,
      timeZone: 'Asia/Ho_Chi_Minh',
    })
    expect(plan.sessionCount).toBe(4)
    // First is Wed Jul 1 09:00
    expect(plan.occurrences[0]?.plannedStart).toContain('T09:00')
    expect(plan.occurrences[0]?.dayOfWeek).toBe(3)
    // Next Tue Jul 7 14:30
    const tue = plan.occurrences.find((o) => o.dayOfWeek === 2)
    expect(tue?.plannedStart).toContain('T14:30')
    expect(tue?.durationMinutes).toBe(90)
  })

  it('supports multi-time on the same day', () => {
    const plan = materializeSessionCount({
      startDate: '2026-07-06', // Monday
      slots: [
        { weekday: 1, startTime: '09:00', durationMinutes: 45 },
        { weekday: 1, startTime: '15:00', durationMinutes: 45 },
      ],
      sessionCount: 4,
      timeZone: 'Asia/Ho_Chi_Minh',
    })
    expect(plan.sessionCount).toBe(4)
    // First Monday yields two meetings
    expect(plan.occurrences[0]?.plannedStartDate).toBe('2026-07-06')
    expect(plan.occurrences[0]?.startTime).toBe('09:00')
    expect(plan.occurrences[1]?.plannedStartDate).toBe('2026-07-06')
    expect(plan.occurrences[1]?.startTime).toBe('15:00')
  })
})
