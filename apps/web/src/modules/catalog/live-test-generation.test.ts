import { describe, expect, it, vi } from 'vitest'
import {
  listFirestoreLessons,
  getFirestoreLessonChunks,
  generatePackageFromVocab,
} from './live-test-generation'
import * as supabaseLib from '../../lib/supabase'

describe('live-test-generation client bridge', () => {
  it('listFirestoreLessons calls edge function and returns lesson array', async () => {
    const mockLessons = [
      { id: 'level_a_day_1', lessonTitle: 'Day 1', levelCode: 'LEVEL_A', dayNumber: 1, totalChunks: 110 },
      { id: 'level_a_day_2', lessonTitle: 'Day 2', levelCode: 'LEVEL_A', dayNumber: 2, totalChunks: 115 },
    ]

    const mockInvoke = vi.fn().mockResolvedValue({
      data: mockLessons,
      error: null,
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      functions: { invoke: mockInvoke },
    } as any)

    const result = await listFirestoreLessons()
    expect(mockInvoke).toHaveBeenCalledWith('live-test-generation', {
      body: { action: 'listFirestoreLessons' },
    })
    expect(result).toEqual(mockLessons)
  })

  it('getFirestoreLessonChunks calls edge function with lessonId', async () => {
    const mockChunks = [
      { chunkId: 'c1', english: 'Table', vietnamese: 'Cái bàn', category: 'vocab' },
      { chunkId: 'c2', english: 'Chair', vietnamese: 'Cái ghế', category: 'vocab' },
    ]

    const mockInvoke = vi.fn().mockResolvedValue({
      data: mockChunks,
      error: null,
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      functions: { invoke: mockInvoke },
    } as any)

    const result = await getFirestoreLessonChunks('level_a_day_1')
    expect(mockInvoke).toHaveBeenCalledWith('live-test-generation', {
      body: { action: 'getFirestoreLessonChunks', lessonId: 'level_a_day_1' },
    })
    expect(result).toEqual(mockChunks)
  })

  it('generatePackageFromVocab delegates to edge function generatePackageFromVocab', async () => {
    const mockResponse = {
      packageId: 'pkg-123',
      packageVersionId: 'ver-456',
      title: 'R01-42Q-56V',
      itemsCount: 42,
    }

    const mockInvoke = vi.fn().mockResolvedValue({
      data: mockResponse,
      error: null,
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      functions: { invoke: mockInvoke },
    } as any)

    const result = await generatePackageFromVocab({
      testType: 'RED',
      lessonId: 'level_a_day_1',
      targetQuestions: 42,
      targetCpd: 56,
      packageCode: 'R01-42Q-56V',
      title: 'R01-42Q-56V',
      saveDraft: true,
    })

    expect(mockInvoke).toHaveBeenCalledWith('live-test-generation', {
      body: expect.objectContaining({
        action: 'generatePackageFromVocab',
        testType: 'RED',
        lessonId: 'level_a_day_1',
        targetQuestions: 42,
        targetCpd: 56,
        packageCode: 'R01-42Q-56V',
        title: 'R01-42Q-56V',
        saveDraft: true,
      }),
    })
    expect(result).toEqual(mockResponse)
  })

  it('synthesizeSpeech invokes edge function synthesizeSpeech', async () => {
    const mockTtsResult = {
      audioContent: 'AAAA',
      mimeType: 'audio/mpeg',
    }

    const mockInvoke = vi.fn().mockResolvedValue({
      data: mockTtsResult,
      error: null,
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      functions: { invoke: mockInvoke },
    } as any)

    const { synthesizeSpeech } = await import('./live-test-generation')
    const result = await synthesizeSpeech({
      text: 'Hello world',
      language: 'en',
      voiceId: 'google/en-US-Neural2-F',
    })

    expect(mockInvoke).toHaveBeenCalledWith('live-test-generation', {
      body: {
        action: 'synthesizeSpeech',
        text: 'Hello world',
        language: 'en',
        voiceId: 'google/en-US-Neural2-F',
      },
    })
    expect(result.audioContent).toBe('AAAA')
    expect(result.mimeType).toBe('audio/mpeg')
  })

  it('playGoogleCloudTts constructs Audio and plays base64 data', async () => {
    const mockTtsResult = {
      audioContent: 'AAAA',
      mimeType: 'audio/mpeg',
    }

    const mockInvoke = vi.fn().mockResolvedValue({
      data: mockTtsResult,
      error: null,
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      functions: { invoke: mockInvoke },
    } as any)

    let createdAudioSrc = ''
    const playMock = vi.fn().mockResolvedValue(undefined)

    // Mock Audio global
    vi.stubGlobal('Audio', class MockAudio {
      src: string
      onended: (() => void) | null = null
      onerror: ((e: any) => void) | null = null
      constructor(src: string) {
        this.src = src
        createdAudioSrc = src
      }
      play() {
        if (this.onended) {
          setTimeout(this.onended, 10)
        }
        return playMock()
      }
    })

    const { playGoogleCloudTts } = await import('./live-test-generation')
    await playGoogleCloudTts('Xin chào', 'vi', 'google/vi-VN-Neural2-A')

    expect(playMock).toHaveBeenCalled()
    expect(createdAudioSrc).toBe('data:audio/mp3;base64,AAAA')
    vi.unstubAllGlobals()
  })
})
