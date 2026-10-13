import type { PromptLanguage } from '../scheduling/types'

export type AudioAsset = {
  id: string
  organizationId: string | null
  storageBucket: string
  storagePath: string
  mimeType: string
  durationMs: number | null
  sha256: string | null
}

export type LiveTestResource = {
  id: string
  organizationId: string | null
  title: string
  version: string
  status: 'draft' | 'active' | 'archived'
  sourceFilename: string | null
}

export type LiveTestBlock = {
  id: string
  resourceId: string
  blockNumber: number
  title: string | null
  cciMin: number | null
  cciMax: number | null
  cciAvg: number | null
  cvrMin: number | null
  cvrMax: number | null
  cvrAvg: number | null
  cpdMin: number | null
  cpdMax: number | null
  cpdAvg: number | null
  introTextVi: string | null
  introTextEn: string | null
  introAudioViAssetId: string | null
  introAudioEnAssetId: string | null
}

export type LiveTestItem = {
  id: string
  blockId: string
  itemNumber: number
  sourceDay: string | null
  sourceStt: string | null
  unitOhm: number | null
  cciValue: number | null
  cciMeasure: string
  cciUnitLabel: string
  cciSource: string
  termVi: string
  termEn: string
  promptVi: string | null
  promptEn: string | null
  tc: number | null
  lc: number | null
  tl: number | null
  cvrValue: number | null
  cvrMeasure: string
  cvrUnitLabel: string
  cpdValue: number | null
  audioViAssetId: string | null
  audioEnAssetId: string | null
}

export function deriveCpd(cvr: number | null | undefined, cci: number | null | undefined): number | null {
  if (cvr == null || cci == null) return null
  return Math.round(cvr * cci * 100) / 100
}

export function liveTestExternalRef(itemId: string): string {
  return `live-test-item:${itemId}`
}

export function liveTestItemIdFromExternalRef(ref: string | null | undefined): string | null {
  if (!ref?.startsWith('live-test-item:')) return null
  return ref.slice('live-test-item:'.length) || null
}

export function promptForLanguage(item: LiveTestItem, language: PromptLanguage): string | null {
  return language === 'en' ? item.promptEn : item.promptVi
}

export function audioAssetIdForLanguage(item: LiveTestItem, language: PromptLanguage): string | null {
  return language === 'en' ? item.audioEnAssetId : item.audioViAssetId
}

export function introTextForLanguage(block: LiveTestBlock, language: PromptLanguage): string | null {
  return language === 'en' ? block.introTextEn : block.introTextVi
}

export function introAudioAssetIdForLanguage(block: LiveTestBlock, language: PromptLanguage): string | null {
  return language === 'en' ? block.introAudioEnAssetId : block.introAudioViAssetId
}

function unitRange(min: number | null | undefined, max: number | null | undefined, unit: string): string {
  if (min == null && max == null) return '—'
  if (min === max || max == null) return `${min}${unit}`
  if (min == null) return `${max}${unit}`
  return `${min}–${max}${unit}`
}

export function blockSummary(block: LiveTestBlock): string {
  return `CCI ${unitRange(block.cciMin, block.cciMax, 'A')} · CVR ${unitRange(block.cvrMin, block.cvrMax, ' Ω')} · CPD ${unitRange(block.cpdMin, block.cpdMax, 'V')}`
}
