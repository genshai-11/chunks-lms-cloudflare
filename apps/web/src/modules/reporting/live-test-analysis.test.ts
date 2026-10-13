import { describe, expect, it } from 'vitest'
import type { LiveTestItem } from '../assessment/live-test'
import type { ResultRecord } from './progress'
import { colorDistributionByBand, joinLiveTestResults } from './live-test-analysis'

function item(id: string, cvrValue: number, cciValue: number): LiveTestItem {
  return {
    id,
    blockId: 'block-1',
    itemNumber: Number(id.replace('item-', '')),
    sourceDay: null,
    sourceStt: null,
    unitOhm: cciValue,
    cciValue,
    cciMeasure: 'Unit (Ohm)',
    cciUnitLabel: 'CCI',
    cciSource: 'csv:Unit (Ohm)',
    termVi: 'Từ',
    termEn: 'Term',
    promptVi: 'Câu tiếng Việt',
    promptEn: 'English sentence',
    tc: null,
    lc: null,
    tl: null,
    cvrValue,
    cvrMeasure: 'Estimated TC × LC × TL',
    cvrUnitLabel: 'CVR',
    cpdValue: null,
    audioViAssetId: null,
    audioEnAssetId: null,
  }
}

function record(id: string, q: string, color: ResultRecord['effectiveColor']): ResultRecord {
  return {
    id,
    organizationId: 'org',
    courseId: 'course',
    classId: 'class',
    learningSessionId: 'session',
    learnerUserId: 'learner',
    teacherUserId: 'teacher',
    sessionQuestionId: q,
    effectiveColor: color,
    enteredProbeFlow: false,
    probeEventCount: 0,
    finalizedAt: '2026-07-17T00:00:00.000Z',
  }
}

describe('live-test analysis', () => {
  it('joins finalized records through session question external refs', () => {
    const joined = joinLiveTestResults({
      records: [record('r1', 'q1', 'green')],
      itemById: new Map([['item-1', item('item-1', 12, 5)]]),
      promptLanguage: 'en',
      externalRefByQuestionId: new Map([['q1', 'live-test-item:item-1']]),
    })
    expect(joined).toHaveLength(1)
    expect(joined[0]?.cpdValue).toBe(60)
    expect(joined[0]?.prompt).toBe('English sentence')
  })

  it('groups outcomes by CPD bands', () => {
    const rows = joinLiveTestResults({
      records: [record('r1', 'q1', 'red'), record('r2', 'q2', 'purple')],
      itemById: new Map([
        ['item-1', item('item-1', 3, 3)],
        ['item-2', item('item-2', 20, 7)],
      ]),
      promptLanguage: 'vi',
      externalRefByQuestionId: new Map([
        ['q1', 'live-test-item:item-1'],
        ['q2', 'live-test-item:item-2'],
      ]),
    })
    const bands = colorDistributionByBand(rows, 'cpdValue', { lowMax: 30, mediumMax: 100 })
    expect(bands.low.red).toBe(1)
    expect(bands.high.purple).toBe(1)
  })
})
