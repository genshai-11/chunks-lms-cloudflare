import { liveTestExternalRef } from '../assessment/live-test'

export type TestPackageVersionStatus = 'draft' | 'published' | 'archived'

export type TestPackage = {
  id: string
  organizationId: string
  title: string
  slug: string
  description?: string | null
  createdByUserId: string | null
  sourceMetadata: Record<string, unknown>
  archivedAt: string | null
}

export type TestPackageVersion = {
  id: string
  packageId: string
  versionLabel: string
  status: TestPackageVersionStatus
  snapshotHash: string | null
  publishedAt: string | null
  sourceMetadata: Record<string, unknown>
}

export type TestSection = {
  id: string
  packageVersionId: string
  sectionOrder: number
  title: string | null
  introTextVi?: string | null
  introTextEn?: string | null
  targetCvrOhm?: number | null
  cciProfileId?: string | null
  cciCategoryId?: string | null
}

export type TestItem = {
  id: string
  sectionId: string
  packageVersionId: string
  itemOrder: number
  termVi?: string | null
  termEn?: string | null
  promptVi: string | null
  promptEn: string | null
  spokenScriptVi?: string | null
  spokenScriptEn?: string | null
  tc: number | null
  lc: number | null
  tl: number | null
  measuredCvr: number | null
}

export type CciProfile = {
  id: string
  organizationId: string
  name: string
  versionLabel: string
  status: 'draft' | 'active' | 'archived'
  description?: string | null
}


export type CciCategory = {
  id: string
  profileId: string
  categoryOrder: number
  label: string
  value: number
  description: string | null
  metadata: Record<string, unknown>
}

export type SectionMeasurementSnapshot = {
  id: string
  sectionId: string
  packageVersionId: string
  targetCvrOhm: number
  cciProfileId: string
  cciCategoryId: string
  cciCategoryLabel: string
  cciValue: number
  supersedesSnapshotId: string | null
  overrideReason: string | null
  createdAt: string
}

export type SessionQuestionPlan = {
  packageVersionId: string
  sectionId: string
  questions: Array<{
    itemId: string
    itemOrder: number
    externalRef: string
  }>
}

type MeasurementInputs = {
  tc: number | null | undefined
  lc: number | null | undefined
  tl: number | null | undefined
}

function roundMeasurement(value: number): number {
  return Math.round(value * 100) / 100
}

function snapshotId(input: {
  sectionId: string
  packageVersionId: string
  targetCvrOhm: number
  cciCategoryId: string
  cciValue: number
  supersedesSnapshotId: string | null
  createdAt: string
}): string {
  const basis = [
    input.sectionId,
    input.packageVersionId,
    input.targetCvrOhm,
    input.cciCategoryId,
    input.cciValue,
    input.supersedesSnapshotId ?? 'root',
    input.createdAt,
  ].join(':')
  let hash = 0
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0
  }
  return `sms-${hash.toString(16).padStart(8, '0')}`
}

export function assertPackageVersionCanMutate(version: Pick<TestPackageVersion, 'status'>): void {
  if (version.status !== 'draft') {
    throw new Error(
      'Published Package Versions are immutable; create a draft or measurement override snapshot instead',
    )
  }
}

export function measuredCvr(input: MeasurementInputs): number | null {
  if (input.tc == null || input.lc == null || input.tl == null) return null
  return roundMeasurement(input.tc * input.lc * input.tl)
}

export function createSectionMeasurementSnapshot(input: {
  sectionId: string
  packageVersionId: string
  targetCvrOhm: number
  cciProfileId: string
  cciCategory: CciCategory
  createdAt: string
}): SectionMeasurementSnapshot {
  const common = {
    sectionId: input.sectionId,
    packageVersionId: input.packageVersionId,
    targetCvrOhm: input.targetCvrOhm,
    cciCategoryId: input.cciCategory.id,
    cciValue: input.cciCategory.value,
    supersedesSnapshotId: null,
    createdAt: input.createdAt,
  }
  return {
    id: snapshotId(common),
    ...common,
    cciProfileId: input.cciProfileId,
    cciCategoryLabel: input.cciCategory.label,
    overrideReason: null,
  }
}

export function createMeasurementOverrideSnapshot(
  original: SectionMeasurementSnapshot,
  input: { cciCategory: CciCategory; reason: string; createdAt: string; targetCvrOhm?: number },
): SectionMeasurementSnapshot {
  const targetCvrOhm = input.targetCvrOhm ?? original.targetCvrOhm
  const common = {
    sectionId: original.sectionId,
    packageVersionId: original.packageVersionId,
    targetCvrOhm,
    cciCategoryId: input.cciCategory.id,
    cciValue: input.cciCategory.value,
    supersedesSnapshotId: original.id,
    createdAt: input.createdAt,
  }
  return {
    id: snapshotId(common),
    ...common,
    cciProfileId: input.cciCategory.profileId,
    cciCategoryLabel: input.cciCategory.label,
    overrideReason: input.reason,
  }
}

export function calculateItemCpd(
  snapshot: Pick<SectionMeasurementSnapshot, 'targetCvrOhm' | 'cciValue'>,
): number {
  return roundMeasurement(snapshot.targetCvrOhm * snapshot.cciValue)
}

export function buildSectionQuestionPlan(input: {
  version: TestPackageVersion
  section: TestSection
  items: TestItem[]
}): SessionQuestionPlan {
  if (input.version.status !== 'published') {
    throw new Error('Only published Package Versions can plan live-test Session Questions')
  }
  if (input.section.packageVersionId !== input.version.id) {
    throw new Error('Test Section must belong to the selected Package Version')
  }
  const orderedItems = [...input.items]
    .filter((candidate) => candidate.sectionId === input.section.id)
    .sort((a, b) => a.itemOrder - b.itemOrder)

  return {
    packageVersionId: input.version.id,
    sectionId: input.section.id,
    questions: orderedItems.map((testItem) => ({
      itemId: testItem.id,
      itemOrder: testItem.itemOrder,
      externalRef: `${liveTestExternalRef(testItem.id)}:v${input.version.id}`,
    })),
  }
}

export function detectPackageTestType(pkg: {
  title?: string | null
  slug?: string | null
  sourceMetadata?: Record<string, any> | null
  source_metadata?: Record<string, any> | null
}): 'green' | 'red' {
  const meta = pkg.sourceMetadata ?? pkg.source_metadata
  const metadataType = meta?.testType ?? meta?.test_type
  if (typeof metadataType === 'string') {
    const lower = metadataType.toLowerCase()
    if (lower === 'red') return 'red'
    if (lower === 'green') return 'green'
  }

  const title = (pkg.title || '').trim().toUpperCase()
  const slug = (pkg.slug || '').trim().toLowerCase()

  // Red test detection:
  // - Starts with 'R' (e.g. R4-31V-0826, R01-42Q-56V)
  // - Contains word boundary pattern for R + digits
  // - Contains 'RED' or 'AWARENESS'
  // - Slug starts with 'r' or contains 'red'
  if (
    title.startsWith('R') ||
    /\bR\d+/i.test(title) ||
    title.includes('RED') ||
    title.includes('AWARENESS') ||
    slug.startsWith('r') ||
    slug.includes('red')
  ) {
    return 'red'
  }

  return 'green'
}

export function calculateCvr(tc: number, lc: number, tl: number): number {
  return roundMeasurement(tc * lc * tl)
}

export function calculateCpd(cvr: number, cci: number): number {
  return roundMeasurement(cvr * cci)
}

export function calculateCciFromCpd(targetCpd: number, cvr: number): number {
  if (cvr <= 0) return 1
  return Math.max(1, Math.round(targetCpd / cvr))
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function calculateWordCountLc(wordCount: number): number {
  if (wordCount <= 8) return 1.0
  if (wordCount <= 14) return roundMeasurement(1.0 + ((wordCount - 8) / 6) * 0.4)
  if (wordCount <= 17) return roundMeasurement(1.4 + ((wordCount - 14) / 3) * 0.3)
  if (wordCount <= 22) return roundMeasurement(1.7 + ((wordCount - 17) / 5) * 0.3)
  return roundMeasurement(2.0 + Math.min(0.5, ((wordCount - 22) / 10) * 0.5))
}

export function validateGreenSentence(
  prompt: string,
  options?: { minWords?: number; maxWords?: number },
): { wordCount: number; valid: boolean; reason?: string } {
  const min = options?.minWords ?? 8
  const max = options?.maxWords ?? 22
  const words = countWords(prompt)
  if (words < min) {
    return {
      wordCount: words,
      valid: false,
      reason: `Sentence is too short (${words} words, minimum ${min})`,
    }
  }
  if (words > max) {
    return {
      wordCount: words,
      valid: false,
      reason: `Sentence exceeds maximum allowed length (${words} words, maximum ${max})`,
    }
  }
  return { wordCount: words, valid: true }
}

export function validateRedCollocations(
  hints: Array<{ text?: string | null } | string>,
): { valid: boolean; singleWords: string[]; totalHints: number; reason?: string } {
  const singleWords: string[] = []
  let totalHints = 0
  for (const hint of hints) {
    const text = (typeof hint === 'string' ? hint : hint.text ?? '').trim()
    if (!text) continue
    totalHints += 1
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < 2) {
      singleWords.push(text)
    }
  }
  if (totalHints === 0) {
    return {
      valid: false,
      singleWords: [],
      totalHints: 0,
      reason: 'No hints provided for Red test item',
    }
  }
  return {
    valid: singleWords.length === 0,
    singleWords,
    totalHints,
    reason:
      singleWords.length > 0
        ? `Zero single words violated: ${singleWords.join(', ')}`
        : undefined,
  }
}

export function extractPackageVoltage(
  pkg: { code?: string | null; title?: string | null; slug?: string | null; sourceMetadata?: Record<string, unknown> | null },
  fallbackType?: 'green' | 'red' | string | null,
): number {
  const meta = pkg?.sourceMetadata as Record<string, unknown> | undefined | null
  const metaVolt = Number(meta?.targetVoltage ?? meta?.targetCpd)
  if (!isNaN(metaVolt) && metaVolt > 0) return metaVolt

  const str = `${pkg?.title || ''} ${pkg?.slug || ''} ${pkg?.code || ''}`
  const match = str.match(/(?:^|[_\-\s])(\d+)V(?:[_\-\s]|$)/i)
  if (match && match[1]) {
    const parsed = Number(match[1])
    if (!isNaN(parsed) && parsed > 0) return parsed
  }

  return (fallbackType || '').toLowerCase() === 'red' ? 56 : 12
}

export type PackageKind = 'standard' | 'mini'

export function detectPackageKind(pkg: {
  title?: string | null
  slug?: string | null
  sourceMetadata?: Record<string, unknown> | null
  itemCount?: number | null
}): PackageKind {
  const meta = pkg?.sourceMetadata as Record<string, unknown> | undefined | null
  if (meta?.package_kind === 'mini' || meta?.packageKind === 'mini' || meta?.is_mini_test === true) {
    return 'mini'
  }
  const title = (pkg?.title ?? '').toLowerCase()
  const slug = (pkg?.slug ?? '').toLowerCase()
  if (slug.startsWith('mini-') || title.startsWith('mini-') || title.includes('[mini]')) {
    return 'mini'
  }
  if (pkg?.itemCount != null && pkg.itemCount > 0 && pkg.itemCount <= 21) {
    return 'mini'
  }
  return 'standard'
}


