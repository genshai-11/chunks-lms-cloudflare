import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleCloudTtsAdapter,
} from '../../../../supabase/functions/live-test-generation/adapters'
import {
  fetchFirestoreLessons,
  fetchFirestoreLessonChunks,
  generatePackageStructure,
  persistDraftPackage,
  calculateCvr,
  calculateCpd,
  calculateCciFromCpd,
  GREEN_TEST_SESSION_LANGUAGES_7X3,
  RED_TEST_SESSION_LANGUAGES_7X3,
  RED_TEST_HINT_PROGRESSION_7X3,
  type FirestoreLessonChunk,
} from '../../../../supabase/functions/live-test-generation/vocab-package-generator'

const mockChunks: FirestoreLessonChunk[] = [
  { chunkId: 'c1', english: 'Morning', vietnamese: 'Buổi sáng', category: 'vocab' },
  { chunkId: 'c2', english: 'Delicious', vietnamese: 'Ngon lành', category: 'vocab' },
  { chunkId: 'c3', english: 'Bicycle', vietnamese: 'Xe đạp', category: 'vocab' },
  { chunkId: 'c4', english: 'Ride', vietnamese: 'Đi xe', category: 'phrase' },
  { chunkId: 'c5', english: 'Book', vietnamese: 'Quyển sách', category: 'vocab' },
  { chunkId: 'c6', english: 'Read', vietnamese: 'Đọc', category: 'phrase' },
  { chunkId: 'c7', english: 'Music', vietnamese: 'Âm nhạc', category: 'vocab' },
  { chunkId: 'c8', english: 'Relax', vietnamese: 'Thư giãn', category: 'phrase' },
  { chunkId: 'c9', english: 'Family', vietnamese: 'Gia đình', category: 'vocab' },
  { chunkId: 'c10', english: 'Warm', vietnamese: 'Ấm áp', category: 'vocab' },
  { chunkId: 'c11', english: 'Park', vietnamese: 'Công viên', category: 'vocab' },
  { chunkId: 'c12', english: 'Run', vietnamese: 'Chạy', category: 'phrase' },
  { chunkId: 'c13', english: 'Beach', vietnamese: 'Bãi biển', category: 'vocab' },
  { chunkId: 'c14', english: 'Beautiful', vietnamese: 'Đẹp', category: 'vocab' },
]

describe('Google Cloud TTS Adapter with SSML Break Support', () => {
  it('detects plain text and sends { text } without altering voice', async () => {
    let capturedBody: any = null
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({ audioContent: btoa('mock-audio-data') }),
      }
    })

    const adapter = createGoogleCloudTtsAdapter({ apiKey: 'test-key' }, mockFetch as any)
    const result = await adapter.generateSpeech({
      text: 'Good morning',
      language: 'en',
      voiceId: 'google/en-US-Journey-F',
    })

    expect(result.format).toBe('mp3')
    expect(capturedBody.input).toEqual({ text: 'Good morning' })
    expect(capturedBody.voice.name).toBe('en-US-Journey-F')
    expect(result.providerMetadata.isSsml).toBe(false)
  })

  it('detects SSML tags and falls back from Journey voice to Neural2', async () => {
    let capturedBody: any = null
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({ audioContent: btoa('mock-audio-data') }),
      }
    })

    const adapter = createGoogleCloudTtsAdapter({ apiKey: 'test-key' }, mockFetch as any)
    const ssmlText = '<s>Morning</s> <break time="650ms"/> <s>Delicious</s>'
    const result = await adapter.generateSpeech({
      text: ssmlText,
      language: 'en',
      voiceId: 'google/en-US-Journey-F',
    })

    expect(capturedBody.input).toEqual({
      ssml: `<speak>${ssmlText}</speak>`,
    })
    // Journey must fallback to en-US-Neural2-F
    expect(capturedBody.voice.name).toBe('en-US-Neural2-F')
    expect(result.providerMetadata.isSsml).toBe(true)
    expect(result.providerMetadata.voiceName).toBe('en-US-Neural2-F')
  })

  it('detects SSML with Vietnamese language and falls back Journey to vi-VN-Neural2-A', async () => {
    let capturedBody: any = null
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({ audioContent: btoa('mock-audio-data') }),
      }
    })

    const adapter = createGoogleCloudTtsAdapter({ apiKey: 'test-key' }, mockFetch as any)
    const ssmlText = '<speak><s>Buổi sáng</s> <break time="650ms"/> <s>Ngon lành</s></speak>'
    const result = await adapter.generateSpeech({
      text: ssmlText,
      language: 'vi',
      voiceId: 'google/vi-VN-Journey-D',
    })

    expect(capturedBody.input).toEqual({ ssml: ssmlText })
    expect(capturedBody.voice.name).toBe('vi-VN-Neural2-A')
    expect(result.providerMetadata.isSsml).toBe(true)
  })
})

describe('Firestore Vocab Ingestion', () => {
  it('parses and sorts lessons by levelCode and dayNumber', async () => {
    const mockResponse = {
      documents: [
        {
          name: 'projects/p/databases/(default)/documents/lessons/level_b_day_2',
          fields: {
            id: { stringValue: 'level_b_day_2' },
            lesson_title: { stringValue: 'Day 2 Level B' },
            level_code: { stringValue: 'LEVEL_B' },
            day_number: { integerValue: '2' },
            total_chunks: { integerValue: '50' },
          },
        },
        {
          name: 'projects/p/databases/(default)/documents/lessons/level_a_day_10',
          fields: {
            id: { stringValue: 'level_a_day_10' },
            lesson_title: { stringValue: 'Day 10 Level A' },
            level_code: { stringValue: 'LEVEL_A' },
            day_number: { integerValue: '10' },
            total_chunks: { integerValue: '60' },
          },
        },
        {
          name: 'projects/p/databases/(default)/documents/lessons/level_a_day_1',
          fields: {
            id: { stringValue: 'level_a_day_1' },
            lesson_title: { stringValue: 'Day 1 Level A' },
            level_code: { stringValue: 'LEVEL_A' },
            day_number: { integerValue: '1' },
            total_chunks: { integerValue: '110' },
          },
        },
      ],
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })

    const lessons = await fetchFirestoreLessons('fake-key', mockFetch as any)
    expect(lessons).toHaveLength(3)
    // LEVEL_A day 1 comes before LEVEL_A day 10, which comes before LEVEL_B day 2
    expect(lessons[0].id).toBe('level_a_day_1')
    expect(lessons[0].dayNumber).toBe(1)
    expect(lessons[1].id).toBe('level_a_day_10')
    expect(lessons[1].dayNumber).toBe(10)
    expect(lessons[2].id).toBe('level_b_day_2')
    expect(lessons[2].levelCode).toBe('LEVEL_B')
  })

  it('paginates lessons using nextPageToken until exhausted', async () => {
    const page1 = {
      documents: [
        {
          name: 'projects/p/databases/(default)/documents/lessons/level_a_day_1',
          fields: { id: { stringValue: 'level_a_day_1' }, day_number: { integerValue: '1' }, level_code: { stringValue: 'A' } },
        },
      ],
      nextPageToken: 'token_page_2',
    }
    const page2 = {
      documents: [
        {
          name: 'projects/p/databases/(default)/documents/lessons/level_b_ere_day_1',
          fields: { id: { stringValue: 'level_b_ere_day_1' }, day_number: { integerValue: '1' }, level_code: { stringValue: 'B' } },
        },
      ],
    }

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 })

    const lessons = await fetchFirestoreLessons('fake-key', mockFetch as any)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(lessons).toHaveLength(2)
    expect(lessons.map((l) => l.id)).toEqual(['level_a_day_1', 'level_b_ere_day_1'])
  })

  it('parses lesson chunks correctly', async () => {
    const mockDoc = {
      fields: {
        chunks: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    chunk_id: { stringValue: 'chunk_01' },
                    english: { stringValue: 'Apple' },
                    vietnamese: { stringValue: 'Quả táo' },
                    category: { stringValue: 'noun' },
                  },
                },
              },
              {
                mapValue: {
                  fields: {
                    chunk_id: { stringValue: 'chunk_02' },
                    english: { stringValue: 'Eat' },
                    vietnamese: { stringValue: 'Ăn' },
                  },
                },
              },
            ],
          },
        },
      },
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDoc,
    })

    const chunks = await fetchFirestoreLessonChunks('level_a_day_1', 'fake-key', mockFetch as any)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({
      chunkId: 'chunk_01',
      english: 'Apple',
      vietnamese: 'Quả táo',
      category: 'noun',
    })
    expect(chunks[1]).toEqual({
      chunkId: 'chunk_02',
      english: 'Eat',
      vietnamese: 'Ăn',
      category: undefined,
    })
  })
})

describe('Dynamic Green & Red Test Package Generator', () => {
  it('generates Green Test with 1 chunk per item, TL=1.0, and progressive CVR', () => {
    const pkg = generatePackageStructure({
      testType: 'GREEN',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 42,
    })

    expect(pkg.testType).toBe('GREEN')
    expect(pkg.totalItems).toBe(42)
    expect(pkg.sections).toHaveLength(6) // 6 sessions x 7 items = 42

    // Check session 1
    const s1 = pkg.sections[0]
    expect(s1.items).toHaveLength(7)
    expect(s1.targetCvrOhm).toBeLessThanOrEqual(3) // Session 1-2: CVR 1-3 Ohm
    expect(s1.introTextVi).toContain('Session 1')
    expect(s1.introTextVi).toContain('Ohm')
    expect(s1.introTextVi).toContain('Ampe')

    // Every item in Green test has TL = 1.0 and plain prompts, no SSML
    for (const section of pkg.sections) {
      for (const item of section.items) {
        expect(item.tl).toBe(1.0)
        expect(item.measuredCvr).toBe(item.tc * item.lc * 1.0)
        expect(item.spokenScriptVi).toBeNull()
        expect(item.spokenScriptEn).toBeNull()
        expect(item.chunkIds).toHaveLength(1)
      }
    }

    // Progression: Session 1-2 (1-3 Ohm), Session 3-4 (5-7 Ohm), Session 5-6 (9-13 Ohm)
    expect(pkg.sections[0].targetCvrOhm).toBeGreaterThanOrEqual(1)
    expect(pkg.sections[0].targetCvrOhm).toBeLessThanOrEqual(3)
    expect(pkg.sections[2].targetCvrOhm).toBeGreaterThanOrEqual(5)
    expect(pkg.sections[2].targetCvrOhm).toBeLessThanOrEqual(7)
    expect(pkg.sections[5].targetCvrOhm).toBeGreaterThanOrEqual(9)
    expect(pkg.sections[5].targetCvrOhm).toBeLessThanOrEqual(13)

    // Lifecycle narration scripts
    expect(pkg.lifecycleNarration.package_start.vi).toContain('Green Test (Focus)')
    expect(pkg.lifecycleNarration.package_end.en).toContain('Green Test (Focus)')
    expect(pkg.lifecycleNarration.part_intro[1].vi).toBeDefined()
    expect(pkg.lifecycleNarration.part_intro[2].vi).toBeDefined()
    expect(pkg.lifecycleNarration.part_intro[3].vi).toBeDefined()
  })

  it('generates Red Test with 2-3 chunks per item, TL in [2.0, 3.0], SSML breaks, and target CPD 56V', () => {
    const pkg = generatePackageStructure({
      testType: 'RED',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 42,
      targetCpd: 56,
      packageCode: 'R01-42Q-56V',
    })

    expect(pkg.testType).toBe('RED')
    expect(pkg.packageCode).toBe('R01-42Q-56V')
    expect(pkg.totalItems).toBe(42)
    expect(pkg.sections).toHaveLength(6)

    for (const section of pkg.sections) {
      expect(section.items).toHaveLength(7)
      for (const item of section.items) {
        expect(item.tl).toBeGreaterThanOrEqual(2.0)
        expect(item.tl).toBeLessThanOrEqual(3.0)
        expect(item.chunkIds.length).toBeGreaterThanOrEqual(2)
        expect(item.chunkIds.length).toBeLessThanOrEqual(3)

        // SSML spoken scripts with break
        expect(item.spokenScriptEn).toContain('<speak>')
        expect(item.spokenScriptEn).toContain('<break time="650ms"/>')
        expect(item.spokenScriptEn).toContain('</speak>')
        expect(item.spokenScriptVi).toContain('<speak>')
        expect(item.spokenScriptVi).toContain('<break time="650ms"/>')
        expect(item.spokenScriptVi).toContain('</speak>')

        // Prompts combine chunks with /
        expect(item.promptEn).toContain(' / ')
        expect(item.promptVi).toContain(' / ')
      }
    }

    // Lifecycle narration scripts
    expect(pkg.lifecycleNarration.package_start.vi).toContain('Red Test (Awareness')
    expect(pkg.lifecycleNarration.package_end.en).toContain('Red Test (Awareness')
  })

  it('persists draft package to Supabase database tables', async () => {
    const pkg = generatePackageStructure({
      testType: 'GREEN',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 21,
    })

    const inserted: Record<string, any[]> = {
      test_packages: [],
      test_package_versions: [],
      test_sections: [],
      test_items: [],
    }

    const mockAdmin: any = {
      from: (table: string) => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { id: 'org-123' }, error: null }),
            }),
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { organization_id: 'org-123' }, error: null }),
            }),
          }),
        }),
        insert: (rows: any) => {
          const rowArr = Array.isArray(rows) ? rows : [rows]
          const withIds = rowArr.map((r) => ({ id: `uuid-${Math.random()}`, ...r }))
          inserted[table].push(...withIds)
          return {
            select: () => ({
              single: async () => ({ data: withIds[0], error: null }),
            }),
            then: (cb: any) => cb({ error: null }),
          }
        },
      }),
    }

    const receipt = await persistDraftPackage(pkg, 'user-actor-1', mockAdmin)
    expect(receipt.packageId).toBeDefined()
    expect(receipt.packageVersionId).toBeDefined()
    expect(receipt.itemsCount).toBe(21)
    expect(inserted.test_packages).toHaveLength(1)
    expect(inserted.test_package_versions).toHaveLength(1)
    expect(inserted.test_sections).toHaveLength(3)
    expect(inserted.test_items).toHaveLength(21)
  })

  it('generates 7x3 Mini Green Test with exactly 21 questions across 7 sessions, TL=1.0, and 12V CPD target', () => {
    const pkg = generatePackageStructure({
      testType: 'GREEN',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 21,
      sessionLayout: '7x3',
      sessionLanguages: GREEN_TEST_SESSION_LANGUAGES_7X3,
      targetCpd: 12,
      packageCode: 'G01-21Q-ECOMMERCE-1',
    })

    expect(pkg.testType).toBe('GREEN')
    expect(pkg.packageCode).toBe('G01-21Q-ECOMMERCE-1')
    expect(pkg.totalItems).toBe(21)
    expect(pkg.sessionLayout).toBe('7x3')
    expect(pkg.targetCpd).toBe(12)
    expect(pkg.sections).toHaveLength(7) // 7 sessions

    // Section languages preset: EN-VI-EN (S1-3 EN, S4-6 VI, S7 EN)
    expect(pkg.sessionLanguages).toEqual(GREEN_TEST_SESSION_LANGUAGES_7X3)

    for (let sIdx = 0; sIdx < pkg.sections.length; sIdx++) {
      const section = pkg.sections[sIdx]
      expect(section.items).toHaveLength(3) // 3 questions per session
      expect(section.sessionLanguage).toBe(GREEN_TEST_SESSION_LANGUAGES_7X3[sIdx])

      for (const item of section.items) {
        expect(item.tl).toBe(1.0)
        expect(item.chunkIds).toHaveLength(1)
        expect(item.spokenScriptVi).toBeNull()
        expect(item.spokenScriptEn).toBeNull()
        expect(item.cvrBreakdown).toBeDefined()
        expect(item.cvrBreakdown!.tl).toBe(1.0)
        expect(item.cvrBreakdown!.tc).toBe(section.targetCvrOhm)
        expect(item.cvrBreakdown!.cpd).toBe(12)
        expect(item.cvrBreakdown!.cvr * item.cvrBreakdown!.cci).toBeCloseTo(12, 1)
      }
    }

    // CVR progression across 7 sessions
    expect(pkg.sections[0].targetCvrOhm).toBeLessThanOrEqual(pkg.sections[6].targetCvrOhm)
  })

  it('generates 7x3 Mini Red Test with exact hint progression [2, 3, 4, 2, 3, 4, 4], 650ms SSML breaks, and 56V CPD', () => {
    const pkg = generatePackageStructure({
      testType: 'RED',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 21,
      sessionLayout: '7x3',
      sessionLanguages: RED_TEST_SESSION_LANGUAGES_7X3,
      targetCpd: 56,
      lexicalComplexity: 1.15,
      packageCode: 'R01-21Q-ECOMMERCE-56V-1',
    })

    expect(pkg.testType).toBe('RED')
    expect(pkg.packageCode).toBe('R01-21Q-ECOMMERCE-56V-1')
    expect(pkg.totalItems).toBe(21)
    expect(pkg.sessionLayout).toBe('7x3')
    expect(pkg.targetCpd).toBe(56)
    expect(pkg.sections).toHaveLength(7) // 7 sessions

    // Section languages preset: VI-EN-EN (S1-3 VI, S4-6 EN, S7 EN)
    expect(pkg.sessionLanguages).toEqual(RED_TEST_SESSION_LANGUAGES_7X3)

    const expectedHints = [2, 3, 4, 2, 3, 4, 4]
    expect(RED_TEST_HINT_PROGRESSION_7X3).toEqual(expectedHints)

    for (let sIdx = 0; sIdx < pkg.sections.length; sIdx++) {
      const section = pkg.sections[sIdx]
      const expectedHintCount = expectedHints[sIdx]

      expect(section.items).toHaveLength(3) // 3 questions per session
      expect(section.sessionLanguage).toBe(RED_TEST_SESSION_LANGUAGES_7X3[sIdx])

      for (const item of section.items) {
        // Exact hint count verification
        expect(item.chunkIds).toHaveLength(expectedHintCount)
        expect(item.tc).toBe(expectedHintCount)
        expect(item.promptEn.split(' / ')).toHaveLength(expectedHintCount)
        expect(item.promptVi.split(' / ')).toHaveLength(expectedHintCount)

        // Latency and CVR breakdown
        expect(item.tl).toBeGreaterThanOrEqual(2.0)
        expect(item.tl).toBeLessThanOrEqual(3.0)
        expect(item.cvrBreakdown).toBeDefined()
        expect(item.cvrBreakdown!.tc).toBe(expectedHintCount)
        expect(item.cvrBreakdown!.lc).toBe(1.15)
        expect(item.cvrBreakdown!.tl).toBe(item.tl)
        expect(item.cvrBreakdown!.cvr).toBe(Number((expectedHintCount * 1.15 * item.tl).toFixed(1)))

        // SSML spoken scripts with 650ms break between hints
        expect(item.spokenScriptEn).toContain('<speak>')
        expect(item.spokenScriptEn).toContain('</speak>')
        expect(item.spokenScriptVi).toContain('<speak>')
        expect(item.spokenScriptVi).toContain('</speak>')

        const breakCountEn = (item.spokenScriptEn!.match(/<break time="650ms"\/>/g) || []).length
        const breakCountVi = (item.spokenScriptVi!.match(/<break time="650ms"\/>/g) || []).length
        expect(breakCountEn).toBe(expectedHintCount - 1)
        expect(breakCountVi).toBe(expectedHintCount - 1)
      }
    }
  })

  it('persists 7x3 draft package to database with 7 test_sections, session_layout metadata, and cvr_breakdown', async () => {
    const pkg = generatePackageStructure({
      testType: 'RED',
      lessonId: 'level_a_day_1',
      chunks: mockChunks,
      targetQuestions: 21,
      sessionLayout: '7x3',
      sessionLanguages: RED_TEST_SESSION_LANGUAGES_7X3,
      targetCpd: 56,
      lexicalComplexity: 1.15,
      packageCode: 'R01-21Q-PERSIST',
    })

    const inserted: Record<string, any[]> = {
      test_packages: [],
      test_package_versions: [],
      test_sections: [],
      test_items: [],
    }

    const mockAdmin: any = {
      from: (table: string) => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { id: 'org-123' }, error: null }),
            }),
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { organization_id: 'org-123' }, error: null }),
            }),
          }),
        }),
        insert: (rows: any) => {
          const rowArr = Array.isArray(rows) ? rows : [rows]
          const withIds = rowArr.map((r) => ({ id: `uuid-${Math.random()}`, ...r }))
          inserted[table].push(...withIds)
          return {
            select: () => ({
              single: async () => ({ data: withIds[0], error: null }),
            }),
            then: (cb: any) => cb({ error: null }),
          }
        },
      }),
    }

    const receipt = await persistDraftPackage(pkg, 'user-actor-1', mockAdmin)
    expect(receipt.packageId).toBeDefined()
    expect(receipt.packageVersionId).toBeDefined()
    expect(receipt.itemsCount).toBe(21)
    expect(inserted.test_packages).toHaveLength(1)
    expect(inserted.test_package_versions).toHaveLength(1)
    expect(inserted.test_package_versions[0].source_metadata.sessionLayout).toBe('7x3')
    expect(inserted.test_package_versions[0].source_metadata.sessionLanguages).toEqual(RED_TEST_SESSION_LANGUAGES_7X3)
    expect(inserted.test_sections).toHaveLength(7) // 7 sections for 7x3
    expect(inserted.test_items).toHaveLength(21)

    // Verify sections have sessionLanguage stored in metadata
    for (let i = 0; i < 7; i++) {
      expect(inserted.test_sections[i].metadata.sessionLanguage).toBe(RED_TEST_SESSION_LANGUAGES_7X3[i])
    }

    // Verify items have cvr_breakdown stored
    for (const item of inserted.test_items) {
      expect(item.cvr_breakdown).toBeDefined()
      expect(item.cvr_breakdown.cvr).toBeDefined()
      expect(item.cvr_breakdown.cpd).toBeDefined()
    }
  })
})

describe('Cognitive Physics & Math Calculations', () => {
  it('calculates CVR correctly as TC * LC * TL', () => {
    // Green baseline: TC=1, LC=1.0, TL=1.0 -> 1.0 Ohm
    expect(calculateCvr(1, 1.0, 1.0)).toBe(1.0)
    // Green eCommerce: TC=1, LC=1.2, TL=1.0 -> 1.2 Ohm
    expect(calculateCvr(1, 1.2, 1.0)).toBe(1.2)
    // Red 2 hints: TC=2, LC=1.15, TL=2.5 -> 5.8 Ohm (rounded to 1 decimal)
    expect(calculateCvr(2, 1.15, 2.5)).toBe(5.8)
    // Red 4 hints: TC=4, LC=1.15, TL=2.0 -> 9.2 Ohm
    expect(calculateCvr(4, 1.15, 2.0)).toBe(9.2)
  })

  it('calculates CPD correctly as CVR * CCI', () => {
    // Green Focus: 3.0 Ohm * 4 Amps = 12.0 Volts
    expect(calculateCpd(3.0, 4)).toBe(12.0)
    // Red Awareness: 7.0 Ohm * 8 Amps = 56.0 Volts
    expect(calculateCpd(7.0, 8)).toBe(56.0)
    // Intermediate: 5.8 Ohm * 10 Amps = 58.0 Volts
    expect(calculateCpd(5.8, 10)).toBe(58.0)
  })

  it('calculates CCI dynamically from target CPD and measured CVR', () => {
    // Target 12V CPD
    expect(calculateCciFromCpd(12, 2.0)).toBe(6) // 12 / 2 = 6 Amps
    expect(calculateCciFromCpd(12, 3.0)).toBe(4) // 12 / 3 = 4 Amps
    expect(calculateCciFromCpd(12, 4.0)).toBe(3) // 12 / 4 = 3 Amps
    expect(calculateCciFromCpd(12, 6.0)).toBe(2) // 12 / 6 = 2 Amps

    // Target 56V CPD
    expect(calculateCciFromCpd(56, 7.0)).toBe(8) // 56 / 7 = 8 Amps
    expect(calculateCciFromCpd(56, 9.2)).toBe(6) // 56 / 9.2 = 6.08 -> 6 Amps

    // Safety edge case
    expect(calculateCciFromCpd(12, 0)).toBe(1)
  })

  it('provides standard 7x3 presets for language and hints', () => {
    expect(GREEN_TEST_SESSION_LANGUAGES_7X3).toEqual([
      'en', 'en', 'en', 'vi', 'vi', 'vi', 'en',
    ])
    expect(RED_TEST_SESSION_LANGUAGES_7X3).toEqual([
      'vi', 'vi', 'vi', 'en', 'en', 'en', 'en',
    ])
    expect(RED_TEST_HINT_PROGRESSION_7X3).toEqual([
      2, 3, 4, 2, 3, 4, 4,
    ])
  })
})
