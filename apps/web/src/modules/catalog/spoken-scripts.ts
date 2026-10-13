import type { NarrationReviewRecord } from '../../lib/test-packages'

export type AudioLanguage = 'vi' | 'en'

export function normalizeSpokenText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function buildIntroSpokenScript(input: {
  sectionOrder: number
  cvr: number
  cciAmpe: number
  cciName: string
  cciDescription?: string | null
  language: AudioLanguage
}): string {
  const description = normalizeSpokenText(input.cciDescription ?? '')
  const parts = [
    `Session ${input.sectionOrder}.`,
    `CVR ${input.cvr}.`,
    `CCI ${input.cciAmpe} Ampe.`,
    `${normalizeSpokenText(input.cciName)}.`,
  ]
  if (description) parts.push(`${description}.`)
  parts.push(input.language === 'vi' ? 'Bắt đầu.' : 'Start.')
  return parts.join(' ')
}

export function buildItemSpokenScript(input: {
  itemOrder: number
  prompt: string
  language: AudioLanguage
}): string {
  const prefix = input.language === 'vi' ? `Số ${input.itemOrder}.` : `Number ${input.itemOrder}.`
  return `${prefix} ${normalizeSpokenText(input.prompt)}`
}

export function resolveItemSpokenScript(input: {
  itemOrder: number
  prompt: string
  language: AudioLanguage
  override?: string | null
}): string {
  const override = normalizeSpokenText(input.override ?? '')
  return override || buildItemSpokenScript(input)
}

export async function narrationSourceHash(
  spokenText: string,
  language: AudioLanguage,
  voiceId: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(`${spokenText}:${language}:${voiceId}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
  return `sha256:${hex}`
}

export type AudioTargetStatus =
  'missing' | 'generated' | 'approved' | 'stale' | 'failed' | 'rejected'

function narrationTargetKey(record: NarrationReviewRecord): string {
  if (record.variant.narrationTarget === 'package_start') return 'package:start'
  if (record.variant.narrationTarget === 'part_intro') return `part:${record.variant.providerMetadata?.part ?? 'unknown'}`
  if (record.variant.narrationTarget === 'package_end') return 'package:end'
  if (record.variant.narrationTarget === 'section_intro') return `section:${record.variant.testSectionId}`
  return `item:${record.variant.testItemId}`
}

export function latestNarrationByTarget(
  records: NarrationReviewRecord[],
): Map<string, NarrationReviewRecord> {
  const latest = new Map<string, NarrationReviewRecord>()
  for (const record of records) {
    const key = narrationTargetKey(record)
    if (!latest.has(key)) latest.set(key, record)
  }
  return latest
}

export function resolveNarrationRecord(
  records: NarrationReviewRecord[],
  targetKey: string,
  currentHash: string | undefined,
): NarrationReviewRecord | undefined {
  const candidates = records.filter((record) => narrationTargetKey(record) === targetKey)
  if (!currentHash) return candidates[0]
  return (
    candidates.find(
      (record) =>
        record.variant.sourceTextHash === currentHash &&
        record.variant.approvalStatus === 'approved',
    ) ??
    candidates.find(
      (record) =>
        record.variant.sourceTextHash === currentHash &&
        record.variant.approvalStatus !== 'archived',
    ) ??
    candidates[0]
  )
}

export function audioTargetStatus(
  record: NarrationReviewRecord | undefined,
  currentHash: string | undefined,
): AudioTargetStatus {
  if (!record) return 'missing'
  if (record.job?.status === 'failed') return 'failed'
  if (record.variant.approvalStatus === 'rejected' || record.variant.approvalStatus === 'archived')
    return 'rejected'
  if (!currentHash || record.variant.sourceTextHash !== currentHash) return 'stale'
  return record.variant.approvalStatus === 'approved' ? 'approved' : 'generated'
}

export function audioReadiness(statuses: AudioTargetStatus[]): {
  approved: number
  expected: number
  stale: number
  failed: number
  ready: boolean
} {
  const approved = statuses.filter((status) => status === 'approved').length
  const stale = statuses.filter((status) => status === 'stale').length
  const failed = statuses.filter((status) => status === 'failed').length
  return {
    approved,
    expected: statuses.length,
    stale,
    failed,
    ready: statuses.length > 0 && approved === statuses.length,
  }
}
