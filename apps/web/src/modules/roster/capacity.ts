export const DEFAULT_CLASS_CAPACITY = 3

export type EnrollmentDecision =
  | { ok: true }
  | { ok: false; error: string }

export function canEnroll(
  activeEnrollmentCount: number,
  capacity: number = DEFAULT_CLASS_CAPACITY,
): EnrollmentDecision {
  if (capacity < 1) {
    return { ok: false, error: 'Class capacity must be a positive integer' }
  }
  if (activeEnrollmentCount >= capacity) {
    return {
      ok: false,
      error: `Class is full (capacity ${capacity})`,
    }
  }
  return { ok: true }
}
