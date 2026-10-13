import type { CourseDaySlot, CourseSchedule } from './types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Normalize any stored schedule (legacy single-time or new slots) into full CourseSchedule. */
export function normalizeCourseSchedule(
  raw: Partial<CourseSchedule> | null | undefined,
): CourseSchedule | null {
  if (!raw || typeof raw !== 'object') return null

  const durationMinutes =
    typeof raw.durationMinutes === 'number' && raw.durationMinutes > 0
      ? raw.durationMinutes
      : 60
  const sessionCount =
    typeof raw.sessionCount === 'number' && raw.sessionCount > 0 ? raw.sessionCount : 15
  const timeZone =
    typeof raw.timeZone === 'string' && raw.timeZone.trim()
      ? raw.timeZone
      : 'Asia/Ho_Chi_Minh'

  let slots: CourseDaySlot[] = []

  if (Array.isArray(raw.slots) && raw.slots.length > 0) {
    slots = raw.slots
      .filter(
        (s): s is CourseDaySlot =>
          s != null &&
          typeof s.weekday === 'number' &&
          s.weekday >= 0 &&
          s.weekday <= 6 &&
          typeof s.startTime === 'string',
      )
      .map((s) => ({
        weekday: s.weekday,
        startTime: normalizeTime(s.startTime),
        durationMinutes:
          typeof s.durationMinutes === 'number' && s.durationMinutes > 0
            ? s.durationMinutes
            : undefined,
      }))
  } else if (Array.isArray(raw.weekdays) && raw.weekdays.length > 0) {
    const startTime = normalizeTime(
      typeof raw.startTime === 'string' ? raw.startTime : '09:00',
    )
    slots = normalizeWeekdays(raw.weekdays).map((weekday) => ({
      weekday,
      startTime,
    }))
  }

  if (slots.length === 0) return null

  slots = sortSlots(slots)
  const weekdays = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b)
  const startTime = slots[0]?.startTime ?? '09:00'

  return {
    slots,
    weekdays,
    startTime,
    durationMinutes,
    sessionCount,
    timeZone,
  }
}

export function defaultCourseSchedule(
  partial?: Partial<CourseSchedule> & { slots?: CourseDaySlot[] },
): CourseSchedule {
  const base: CourseSchedule = {
    slots: [
      { weekday: 2, startTime: '09:00' },
      { weekday: 3, startTime: '09:00' },
    ],
    weekdays: [2, 3],
    startTime: '09:00',
    durationMinutes: 60,
    sessionCount: 15,
    timeZone: 'Asia/Ho_Chi_Minh',
  }

  if (!partial) return base

  // If only legacy fields provided, rebuild slots
  if (!partial.slots && (partial.weekdays || partial.startTime)) {
    return (
      normalizeCourseSchedule({
        ...base,
        ...partial,
        slots: undefined,
      }) ?? base
    )
  }

  return (
    normalizeCourseSchedule({
      ...base,
      ...partial,
      slots: partial.slots ?? base.slots,
    }) ?? base
  )
}

export function sortSlots(slots: CourseDaySlot[]): CourseDaySlot[] {
  return [...slots].sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    return a.startTime.localeCompare(b.startTime)
  })
}

export function normalizeWeekdays(weekdays: number[]): number[] {
  return [...new Set(weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
}

export function normalizeTime(hhmm: string): string {
  if (/^\d{2}:\d{2}$/.test(hhmm)) return hhmm
  if (/^\d{1}:\d{2}$/.test(hhmm)) return `0${hhmm}`
  return '09:00'
}

/** Human label: "Tue 09:00, Wed 14:30" or "Tue 09:00 · 14:00, Wed 09:00" */
export function formatScheduleLabel(schedule: CourseSchedule | null | undefined): string {
  const s = normalizeCourseSchedule(schedule ?? null)
  if (!s) return 'No schedule'

  const byDay = new Map<number, string[]>()
  for (const slot of s.slots) {
    const list = byDay.get(slot.weekday) ?? []
    list.push(slot.startTime)
    byDay.set(slot.weekday, list)
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, times]) => {
      const label = DAY_LABELS[day] ?? String(day)
      return times.length === 1 ? `${label} ${times[0]}` : `${label} ${times.join(' · ')}`
    })
    .join(', ')
}

export function formatWeekdaysLabel(weekdays: number[]): string {
  return normalizeWeekdays(weekdays)
    .map((d) => DAY_LABELS[d] ?? String(d))
    .join(', ')
}

/** Slots ready for materialization (duration always set). */
export function expandSlotsForMaterialize(
  schedule: CourseSchedule,
): Array<{ weekday: number; startTime: string; durationMinutes: number }> {
  const s = normalizeCourseSchedule(schedule)
  if (!s) return []
  return s.slots.map((slot) => ({
    weekday: slot.weekday,
    startTime: slot.startTime,
    durationMinutes: slot.durationMinutes ?? s.durationMinutes,
  }))
}
