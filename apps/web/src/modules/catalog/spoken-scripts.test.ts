import { describe, expect, it } from 'vitest'
import {
  audioReadiness,
  buildIntroSpokenScript,
  buildItemSpokenScript,
  narrationSourceHash,
  resolveItemSpokenScript,
  resolveNarrationRecord,
} from './spoken-scripts'

describe('spoken test scripts', () => {
  it('builds the complete Vietnamese intro', () => {
    expect(
      buildIntroSpokenScript({
        sectionOrder: 1,
        cvr: 3,
        cciAmpe: 2,
        cciName: 'Give it a shot',
        cciDescription: 'Linear 1 on 1 as Blow',
        language: 'vi',
      }),
    ).toBe('Session 1. CVR 3. CCI 2 Ampe. Give it a shot. Linear 1 on 1 as Blow. Bắt đầu.')
  })

  it('builds English and Vietnamese item ordinals', () => {
    expect(buildItemSpokenScript({ itemOrder: 1, prompt: 'Hello world.', language: 'en' })).toBe(
      'Number 1. Hello world.',
    )
    expect(buildItemSpokenScript({ itemOrder: 2, prompt: '  Xin   chào. ', language: 'vi' })).toBe(
      'Số 2. Xin chào.',
    )
  })

  it('uses a directly edited Câu ordinal as the exact spoken script', () => {
    expect(
      resolveItemSpokenScript({
        itemOrder: 1,
        prompt: 'Xin chào.',
        language: 'vi',
        override: '  Câu 1.  Xin chào. ',
      }),
    ).toBe('Câu 1. Xin chào.')
  })

  it('hashes final spoken text with language and voice', async () => {
    const one = await narrationSourceHash('Number 1. Hello.', 'en', 'alloy')
    const two = await narrationSourceHash('Number 2. Hello.', 'en', 'alloy')
    expect(one).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(one).not.toBe(two)
  })

  it('requires all eleven current approvals', () => {
    expect(audioReadiness(Array(11).fill('approved')).ready).toBe(true)
    expect(audioReadiness([...Array(10).fill('approved'), 'stale']).ready).toBe(false)
  })

  it('prefers an approved current variant over a newer rejected variant', () => {
    const record = (id: string, hash: string, status: string) =>
      ({
        variant: {
          id,
          narrationTarget: 'test_item',
          testItemId: 'item-1',
          sourceTextHash: hash,
          approvalStatus: status,
        },
        audio: null,
        job: null,
      }) as any
    const resolved = resolveNarrationRecord(
      [
        record('rejected-new', 'current', 'rejected'),
        record('approved-old', 'current', 'approved'),
      ],
      'item:item-1',
      'current',
    )
    expect(resolved?.variant.id).toBe('approved-old')
  })

  it('resolves package flow narration targets: package_start, part_intro, and package_end', () => {
    const record = (id: string, target: any, part?: number) =>
      ({
        variant: {
          id,
          narrationTarget: target,
          providerMetadata: part ? { part } : {},
          sourceTextHash: 'hash-1',
          approvalStatus: 'approved',
        },
        audio: null,
        job: null,
      }) as any

    const records = [
      record('start-1', 'package_start'),
      record('part-1', 'part_intro', 1),
      record('part-2', 'part_intro', 2),
      record('part-3', 'part_intro', 3),
      record('end-1', 'package_end'),
    ]

    expect(resolveNarrationRecord(records, 'package:start', 'hash-1')?.variant.id).toBe('start-1')
    expect(resolveNarrationRecord(records, 'part:1', 'hash-1')?.variant.id).toBe('part-1')
    expect(resolveNarrationRecord(records, 'part:2', 'hash-1')?.variant.id).toBe('part-2')
    expect(resolveNarrationRecord(records, 'part:3', 'hash-1')?.variant.id).toBe('part-3')
    expect(resolveNarrationRecord(records, 'package:end', 'hash-1')?.variant.id).toBe('end-1')
  })
})
