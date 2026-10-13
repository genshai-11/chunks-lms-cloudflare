import type { CourseDaySlot, CourseSchedule } from '../roster/types'
import {
  expandSlotsForMaterialize,
  normalizeCourseSchedule,
  normalizeTime,
  normalizeWeekdays,
} from '../roster/schedule'

/** 0=Sunday … 6=Saturday (JS Date convention) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type WeeklyScheduleInput = {
  /** ISO date of first occurrence window (YYYY-MM-DD) */
  startDate: string
  /** Inclusive end date of course/window */
  endDate: string
  /** 0=Sunday .. 6=Saturday */
  dayOfWeek: number
  timeZone: string
  durationMinutes: number
}

/** Legacy: same start time for all selected weekdays */
export type MultiWeekdayScheduleInput = {
  startDate: string
  weekdays: number[]
  sessionCount: number
  startTime: string
  timeZone: string
  durationMinutes: number
}

/** Dynamic: each day (or multi-time per day) can have its own time */
export type MultiSlotScheduleInput = {
  startDate: string
  slots: Array<{ weekday: number; startTime: string; durationMinutes: number }>
  sessionCount: number
  timeZone: string
}

export type MaterializedOccurrence = {
  plannedStartDate: string
  /** ISO datetime local intent as UTC wall-clock for storage (date + time) */
  plannedStart: string
  sequence: number
  timeZone: string
  durationMinutes: number
  dayOfWeek: number
  startTime: string
}

export type CourseSchedulePlan = {
  occurrences: MaterializedOccurrence[]
  /** Auto-detected end date = last session date */
  endsOn: string | null
  sessionCount: number
}

/**
 * Materialize weekly occurrences between start and end (inclusive by date string YYYY-MM-DD).
 * V1 keeps recurrence simple: weekly only, explicit materialization.
 */
export function materializeWeekly(input: WeeklyScheduleInput): MaterializedOccurrence[] {
  const start = parseDate(input.startDate)
  const end = parseDate(input.endDate)
  if (end < start) return []

  const occurrences: MaterializedOccurrence[] = []
  const cursor = new Date(start)

  while (cursor.getUTCDay() !== input.dayOfWeek && cursor <= end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  let sequence = 0
  while (cursor <= end) {
    const plannedStartDate = toIsoDate(cursor)
    occurrences.push({
      plannedStartDate,
      plannedStart: combineDateAndTime(plannedStartDate, '09:00'),
      sequence,
      timeZone: input.timeZone,
      durationMinutes: input.durationMinutes,
      dayOfWeek: input.dayOfWeek,
      startTime: '09:00',
    })
    sequence += 1
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  return occurrences
}

function isSlotInput(
  input: MultiWeekdayScheduleInput | MultiSlotScheduleInput,
): input is MultiSlotScheduleInput {
  return 'slots' in input && Array.isArray(input.slots)
}

function toSlotList(
  input: MultiWeekdayScheduleInput | MultiSlotScheduleInput,
): Array<{ weekday: number; startTime: string; durationMinutes: number }> {
  if (isSlotInput(input)) {
    return input.slots
      .filter((s) => s.weekday >= 0 && s.weekday <= 6)
      .map((s) => ({
        weekday: s.weekday,
        startTime: normalizeTime(s.startTime),
        durationMinutes: s.durationMinutes > 0 ? s.durationMinutes : 60,
      }))
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
  }

  const startTime = normalizeTime(input.startTime)
  return normalizeWeekdays(input.weekdays).map((weekday) => ({
    weekday,
    startTime,
    durationMinutes: input.durationMinutes,
  }))
}

/**
 * Materialize the next `sessionCount` meetings from startDate.
 * Supports different times per weekday and multiple times on the same day.
 * End day is auto-detected as the date of the last occurrence.
 */
export function materializeSessionCount(
  input: MultiWeekdayScheduleInput | MultiSlotScheduleInput,
): CourseSchedulePlan {
  const slots = toSlotList(input)
  const sessionCount = input.sessionCount
  const timeZone = input.timeZone

  if (slots.length === 0 || sessionCount < 1) {
    return { occurrences: [], endsOn: null, sessionCount: 0 }
  }

  const byWeekday = new Map<number, typeof slots>()
  for (const slot of slots) {
    const list = byWeekday.get(slot.weekday) ?? []
    list.push(slot)
    byWeekday.set(slot.weekday, list)
  }

  const start = parseDate(input.startDate)
  const occurrences: MaterializedOccurrence[] = []
  const cursor = new Date(start)
  const maxSteps = 366 * 2
  let steps = 0
  let sequence = 0

  while (occurrences.length < sessionCount && steps < maxSteps) {
    const dow = cursor.getUTCDay()
    const daySlots = byWeekday.get(dow)
    if (daySlots) {
      const plannedStartDate = toIsoDate(cursor)
      for (const slot of daySlots) {
        if (occurrences.length >= sessionCount) break
        occurrences.push({
          plannedStartDate,
          plannedStart: combineDateAndTime(plannedStartDate, slot.startTime),
          sequence,
          timeZone,
          durationMinutes: slot.durationMinutes,
          dayOfWeek: dow,
          startTime: slot.startTime,
        })
        sequence += 1
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    steps += 1
  }

  const endsOn =
    occurrences.length > 0
      ? occurrences[occurrences.length - 1]!.plannedStartDate
      : null

  return {
    occurrences,
    endsOn,
    sessionCount: occurrences.length,
  }
}

/** Materialize from a full CourseSchedule object (slots-aware). */
export function materializeCourseSchedule(
  startsOn: string,
  schedule: CourseSchedule,
): CourseSchedulePlan {
  const s = normalizeCourseSchedule(schedule)
  if (!s || !startsOn) return { occurrences: [], endsOn: null, sessionCount: 0 }
  return materializeSessionCount({
    startDate: startsOn,
    slots: expandSlotsForMaterialize(s),
    sessionCount: s.sessionCount,
    timeZone: s.timeZone,
  })
}

/** Compute only the end date for a course auto-schedule. */
export function computeCourseEndDate(
  input: MultiWeekdayScheduleInput | MultiSlotScheduleInput,
): string | null {
  return materializeSessionCount(input).endsOn
}

export function formatWeekdaysLabel(weekdays: number[]): string {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return normalizeWeekdays(weekdays)
    .map((d) => labels[d] ?? String(d))
    .join(', ')
}

export type { CourseDaySlot }

function parseDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Store as ISO string with local wall-clock time (no TZ conversion for V1 demo). */
function combineDateAndTime(isoDate: string, hhmm: string): string {
  const time = normalizeTime(hhmm)
  return `${isoDate}T${time}:00.000Z`
}
