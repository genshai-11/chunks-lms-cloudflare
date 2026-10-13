import { useEffect, useRef } from 'react'
import type { CaptureSessionState } from '../modules/assessment/session-capture'
import { sessionColorSummary } from '../modules/assessment/session-capture'
import { calculateSpectrumStepBreakdown } from '../modules/metrics/calculate'
import { probeChunksNumber } from '../modules/assessment/probe-metrics'
import { SPECTRUM_COLORS } from '../modules/result-lifecycle/types'
import { ScreenTooltip } from './ScreenTooltip'

type Props = {
  capture: CaptureSessionState
  currentQuestionIndex: number
  learnerName: (userId: string) => string
  onSelectQuestion: (questionIndex: number) => void
  /** Vertical column (left rail) vs horizontal strip */
  layout?: 'column' | 'row'
  children?: React.ReactNode
}

/**
 * Compact Q map + RFC/%c counts. Column mode for left rail.
 */
export function ObserveHeatmap({
  capture,
  currentQuestionIndex,
  learnerName,
  onSelectQuestion,
  layout = 'column',
  children,
}: Props) {
  const summary = sessionColorSummary(capture)
  const finalizedAttempts = capture.attempts.filter(
    (a) =>
      (a.snapshot.status === 'finalized' || a.snapshot.status === 'corrected') &&
      a.snapshot.effectiveColor,
  )
  const spectrum = calculateSpectrumStepBreakdown(
    finalizedAttempts.map((a) => ({
      effectiveColor: a.snapshot.effectiveColor!,
      enteredProbeFlow: a.snapshot.enteredProbeFlow,
      probeEventCount: a.snapshot.probeCount,
    })),
  )
  const nTotal = spectrum.totalRecords
  const rfcPct = spectrum.rfc == null ? 0 : Math.round(spectrum.rfc * 100)
  const racPct = spectrum.avgPercentX == null ? 0 : Math.round(spectrum.avgPercentX)
  const legacyRacPct = spectrum.rac == null ? 0 : Math.round(spectrum.rac * 100)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const activeEl = containerRef.current.querySelector('.observe-heat-dot-btn.is-current')
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentQuestionIndex])

  return (
    <div className={`observe-heat layout-${layout}`}>
      <div className="observe-heat-summary" aria-label="Session summary">
        <ScreenTooltip
          ariaLabel={`Struggle RFC: ${nTotal ? `${rfcPct}%` : '—'}`}
          className="observe-heat-metric w-full flex items-center justify-between cursor-help"
          width={290}
          content={
            <>
              <span className="observe-tooltip-header">
                <span>Struggle (RFC)</span>
                <span className="font-mono text-amber-300 font-bold">{nTotal ? `${rfcPct}%` : '—'}</span>
              </span>
              <span className="observe-tooltip-divider" />
              <span className="observe-tooltip-body">
                <span className="observe-tooltip-row">
                  <span className="observe-tooltip-key">Formula:</span>
                  <span className="observe-tooltip-val font-mono text-[10px]">warm records / N_total</span>
                </span>
                <span className="observe-tooltip-row">
                  <span className="observe-tooltip-key">Warm steps:</span>
                  <span className="observe-tooltip-val">
                    {spectrum.warmSteps} / {nTotal}{' '}
                    <span className="text-slate-400 font-normal">(Red + Orange + Yellow)</span>
                  </span>
                </span>
                <span className="observe-tooltip-note">
                  Lower RFC indicates less observed struggle.
                </span>
              </span>
            </>
          }
        >
          <span>RFC</span>
          <strong>{nTotal ? `${rfcPct}%` : '—'}</strong>
        </ScreenTooltip>

        <ScreenTooltip
          ariaLabel={`Awareness / Success (%c): ${nTotal ? `${racPct}%` : '—'}`}
          className="observe-heat-metric muted w-full flex items-center justify-between cursor-help"
          width={310}
          content={
            <>
              <span className="observe-tooltip-header">
                <span>Awareness / Success (%c)</span>
                <span className="font-mono text-emerald-300 font-bold">{nTotal ? `${racPct}%` : '—'}</span>
              </span>
              <span className="observe-tooltip-divider" />
              <span className="observe-tooltip-body">
                <span className="observe-tooltip-row">
                  <span className="observe-tooltip-key">Formula:</span>
                  <span className="observe-tooltip-val font-mono text-[10px]">Avg %x = sum(%x) / N_total</span>
                </span>
                <span className="observe-tooltip-row">
                  <span className="observe-tooltip-key">7-color weighted:</span>
                  <span className="observe-tooltip-val">
                    {spectrum.sumPercentX.toFixed(1)}% / {nTotal} = {(spectrum.avgPercentX ?? 0).toFixed(1)}%
                  </span>
                </span>
                <span className="observe-tooltip-row">
                  <span className="observe-tooltip-key">Legacy RAC:</span>
                  <span className="observe-tooltip-val">
                    {legacyRacPct}%{' '}
                    <span className="text-slate-400 font-normal">
                      ({spectrum.coolSteps}/{nTotal} cool records)
                    </span>
                  </span>
                </span>
                <span className="observe-tooltip-note">
                  Weights: Red 0%, Orange 17%, Yellow 34%, Green 50%, Blue 67%, Indigo 84%, Purple 100%.
                </span>
              </span>
            </>
          }
        >
          <span>%c</span>
          <strong>{nTotal ? `${racPct}%` : '—'}</strong>
        </ScreenTooltip>

        <div
          className="observe-heat-counts observe-color-pills"
          aria-label="Recorded 7-color counts"
        >
          {SPECTRUM_COLORS.map((color) => (
            <span
              key={color}
              className={`observe-heat-count is-${color}`}
              title={`${color}: ${summary ? summary.recordedByColor[color] : 0} recorded steps${
                color === 'green' ? ' (Green probe openers)' : color === 'blue' ? ' (Continue probe steps)' : ''
              }`}
            >
              <i aria-hidden />
              {summary ? summary.recordedByColor[color] : 0}
            </span>
          ))}
          <span
            className="observe-heat-count is-total"
            title={summary ? `N_total = primary + probe = ${summary.primaryRecords} + ${summary.probeRecords}` : 'N_total'}
          >
            Σ {summary ? summary.totalRecords : 0}
          </span>
        </div>
      </div>

      {children ? (
        <div className="observe-heat-hero">
          {children}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="observe-heat-grid"
        role="list"
        aria-label="Question map"
      >
        {capture.questions.map((q, i) => {
          const attempt = capture.attempts.find((a) => a.sessionQuestionId === q.id)
          const snap = attempt?.snapshot
          const color = snap?.effectiveColor ?? null
          const open = snap?.status === 'probe_open' || snap?.status === 'resolution_required'
          const draft = !snap || snap.status === 'draft'
          const active = i === currentQuestionIndex
          const cls = open ? 'is-open' : draft ? 'is-draft' : color ? `is-${color}` : 'is-empty'
          const chunksNumber = snap ? probeChunksNumber(snap) : null

          return (
            <button
              key={q.id}
              type="button"
              role="listitem"
              className={`observe-heat-dot-btn ${cls}${active ? ' is-current' : ''}`}
              aria-label={`Question ${q.sequenceNumber}, ${learnerName(
                q.assignedLearnerUserId,
              )}, ${color ?? (open ? 'probe open' : 'not assessed')}${
                chunksNumber != null ? `, chunks number=${chunksNumber}` : ''
              }`}
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelectQuestion(i)}
            >
              {q.sequenceNumber}
              {chunksNumber != null ? (
                <span className="observe-heat-probe-badge">n{chunksNumber}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
