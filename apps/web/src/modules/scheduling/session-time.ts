/**
 * Session times are stored as wall-clock in the ISO string:
 *   `YYYY-MM-DDTHH:mm:ss.sssZ` where HH:mm is the intended local class time
 *   (not a real UTC instant). Display must NOT call toLocaleTimeString on the
 *   Date object (that shifts by browser TZ). Use these helpers instead.
 */

/** HH:mm from stored plannedStart */
export function formatSessionClock(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  try {
    return new Date(iso).toISOString().slice(11, 16)
  } catch {
    return '—'
  }
}

/** YYYY-MM-DD from plannedStart */
export function formatSessionDateIso(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return '—'
  }
}

/** e.g. "Tue, Jul 15" from wall-clock date part */
export function formatSessionDateLabel(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = formatSessionDateIso(iso)
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  })
}

/** End clock given start ISO + duration minutes (wall-clock arithmetic). */
export function formatSessionEndClock(iso: string, durationMinutes: number): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return '—'
  let total = Number(m[1]) * 60 + Number(m[2]) + durationMinutes
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Range: "09:00 – 10:00" */
export function formatSessionTimeRange(iso: string, durationMinutes: number): string {
  return `${formatSessionClock(iso)} – ${formatSessionEndClock(iso, durationMinutes)}`
}

/** Build wall-clock ISO from local Date fields (no TZ shift). */
export function wallClockIsoFromLocal(
  day: Date,
  hour: number,
  minutes = 0,
): string {
  const y = day.getFullYear()
  const mo = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return `${y}-${mo}-${d}T${hh}:${mm}:00.000Z`
}

/** Compare wall-clock date part to today (local calendar). */
export function isSessionOnOrAfterToday(iso: string, now = new Date()): boolean {
  const date = formatSessionDateIso(iso)
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return date >= `${y}-${m}-${d}`
}

/** True if wall-clock date equals local calendar day. */
export function isSameWallClockDay(iso: string, day: Date): boolean {
  const a = formatSessionDateIso(iso)
  const y = day.getFullYear()
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return a === `${y}-${m}-${d}`
}
