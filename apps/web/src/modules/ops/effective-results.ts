import type { ResultRecord } from '../reporting/progress'

/** Stable attempt identity for append-only ledger rows. */
export function resultKey(r: Pick<ResultRecord, 'learningSessionId' | 'sessionQuestionId' | 'learnerUserId'>): string {
  return `${r.learningSessionId}:${r.sessionQuestionId}:${r.learnerUserId}`
}

/**
 * Latest effective result per attempt (by finalizedAt).
 * Ledger is append-only; corrections append a newer row.
 */
export function effectiveResults(ledger: ResultRecord[]): ResultRecord[] {
  const map = new Map<string, ResultRecord>()
  for (const row of ledger) {
    const key = resultKey(row)
    const prev = map.get(key)
    if (!prev || prev.finalizedAt <= row.finalizedAt) {
      map.set(key, row)
    }
  }
  return [...map.values()].sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt))
}

export function findEffectiveResult(
  ledger: ResultRecord[],
  key: string,
): ResultRecord | null {
  return effectiveResults(ledger).find((r) => resultKey(r) === key) ?? null
}
