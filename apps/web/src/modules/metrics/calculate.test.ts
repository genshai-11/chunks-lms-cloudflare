import { describe, expect, it } from 'vitest'
import {
  calculateMetrics,
  calculateSpectrumStepBreakdown,
  compareEqualDurationWindows,
  spectrumRecordsForAttempt,
  COLOR_PERCENT_X,
  COLOR_PERCENT_X_VALUES,
  colorForAvgPercentX,
  type FinalizedAttempt,
} from './calculate'

function attempts(colors: Array<FinalizedAttempt['effectiveColor']>): FinalizedAttempt[] {
  return colors.map((effectiveColor) => ({
    effectiveColor,
    enteredProbeFlow: false,
    probeEventCount: 0,
  }))
}

describe('metric calculations', () => {
  it('calculates RFC and RAC from warm/cool spectrum colors', () => {
    const finalized = [
      ...Array.from({ length: 20 }, () => ({
        effectiveColor: 'red' as const,
        enteredProbeFlow: false,
        probeEventCount: 0,
      })),
      ...Array.from({ length: 7 }, () => ({
        effectiveColor: 'orange' as const,
        enteredProbeFlow: false,
        probeEventCount: 0,
      })),
      ...Array.from({ length: 50 }, () => ({
        effectiveColor: 'indigo' as const,
        enteredProbeFlow: false,
        probeEventCount: 0,
      })),
      ...Array.from({ length: 23 }, () => ({
        effectiveColor: 'purple' as const,
        enteredProbeFlow: false,
        probeEventCount: 0,
      })),
    ]
    const metrics = calculateMetrics(finalized)
    const breakdown = calculateSpectrumStepBreakdown(finalized)
    const rfc = metrics.find((m) => m.key === 'rfc')!
    const rac = metrics.find((m) => m.key === 'rac')!
    expect(rfc.value).toBeCloseTo(0.27)
    expect(breakdown.rac).toBeCloseTo(0.73)
    expect(rac.value).toBeCloseTo(0.6619)
    expect(rac.value).toBeCloseTo((breakdown.avgPercentX ?? 0) / 100)
    expect(rfc.sampleSize).toBe(100)
    expect(rac.sampleSize).toBe(100)
  })

  it('returns null for empty windows, never zero', () => {
    const metrics = calculateMetrics([])
    for (const m of metrics) {
      if (m.key === 'clarification_depth' || m.key === 'awareness_recovery') {
        expect(m.value).toBeNull()
      } else if (m.key === 'focus_stability') {
        expect(m.value).toBeNull()
      } else {
        expect(m.value).toBeNull()
      }
    }
  })

  it('clarification rate is zero when none probed; depth and recovery null', () => {
    const metrics = calculateMetrics(attempts(['red', 'green', 'purple']))
    expect(metrics.find((m) => m.key === 'clarification_rate')!.value).toBe(0)
    expect(metrics.find((m) => m.key === 'clarification_depth')!.value).toBeNull()
    expect(metrics.find((m) => m.key === 'awareness_recovery')!.value).toBeNull()
  })

  it('excludes non-finalized attempts by construction (caller only passes finalized)', () => {
    // Open probes must not be in the array — domain invariant at call site
    const metrics = calculateMetrics(
      attempts(['indigo']).map((a) => ({ ...a, enteredProbeFlow: true, probeEventCount: 2 })),
    )
    expect(metrics.find((m) => m.key === 'clarification_rate')!.value).toBe(1)
    expect(metrics.find((m) => m.key === 'clarification_depth')!.value).toBe(3)
    expect(metrics.find((m) => m.key === 'n_count')!.value).toBe(1)
    expect(metrics.find((m) => m.key === 'n_depth_max')!.value).toBe(3)
    expect(metrics.find((m) => m.key === 'n_depth_avg')!.value).toBe(3)
    expect(metrics.find((m) => m.key === 'awareness_recovery')!.value).toBe(1)
  })

  it('chunks number max and avg start at 1 for Green and use real probe depths only', () => {
    const metrics = calculateMetrics([
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 9 },
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 1 },
      { effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 },
    ])
    expect(metrics.find((m) => m.key === 'n_count')!.value).toBe(2)
    expect(metrics.find((m) => m.key === 'n_depth_max')!.value).toBe(10)
    expect(metrics.find((m) => m.key === 'n_depth_avg')!.value).toBeCloseTo(6)
  })

  it('compares equal-duration windows with percentage-point deltas', () => {
    const current = attempts(['indigo', 'indigo', 'red', 'red'])
    const previous = attempts(['indigo', 'red', 'red', 'red'])
    const cmp = compareEqualDurationWindows(current, previous)
    // current RAC (Avg %x) 0.42 (sum 168/4 = 42%), previous RAC 0.21 (sum 84/4 = 21%) → +21 pp
    expect(cmp.deltas.rac).toBeCloseTo(21)
    expect(compareEqualDurationWindows(current, null).previous).toBeNull()
  })

  it('uses N_total = primary attempts + probe steps for RFC and RAC', () => {
    const metrics = calculateMetrics([
      { effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'orange', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 0 },
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 2 },
    ])
    const rfc = metrics.find((m) => m.key === 'rfc')!
    const rac = metrics.find((m) => m.key === 'rac')!
    expect(rfc.sampleSize).toBe(7)
    expect(rfc.value).toBeCloseTo(3 / 7)
    // Avg %x = (0 + 17 + 84 + 201) / 7 = 302 / 7. rac = (302 / 7) / 100 = 302 / 700
    expect(rac.value).toBeCloseTo(302 / 700)
  })

  it('returns spectrum.avgPercentX / 100 for rac in calculateMetrics', () => {
    const finalized: FinalizedAttempt[] = [
      { effectiveColor: 'green', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'purple', enteredProbeFlow: false, probeEventCount: 0 },
    ]
    const breakdown = calculateSpectrumStepBreakdown(finalized)
    const metrics = calculateMetrics(finalized)
    const rac = metrics.find((m) => m.key === 'rac')!
    expect(breakdown.avgPercentX).toBe(75)
    expect(breakdown.rac).toBe(1)
    expect(rac.value).toBe(0.75)
    expect(rac.value).toBe(breakdown.avgPercentX! / 100)
    expect(rac.sampleSize).toBe(breakdown.totalRecords)
  })

  it('breaks down recorded 7-color steps for observe confirmation tooltips', () => {
    const breakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'orange', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 0 },
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 3 },
      { effectiveColor: 'purple', enteredProbeFlow: false, probeEventCount: 0 },
    ])

    expect(breakdown.byColor).toMatchObject({
      red: 1,
      orange: 1,
      yellow: 1,
      green: 2,
      blue: 2,
      indigo: 1,
      purple: 1,
    })
    expect(breakdown.primaryRecords).toBe(5)
    expect(breakdown.probeRecords).toBe(4)
    expect(breakdown.totalRecords).toBe(9)
    expect(breakdown.rfc).toBeCloseTo(3 / 9)
    expect(breakdown.rac).toBeCloseTo(6 / 9)
    expect(breakdown.sumPercentX).toBe(469)
    expect(breakdown.avgPercentX).toBeCloseTo(469 / 9)
  })

  it('calculates sumPercentX and avgPercentX correctly across various sequences', () => {
    // 1. Empty attempts: totalRecords = 0, sumPercentX = 0, avgPercentX = null
    const emptyBreakdown = calculateSpectrumStepBreakdown([])
    expect(emptyBreakdown.totalRecords).toBe(0)
    expect(emptyBreakdown.sumPercentX).toBe(0)
    expect(emptyBreakdown.avgPercentX).toBeNull()

    // 2. Single direct attempts:
    // Purple (100%)
    const purpleBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'purple', enteredProbeFlow: false, probeEventCount: 0 },
    ])
    expect(purpleBreakdown.totalRecords).toBe(1)
    expect(purpleBreakdown.sumPercentX).toBe(100)
    expect(purpleBreakdown.avgPercentX).toBe(100)

    // Red (0%)
    const redBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 },
    ])
    expect(redBreakdown.totalRecords).toBe(1)
    expect(redBreakdown.sumPercentX).toBe(0)
    expect(redBreakdown.avgPercentX).toBe(0)

    // Green without probe (50%)
    const greenBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'green', enteredProbeFlow: false, probeEventCount: 0 },
    ])
    expect(greenBreakdown.totalRecords).toBe(1)
    expect(greenBreakdown.sumPercentX).toBe(50)
    expect(greenBreakdown.avgPercentX).toBe(50)

    // 3. Probed attempt: Yellow fail (green 50% + yellow 34% = sum 84%, avg 42%)
    const yellowFailBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 0 },
    ])
    expect(yellowFailBreakdown.totalRecords).toBe(2)
    expect(yellowFailBreakdown.sumPercentX).toBe(84)
    expect(yellowFailBreakdown.avgPercentX).toBe(42)

    // 4. Probed attempt with continue: green (50%) + blue (67%) + indigo (84%) = sum 201%, avg 67%
    const continueBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 2 },
    ])
    expect(continueBreakdown.totalRecords).toBe(3)
    expect(continueBreakdown.sumPercentX).toBe(201)
    expect(continueBreakdown.avgPercentX).toBe(67)

    // 5. Mixed sequence with 9 steps:
    // red (0) + orange (17) + yellow (34) + 2 green (100) + 2 blue (134) + indigo (84) + purple (100)
    // sum = 469%, avg = 469/9 = 52.11%
    const mixedBreakdown = calculateSpectrumStepBreakdown([
      { effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'orange', enteredProbeFlow: false, probeEventCount: 0 },
      { effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 0 },
      { effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 3 },
      { effectiveColor: 'purple', enteredProbeFlow: false, probeEventCount: 0 },
    ])
    expect(mixedBreakdown.totalRecords).toBe(9)
    expect(mixedBreakdown.sumPercentX).toBe(469)
    expect(mixedBreakdown.avgPercentX).toBeCloseTo(469 / 9)
    expect((mixedBreakdown.avgPercentX ?? 0).toFixed(2)).toBe('52.11')
  })

  it('exports valid COLOR_PERCENT_X and COLOR_PERCENT_X_VALUES constants', () => {
    expect(COLOR_PERCENT_X).toEqual({
      red: 0,
      orange: 0.17,
      yellow: 0.34,
      green: 0.5,
      blue: 0.67,
      indigo: 0.84,
      purple: 1,
    })
    expect(COLOR_PERCENT_X_VALUES).toEqual({
      red: 0,
      orange: 17,
      yellow: 34,
      green: 50,
      blue: 67,
      indigo: 84,
      purple: 100,
    })
  })

  it('maps avg %x correctly to nearest spectrum color bands', () => {
    // Red [0, 8.5)
    expect(colorForAvgPercentX(null)).toBe('red')
    expect(colorForAvgPercentX(0)).toBe('red')
    expect(colorForAvgPercentX(5)).toBe('red')
    expect(colorForAvgPercentX(8.4)).toBe('red')

    // Orange [8.5, 25.5) - user example: 14% -> orange
    expect(colorForAvgPercentX(8.5)).toBe('orange')
    expect(colorForAvgPercentX(14)).toBe('orange')
    expect(colorForAvgPercentX(17)).toBe('orange')
    expect(colorForAvgPercentX(25.4)).toBe('orange')

    // Yellow [25.5, 42.0)
    expect(colorForAvgPercentX(25.5)).toBe('yellow')
    expect(colorForAvgPercentX(34)).toBe('yellow')
    expect(colorForAvgPercentX(41.9)).toBe('yellow')

    // Green [42.0, 58.5)
    expect(colorForAvgPercentX(42.0)).toBe('green')
    expect(colorForAvgPercentX(50)).toBe('green')
    expect(colorForAvgPercentX(58.4)).toBe('green')

    // Blue [58.5, 75.5)
    expect(colorForAvgPercentX(58.5)).toBe('blue')
    expect(colorForAvgPercentX(67)).toBe('blue')
    expect(colorForAvgPercentX(75.4)).toBe('blue')

    // Indigo [75.5, 92.0)
    expect(colorForAvgPercentX(75.5)).toBe('indigo')
    expect(colorForAvgPercentX(84)).toBe('indigo')
    expect(colorForAvgPercentX(91.9)).toBe('indigo')

    // Purple [92.0, 100]
    expect(colorForAvgPercentX(92.0)).toBe('purple')
    expect(colorForAvgPercentX(95)).toBe('purple')
    expect(colorForAvgPercentX(100)).toBe('purple')
  })

  it('expands finalized attempts into chronological N_total records', () => {
    expect(spectrumRecordsForAttempt({ effectiveColor: 'red', enteredProbeFlow: false, probeEventCount: 0 })).toEqual(['red'])
    expect(spectrumRecordsForAttempt({ effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 0 })).toEqual(['green', 'yellow'])
    expect(spectrumRecordsForAttempt({ effectiveColor: 'yellow', enteredProbeFlow: true, probeEventCount: 1 })).toEqual(['green', 'blue', 'yellow'])
    expect(spectrumRecordsForAttempt({ effectiveColor: 'indigo', enteredProbeFlow: true, probeEventCount: 3 })).toEqual(['green', 'blue', 'blue', 'indigo'])
  })
})
