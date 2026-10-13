import { describe, expect, it } from 'vitest'
import {
  deriveCpd,
  liveTestExternalRef,
  liveTestItemIdFromExternalRef,
  promptForLanguage,
  type LiveTestItem,
} from './live-test'

const item: LiveTestItem = {
  id: 'item-1',
  blockId: 'block-1',
  itemNumber: 1,
  sourceDay: 'Day 2',
  sourceStt: 'Session 1',
  unitOhm: 3,
  cciValue: 3,
  cciMeasure: 'Unit (Ohm)',
  cciUnitLabel: 'CCI',
  cciSource: 'csv:Unit (Ohm)',
  termVi: 'Cảnh sát giao thông',
  termEn: 'Traffic police',
  promptVi: 'Sáng nay, Cảnh sát giao thông đứng gần nhà tôi.',
  promptEn: 'This morning, the traffic police stood near my house.',
  tc: 3,
  lc: 1,
  tl: 1,
  cvrValue: 3,
  cvrMeasure: 'Estimated TC × LC × TL',
  cvrUnitLabel: 'CVR',
  cpdValue: 9,
  audioViAssetId: null,
  audioEnAssetId: null,
}

describe('live-test helpers', () => {
  it('derives CPD from CVR times CCI', () => {
    expect(deriveCpd(12, 5)).toBe(60)
    expect(deriveCpd(12.345, 5)).toBe(61.73)
    expect(deriveCpd(null, 5)).toBeNull()
  })

  it('uses stable live-test external refs', () => {
    const ref = liveTestExternalRef('abc')
    expect(ref).toBe('live-test-item:abc')
    expect(liveTestItemIdFromExternalRef(ref)).toBe('abc')
    expect(liveTestItemIdFromExternalRef('other:abc')).toBeNull()
  })

  it('selects the prompt by live-test prompt language', () => {
    expect(promptForLanguage(item, 'vi')).toBe(item.promptVi)
    expect(promptForLanguage(item, 'en')).toBe(item.promptEn)
  })
})
