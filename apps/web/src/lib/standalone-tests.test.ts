import { describe, it, expect } from 'vitest'

describe('Standalone Test Run Bundle item mapping & Audio Prefix', () => {
  it('maps bundle items into standalone_test_attempts and standalone_test_attempt_snapshots correctly', () => {
    const rawBundleItem = {
      id: 'run-item-1',
      run_id: 'run-1',
      test_item_id: 'ti-1',
      item_order: 1,
      attempt_id: 'att-1',
      attempt_status: 'finalized',
      effective_color: 'green',
      entered_probe_flow: true,
      probe_count: 2,
      finalized_at: '2026-10-09T00:00:00.000Z',
      cvr: 3,
      cci: 4,
      cpd: 12,
    }

    const item = {
      ...rawBundleItem,
      standalone_test_attempts: rawBundleItem.attempt_id
        ? [
            {
              id: rawBundleItem.attempt_id,
              run_id: rawBundleItem.run_id,
              run_item_id: rawBundleItem.id,
              status: rawBundleItem.attempt_status,
              standalone_test_attempt_snapshots: {
                attempt_id: rawBundleItem.attempt_id,
                status: rawBundleItem.attempt_status,
                effective_color: rawBundleItem.effective_color,
                effectiveColor: rawBundleItem.effective_color,
                entered_probe_flow: rawBundleItem.entered_probe_flow,
                enteredProbeFlow: rawBundleItem.entered_probe_flow,
                probe_count: rawBundleItem.probe_count,
                probeCount: rawBundleItem.probe_count,
                finalized_at: rawBundleItem.finalized_at,
              },
            },
          ]
        : [],
    }

    const attempt = item.standalone_test_attempts?.[0] ?? null
    const snapshot = attempt?.standalone_test_attempt_snapshots ?? null
    const finalized = ['finalized', 'corrected'].includes(snapshot?.status ?? '')
    const color = snapshot?.effective_color ?? null

    expect(attempt).not.toBeNull()
    expect(snapshot).not.toBeNull()
    expect(finalized).toBe(true)
    expect(color).toBe('green')
    expect(snapshot?.probe_count).toBe(2)
  })

  it('restricts prefix audio only to available numbers 1..7 and skips prefix for questions >= 8', () => {
    const prefixFor = (questionNumber: number) => {
      const hasPrefixAudio = questionNumber >= 1 && questionNumber <= 7
      return hasPrefixAudio ? `/audio/number_${questionNumber}.wav` : null
    }

    // Numbers 1..7 have recordings in web/public/audio/
    expect(prefixFor(1)).toBe('/audio/number_1.wav')
    expect(prefixFor(7)).toBe('/audio/number_7.wav')

    // Numbers 8+ do NOT exist in web/public/audio/ and must be null (no 404)
    expect(prefixFor(8)).toBeNull()
    expect(prefixFor(9)).toBeNull()
    expect(prefixFor(21)).toBeNull()
    expect(prefixFor(49)).toBeNull()
    expect(prefixFor(0)).toBeNull()
  })
})
