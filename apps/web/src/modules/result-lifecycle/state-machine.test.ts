import { describe, expect, it } from 'vitest'
import { applyLifecycleCommand, createDraftSnapshot, isFinalizedForMetrics } from './state-machine'
import { probeChunksNumber } from '../assessment/probe-metrics'

const at = '2026-07-11T10:00:00.000Z'

describe('result lifecycle state machine', () => {
  it('finalizes Red, Orange, and Purple directly', () => {
    for (const color of ['red', 'orange', 'purple'] as const) {
      const draft = createDraftSnapshot()
      const result = applyLifecycleCommand(draft, {
        type: 'record_provisional',
        color,
        at,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.snapshot.status).toBe('finalized')
      expect(result.snapshot.effectiveColor).toBe(color)
      expect(isFinalizedForMetrics(result.snapshot)).toBe(true)
      expect(result.events).toEqual(['provisional_recorded', 'result_finalized'])
    }
  })

  it('opens probe flow on Green and does not count until finalized', () => {
    const result = applyLifecycleCommand(createDraftSnapshot(), {
      type: 'record_provisional',
      color: 'green',
      at,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.status).toBe('probe_open')
    expect(result.snapshot.enteredProbeFlow).toBe(true)
    expect(isFinalizedForMetrics(result.snapshot)).toBe(false)
  })

  it('Green then Fail finalizes Yellow with history', () => {
    let snap = createDraftSnapshot()
    let r = applyLifecycleCommand(snap, { type: 'record_provisional', color: 'green', at })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    snap = r.snapshot
    r = applyLifecycleCommand(snap, { type: 'resolve_probe', outcome: 'fail', at })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.effectiveColor).toBe('yellow')
    expect(r.snapshot.status).toBe('finalized')
    expect(r.events).toContain('probe_failed')
  })

  it('Green then Done finalizes Indigo', () => {
    let snap = createDraftSnapshot()
    let r = applyLifecycleCommand(snap, { type: 'record_provisional', color: 'green', at })
    if (!r.ok) throw new Error(r.error)
    r = applyLifecycleCommand(r.snapshot, { type: 'resolve_probe', outcome: 'done', at })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.effectiveColor).toBe('indigo')
  })

  it('handles Yellow (Fail) without adding n: Green + Green + Yellow -> n=2, Green + Green + Indigo -> n=3', () => {
    // 1. Green (initial) + Green (continue) + Yellow (fail) -> n = 2
    let snap1 = createDraftSnapshot()
    let g1 = applyLifecycleCommand(snap1, { type: 'record_provisional', color: 'green', at })
    if (!g1.ok) throw new Error(g1.error)
    expect(probeChunksNumber(g1.snapshot)).toBe(1)

    let g2 = applyLifecycleCommand(g1.snapshot, { type: 'resolve_probe', outcome: 'continue', at })
    if (!g2.ok) throw new Error(g2.error)
    expect(probeChunksNumber(g2.snapshot)).toBe(2)

    let yellow = applyLifecycleCommand(g2.snapshot, { type: 'resolve_probe', outcome: 'fail', at })
    expect(yellow.ok).toBe(true)
    if (!yellow.ok) return
    expect(yellow.snapshot.effectiveColor).toBe('yellow')
    expect(yellow.snapshot.probeCount).toBe(1) // did not increment
    expect(probeChunksNumber(yellow.snapshot)).toBe(2) // n stays 2!

    // 2. Green (initial) + Green (continue) + Indigo (done) -> n = 3
    let snap2 = createDraftSnapshot()
    let a1 = applyLifecycleCommand(snap2, { type: 'record_provisional', color: 'green', at })
    if (!a1.ok) throw new Error(a1.error)

    let a2 = applyLifecycleCommand(a1.snapshot, { type: 'resolve_probe', outcome: 'continue', at })
    if (!a2.ok) throw new Error(a2.error)

    let indigo = applyLifecycleCommand(a2.snapshot, { type: 'resolve_probe', outcome: 'done', at })
    expect(indigo.ok).toBe(true)
    if (!indigo.ok) return
    expect(indigo.snapshot.effectiveColor).toBe('indigo')
    expect(indigo.snapshot.probeCount).toBe(2) // did increment
    expect(probeChunksNumber(indigo.snapshot)).toBe(3) // n increments to 3!

    // 3. User scenario: Green + Blue (continue) + Blue (continue) + Yellow (fail) -> n = 3 (NOT 4!)
    let snap3 = createDraftSnapshot()
    let c1 = applyLifecycleCommand(snap3, { type: 'record_provisional', color: 'green', at })
    if (!c1.ok) throw new Error(c1.error)
    expect(probeChunksNumber(c1.snapshot)).toBe(1) // Green: n=1

    let c2 = applyLifecycleCommand(c1.snapshot, { type: 'resolve_probe', outcome: 'continue', at })
    if (!c2.ok) throw new Error(c2.error)
    expect(probeChunksNumber(c2.snapshot)).toBe(2) // 1st Blue (Continue): n=2

    let c3 = applyLifecycleCommand(c2.snapshot, { type: 'resolve_probe', outcome: 'continue', at })
    if (!c3.ok) throw new Error(c3.error)
    expect(probeChunksNumber(c3.snapshot)).toBe(3) // 2nd Blue (Continue): n=3

    let cYellow = applyLifecycleCommand(c3.snapshot, { type: 'resolve_probe', outcome: 'fail', at })
    expect(cYellow.ok).toBe(true)
    if (!cYellow.ok) return
    expect(cYellow.snapshot.effectiveColor).toBe('yellow')
    expect(cYellow.snapshot.probeCount).toBe(2) // did NOT increment on fail!
    expect(probeChunksNumber(cYellow.snapshot)).toBe(3) // n MUST be 3, NEVER 4!
  })

  it('Continue is unlimited; probeCount tracks depth n without blocking', () => {
    let snap = createDraftSnapshot(2)
    let r = applyLifecycleCommand(snap, { type: 'record_provisional', color: 'green', at })
    if (!r.ok) throw new Error(r.error)

    for (let n = 1; n <= 5; n++) {
      r = applyLifecycleCommand(r.snapshot, { type: 'resolve_probe', outcome: 'continue', at })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.snapshot.probeCount).toBe(n)
      expect(r.snapshot.status).toBe('probe_open')
    }

    const done = applyLifecycleCommand(r.snapshot, {
      type: 'resolve_probe',
      outcome: 'done',
      at,
    })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.snapshot.effectiveColor).toBe('indigo')
    expect(done.snapshot.probeCount).toBe(6)
  })

  it('corrections require reason and preserve finalization path', () => {
    let r = applyLifecycleCommand(createDraftSnapshot(), {
      type: 'record_provisional',
      color: 'red',
      at,
    })
    if (!r.ok) throw new Error(r.error)

    const bad = applyLifecycleCommand(r.snapshot, {
      type: 'correct',
      color: 'purple',
      reason: '  ',
      at,
      actorId: 'user-1',
    })
    expect(bad.ok).toBe(false)

    r = applyLifecycleCommand(r.snapshot, {
      type: 'correct',
      color: 'purple',
      reason: 'Mis-tap',
      at,
      actorId: 'user-1',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.status).toBe('corrected')
    expect(r.snapshot.effectiveColor).toBe('purple')
    expect(isFinalizedForMetrics(r.snapshot)).toBe(true)
  })

  it('rejects probe on non-green draft path', () => {
    const r = applyLifecycleCommand(createDraftSnapshot(), {
      type: 'resolve_probe',
      outcome: 'done',
      at,
    })
    expect(r.ok).toBe(false)
  })
})
