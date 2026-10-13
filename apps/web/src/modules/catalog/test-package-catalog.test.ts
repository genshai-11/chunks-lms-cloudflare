import { describe, expect, it } from 'vitest'
import {
  assertPackageVersionCanMutate,
  buildSectionQuestionPlan,
  calculateCciFromCpd,
  calculateCpd,
  calculateCvr,
  calculateItemCpd,
  calculateWordCountLc,
  createMeasurementOverrideSnapshot,
  createSectionMeasurementSnapshot,
  measuredCvr,
  validateGreenSentence,
  validateRedCollocations,
  extractPackageVoltage,
  detectPackageKind,
  type CciCategory,
  type TestItem,
  type TestPackageVersion,
  type TestSection,
} from './test-package-catalog'


const draftVersion: TestPackageVersion = {
  id: 'version-draft',
  packageId: 'package-1',
  versionLabel: '1.0.0-draft',
  status: 'draft',
  snapshotHash: null,
  publishedAt: null,
  sourceMetadata: {},
}

const publishedVersion: TestPackageVersion = {
  id: 'version-1',
  packageId: 'package-1',
  versionLabel: '1.0.0',
  status: 'published',
  snapshotHash: 'sha256:abc',
  publishedAt: '2026-07-19T03:00:00.000Z',
  sourceMetadata: {},
}

const section: TestSection = {
  id: 'section-1',
  packageVersionId: 'version-1',
  sectionOrder: 1,
  title: 'Flexible section',
}

function item(id: string, itemOrder: number): TestItem {
  return {
    id,
    sectionId: 'section-1',
    packageVersionId: 'version-1',
    itemOrder,
    promptVi: `Câu ${itemOrder}`,
    promptEn: `Sentence ${itemOrder}`,
    tc: 2,
    lc: itemOrder,
    tl: 3,
    measuredCvr: 2 * itemOrder * 3,
  }
}

const cciCategory: CciCategory = {
  id: 'cci-cat-1',
  profileId: 'cci-profile-1',
  categoryOrder: 1,
  label: 'Current 5',
  value: 5,
  description: null,
  metadata: {},
}

describe('test package catalog', () => {
  it('allows drafts to mutate and rejects published version mutation', () => {
    expect(() => assertPackageVersionCanMutate(draftVersion)).not.toThrow()
    expect(() => assertPackageVersionCanMutate(publishedVersion)).toThrow(
      'Published Package Versions are immutable',
    )
  })

  it('plans flexible section question counts with immutable item refs', () => {
    const items = Array.from({ length: 12 }, (_, index) => item(`item-${index + 1}`, index + 1))
    const plan = buildSectionQuestionPlan({ version: publishedVersion, section, items })

    expect(plan.packageVersionId).toBe('version-1')
    expect(plan.sectionId).toBe('section-1')
    expect(plan.questions).toHaveLength(12)
    expect(plan.questions[0]).toEqual({
      itemId: 'item-1',
      itemOrder: 1,
      externalRef: 'live-test-item:item-1:vversion-1',
    })
    expect(plan.questions[11]?.externalRef).toBe('live-test-item:item-12:vversion-1')
  })

  it('stores item measured CVR as TC × LC × TL without replacing section target CVR', () => {
    expect(measuredCvr({ tc: 2, lc: 3, tl: 4 })).toBe(24)
    expect(measuredCvr({ tc: 2, lc: null, tl: 4 })).toBeNull()
  })

  it('snapshots CCI category values and derives item CPD from section target × CCI', () => {
    const snapshot = createSectionMeasurementSnapshot({
      sectionId: 'section-1',
      packageVersionId: 'version-1',
      targetCvrOhm: 12,
      cciProfileId: 'cci-profile-1',
      cciCategory,
      createdAt: '2026-07-19T03:00:00.000Z',
    })

    expect(snapshot.cciCategoryLabel).toBe('Current 5')
    expect(snapshot.cciValue).toBe(5)
    expect(calculateItemCpd(snapshot)).toBe(60)
  })

  it('creates measurement overrides as new snapshots instead of mutating historical snapshots', () => {
    const original = createSectionMeasurementSnapshot({
      sectionId: 'section-1',
      packageVersionId: 'version-1',
      targetCvrOhm: 12,
      cciProfileId: 'cci-profile-1',
      cciCategory,
      createdAt: '2026-07-19T03:00:00.000Z',
    })
    const override = createMeasurementOverrideSnapshot(original, {
      cciCategory: { ...cciCategory, id: 'cci-cat-2', label: 'Current 6', value: 6 },
      reason: 'Approved measurement review',
      createdAt: '2026-07-19T04:00:00.000Z',
    })

    expect(override.id).not.toBe(original.id)
    expect(override.supersedesSnapshotId).toBe(original.id)
    expect(override.cciCategoryLabel).toBe('Current 6')
    expect(override.cciValue).toBe(6)
    expect(original.cciCategoryLabel).toBe('Current 5')
    expect(calculateItemCpd(original)).toBe(60)
    expect(calculateItemCpd(override)).toBe(72)
  })

  it('calculates CVR, CPD, and derived CCI correctly', () => {
    // CVR = TC * LC * TL
    expect(calculateCvr(2, 1.15, 2.0)).toBe(4.6)
    expect(calculateCvr(3, 1.0, 1.0)).toBe(3.0)

    // CPD = CVR * CCI
    expect(calculateCpd(4.6, 12)).toBe(55.2)
    expect(calculateCpd(2.0, 6)).toBe(12.0)

    // CCI = targetCPD / CVR
    expect(calculateCciFromCpd(56, 4.6)).toBe(12)
    expect(calculateCciFromCpd(12, 2.0)).toBe(6)
  })

  it('calculates LC factor accurately according to sentence word counts', () => {
    expect(calculateWordCountLc(8)).toBe(1.0)
    expect(calculateWordCountLc(14)).toBe(1.4)
    expect(calculateWordCountLc(17)).toBe(1.7)
    expect(calculateWordCountLc(22)).toBe(2.0)
    expect(calculateWordCountLc(25)).toBe(2.15)
  })

  it('validates Green test complete sentence length constraints', () => {
    // Valid: 10 words (A2 session 1)
    const validPrompt = 'Ngành thương mại điện tử cạnh tranh rất khốc liệt hôm nay.'
    expect(validateGreenSentence(validPrompt).valid).toBe(true)

    // Too short (< 8 words)
    const shortPrompt = 'Thương mại điện tử.'
    expect(validateGreenSentence(shortPrompt).valid).toBe(false)
    expect(validateGreenSentence(shortPrompt).reason).toContain('too short')

    // Too long (> 22 words)
    const longPrompt =
      'Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn mười lăm mười sáu mười bảy mười tám mười chín hai mươi hai mốt hai hai hai ba.'
    expect(validateGreenSentence(longPrompt).valid).toBe(false)
    expect(validateGreenSentence(longPrompt).reason).toContain('exceeds maximum')
  })

  it('validates Red test collocations enforce zero single words', () => {
    // Valid: all collocations have >= 2 words
    const validHints = [
      { text: 'Ngành thương mại điện tử' },
      { text: 'cạnh tranh khốc liệt' },
    ]
    expect(validateRedCollocations(validHints).valid).toBe(true)

    // Invalid: contains single words like 'vốn' or 'nhanh'
    const invalidHints = [
      { text: 'Ngành thương mại điện tử' },
      { text: 'vốn' },
      { text: 'nhanh' },
    ]
    const result = validateRedCollocations(invalidHints)
    expect(result.valid).toBe(false)
    expect(result.singleWords).toEqual(['vốn', 'nhanh'])

    // Empty hints array or whitespace
    expect(validateRedCollocations([]).valid).toBe(false)
    expect(validateRedCollocations([{ text: '   ' }]).valid).toBe(false)
  })

  it('extracts package voltage accurately from name, title, code, or metadata', () => {
    // Explicit metadata
    expect(extractPackageVoltage({ title: 'G1-Custom', sourceMetadata: { targetVoltage: 24 } })).toBe(24)
    expect(extractPackageVoltage({ title: 'G1-Custom', sourceMetadata: { targetCpd: 48 } })).toBe(48)

    // Extracted from title/name (user examples: G1-56V-0826 -> 56V, G3-31V-0826 -> 31V)
    expect(extractPackageVoltage({ title: 'G1-56V-0826' }, 'green')).toBe(56)
    expect(extractPackageVoltage({ title: 'G2-56V-0826' }, 'green')).toBe(56)
    expect(extractPackageVoltage({ title: 'G3-31V-0826' }, 'green')).toBe(31)
    expect(extractPackageVoltage({ title: 'G4-31V-0826' }, 'green')).toBe(31)
    expect(extractPackageVoltage({ title: 'R1-56V-0826' }, 'red')).toBe(56)
    expect(extractPackageVoltage({ title: 'R3-31V-0826' }, 'red')).toBe(31)
    expect(extractPackageVoltage({ title: 'R4-31V-0826' }, 'red')).toBe(31)
    expect(extractPackageVoltage({ slug: 'g1-56v-ecommerce' }, 'green')).toBe(56)
    expect(extractPackageVoltage({ code: 'G1-12V-SAMPLE' })).toBe(12)

    // Fallbacks
    expect(extractPackageVoltage({ title: 'Standard Green' }, 'green')).toBe(12)
    expect(extractPackageVoltage({ title: 'Standard Red' }, 'red')).toBe(56)
  })

  it('detects package kind as standard vs mini accurately', () => {
    // Explicit sourceMetadata.package_kind
    expect(detectPackageKind({ sourceMetadata: { package_kind: 'mini' } })).toBe('mini')
    expect(detectPackageKind({ sourceMetadata: { package_kind: 'standard' } })).toBe('standard')

    // Title / code naming patterns
    expect(detectPackageKind({ title: 'mini-G1-56V' })).toBe('mini')
    expect(detectPackageKind({ title: 'G1-56V [MINI]' })).toBe('mini')
    expect(detectPackageKind({ slug: 'mini-g1-56v-variant' })).toBe('mini')
    expect(detectPackageKind({ title: 'Standard G1-56V Assessment' })).toBe('standard')

    // Item count heuristic (<= 21 items -> mini, 49 items -> standard)
    expect(detectPackageKind({ itemCount: 21 })).toBe('mini')
    expect(detectPackageKind({ itemCount: 15 })).toBe('mini')
    expect(detectPackageKind({ itemCount: 49 })).toBe('standard')
    expect(detectPackageKind({ itemCount: 56 })).toBe('standard')
  })
})



