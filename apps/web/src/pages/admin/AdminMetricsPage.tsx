import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  LockKeyhole,
  Plus,
  Save,
  Sigma,
  Trash2,
  Undo2,
} from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { Flash } from '../../components/Flash'
import { useFlash } from '../../hooks/useFlash'
import type { MetricKey, MetricStatus } from '../../modules/metrics/calculate'
import { updateMetricSetting } from '../../modules/metrics/settings'
import {
  evaluateStandaloneFormula,
  type StandaloneFormulaContext,
  type StandaloneTestMetricSetting,
  type StandaloneTestMetricUnit,
} from '../../modules/metrics/standalone-settings'
import { useAppState } from '../../state/useAppState'

const UNIT_OPTIONS: Array<{ value: StandaloneTestMetricUnit; label: string }> = [
  { value: 'percent', label: 'Percent (%)' },
  { value: 'number', label: 'Number' },
  { value: 'ohm', label: 'CVR (\u03A9)' },
  { value: 'amp', label: 'CCI (A)' },
  { value: 'volt', label: 'CPD (V)' },
  { value: 'count', label: 'Count (records)' },
]

const FORMULA_REVIEW_CONTEXT: StandaloneFormulaContext = {
  rfc: 35,
  rac: 66.7,
  avgPercentX: 66.7,
  legacyRac: 65,
  avgCvr: 3.2,
  avgCci: 4.1,
  avgCpd: 42,
  acn: 1.7,
  nTotal: 49,
  warmSteps: 17,
  coolSteps: 32,
  finalized: 44,
  total: 49,
  sumPercentX: 3268.3,
  primaryRecords: 44,
  probeRecords: 5,
  enteredProbeCount: 4,
  redSteps: 3,
  orangeSteps: 5,
  yellowSteps: 9,
  greenSteps: 12,
  blueSteps: 10,
  indigoSteps: 6,
  purpleSteps: 4,
}

type StandaloneMetricDraft = Pick<StandaloneTestMetricSetting, 'label' | 'formula' | 'unit' | 'status' | 'definition'>

function toDraft(metric: StandaloneTestMetricSetting): StandaloneMetricDraft {
  return {
    label: metric.label,
    formula: metric.formula,
    unit: metric.unit,
    status: metric.status,
    definition: metric.definition,
  }
}

function emptyDraft(): StandaloneMetricDraft {
  return {
    label: '',
    formula: '',
    unit: 'number',
    status: 'experimental',
    definition: '',
  }
}

function formulaPreview(formula: string): { label: string; tone: 'success' | 'warning' } {
  const value = evaluateStandaloneFormula(formula, FORMULA_REVIEW_CONTEXT)
  if (value == null) return { label: 'Needs review', tone: 'warning' }
  const formatted = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)
  return { label: `Sample ${formatted}`, tone: 'success' }
}

function formulaIsValid(formula: string): boolean {
  return evaluateStandaloneFormula(formula, FORMULA_REVIEW_CONTEXT) != null
}

function statusLabel(status: MetricStatus): string {
  return status === 'operational' ? 'Operational' : 'Experimental'
}

const FORMULA_VARIABLE_GROUPS: Array<{
  category: string
  variables: Array<keyof StandaloneFormulaContext>
}> = [
  {
    category: 'Ratios & Percent',
    variables: ['rfc', 'rac', 'avgPercentX', 'legacyRac', 'sumPercentX'],
  },
  {
    category: 'Electrical & CPD',
    variables: ['avgCvr', 'avgCci', 'avgCpd', 'acn'],
  },
  {
    category: 'Counts & Probes',
    variables: ['nTotal', 'primaryRecords', 'probeRecords', 'enteredProbeCount', 'finalized', 'total'],
  },
  {
    category: 'Color Steps (7 bands)',
    variables: [
      'warmSteps',
      'coolSteps',
      'redSteps',
      'orangeSteps',
      'yellowSteps',
      'greenSteps',
      'blueSteps',
      'indigoSteps',
      'purpleSteps',
    ],
  },
]

export function AdminMetricsPage() {
  const { metricSettings, setMetricSettings } = useAppState()
  const { message, error, ok, err } = useFlash()
  const [selectedMetricKey, setSelectedMetricKey] = useState(
    metricSettings.standaloneTestMetrics[0]?.key ?? '',
  )
  const selectedMetric =
    metricSettings.standaloneTestMetrics.find((m) => m.key === selectedMetricKey) ??
    metricSettings.standaloneTestMetrics[0]
  const [draft, setDraft] = useState<StandaloneMetricDraft>(() =>
    selectedMetric ? toDraft(selectedMetric) : emptyDraft(),
  )
  const [draftForKey, setDraftForKey] = useState(selectedMetric?.key ?? '')
  const [activeFormulaTarget, setActiveFormulaTarget] = useState<'draft' | 'custom'>('draft')
  const [customLabel, setCustomLabel] = useState('')
  const [customFormula, setCustomFormula] = useState('')
  const [customUnit, setCustomUnit] = useState<StandaloneTestMetricUnit>('number')

  function insertVariable(varName: string) {
    if (activeFormulaTarget === 'custom') {
      setCustomFormula((prev) => (prev.trim() ? `${prev.trim()} + ${varName}` : varName))
      ok(`Inserted ${varName} into custom formula`)
    } else {
      setDraft((d) => ({
        ...d,
        formula: d.formula.trim() ? `${d.formula.trim()} + ${varName}` : varName,
      }))
      ok(`Inserted ${varName} into formula`)
    }
  }

  useEffect(() => {
    if (!selectedMetric || draftForKey === selectedMetric.key) return
    setDraft(toDraft(selectedMetric))
    setDraftForKey(selectedMetric.key)
  }, [draftForKey, selectedMetric])

  const reportEnabled = metricSettings.metrics.filter((m) => m.enabled).length
  const standaloneEnabled = metricSettings.standaloneTestMetrics.filter((m) => m.enabled).length
  const customCount = metricSettings.standaloneTestMetrics.filter((m) => m.custom).length
  const invalidFormulaCount = metricSettings.standaloneTestMetrics.filter((m) => !formulaIsValid(m.formula)).length
  const packageMetric = metricSettings.standaloneTestMetrics.find((m) => m.key === 'package_percent')
  const customFormulaPreview = useMemo(() => formulaPreview(customFormula), [customFormula])
  const draftPreview = useMemo(() => formulaPreview(draft.formula), [draft.formula])
  const labelLocked = selectedMetric?.key === 'package_percent'
  const isDirty = selectedMetric
    ? draft.label !== selectedMetric.label ||
      draft.formula !== selectedMetric.formula ||
      draft.unit !== selectedMetric.unit ||
      draft.status !== selectedMetric.status ||
      draft.definition !== selectedMetric.definition
    : false

  function toggle(key: MetricKey, enabled: boolean) {
    setMetricSettings(updateMetricSetting(metricSettings, key, { enabled }))
    ok(enabled ? `Enabled ${key}` : `Hidden ${key} from reports`)
  }

  function setStatus(key: MetricKey, status: MetricStatus) {
    setMetricSettings(updateMetricSetting(metricSettings, key, { status }))
    ok(`Marked ${key} as ${status}`)
  }

  function setMinSample(key: MetricKey, minSample: number) {
    if (minSample < 0 || Number.isNaN(minSample)) return err('Min sample must be >= 0')
    setMetricSettings(updateMetricSetting(metricSettings, key, { minSample }))
  }

  function toggleStandaloneMetric(key: string, enabled: boolean) {
    setMetricSettings({
      ...metricSettings,
      standaloneTestMetrics: metricSettings.standaloneTestMetrics.map((m) =>
        m.key === key ? { ...m, enabled } : m,
      ),
    })
    ok(enabled ? `Enabled ${key}` : `Hidden ${key} from Tests 1-1 analysis`)
  }

  function selectStandaloneMetric(metric: StandaloneTestMetricSetting) {
    setSelectedMetricKey(metric.key)
    setDraft(toDraft(metric))
    setDraftForKey(metric.key)
  }

  function saveStandaloneMetric() {
    if (!selectedMetric) return
    const nextLabel = draft.label.trim()
    const nextFormula = draft.formula.trim()
    const nextDefinition = draft.definition.trim()
    if (!labelLocked && !nextLabel) return err('Metric label is required')
    if (!nextFormula) return err('Formula is required')
    if (!formulaIsValid(nextFormula)) return err('Formula is not valid for the supported variables')
    const nextDraft: StandaloneMetricDraft = {
      label: labelLocked ? selectedMetric.label : nextLabel,
      formula: nextFormula,
      unit: draft.unit,
      status: draft.status,
      definition: nextDefinition,
    }
    setMetricSettings({
      ...metricSettings,
      standaloneTestMetrics: metricSettings.standaloneTestMetrics.map((m) =>
        m.key === selectedMetric.key
          ? {
              ...m,
              ...nextDraft,
            }
          : m,
      ),
    })
    setDraft(nextDraft)
    setDraftForKey(selectedMetric.key)
    ok(`Saved ${labelLocked ? selectedMetric.key : nextLabel}`)
  }

  function resetDraft() {
    if (!selectedMetric) return
    setDraft(toDraft(selectedMetric))
  }

  function addCustomMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = customLabel.trim()
    const formula = customFormula.trim()
    if (!label) return err('Custom metric label is required')
    if (!formula) return err('Custom metric formula is required')
    if (!formulaIsValid(formula)) return err('Formula is not valid for the supported variables')
    const baseKey =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'custom_metric'
    const existing = new Set(metricSettings.standaloneTestMetrics.map((m) => m.key))
    let key = `custom_${baseKey}`
    let suffix = 2
    while (existing.has(key)) {
      key = `custom_${baseKey}_${suffix}`
      suffix += 1
    }
    setMetricSettings({
      ...metricSettings,
      standaloneTestMetrics: [
        ...metricSettings.standaloneTestMetrics,
        {
          key,
          enabled: true,
          status: 'experimental',
          label,
          definition: 'Custom standalone Tests 1-1 metric.',
          formula,
          unit: customUnit,
          custom: true,
        },
      ],
    })
    setSelectedMetricKey(key)
    setDraft({ label, formula, unit: customUnit, status: 'experimental', definition: 'Custom standalone Tests 1-1 metric.' })
    setDraftForKey(key)
    setCustomLabel('')
    setCustomFormula('')
    setCustomUnit('number')
    ok(`Added ${label}`)
  }

  function deleteCustomMetric(key: string) {
    const remaining = metricSettings.standaloneTestMetrics.filter((m) => m.key !== key || !m.custom)
    setMetricSettings({
      ...metricSettings,
      standaloneTestMetrics: remaining,
    })
    if (selectedMetricKey === key) {
      const next = remaining[0]
      setSelectedMetricKey(next?.key ?? '')
      setDraft(next ? toDraft(next) : emptyDraft())
      setDraftForKey(next?.key ?? '')
    }
    ok(`Deleted ${key}`)
  }

  return (
    <div className="admin-metrics-page">
      <PageHeader
        icon={Gauge}
        title="Metrics"
        subtitle="Configure report metrics and standalone Tests 1-1 metric cards without redeploying."
      />
      <Flash message={message} error={error} />

      <section className="admin-metrics-overview" aria-label="Metrics configuration summary">
        <div className="admin-metrics-overview-card">
          <span>Report metrics</span>
          <strong>{reportEnabled}/{metricSettings.metrics.length}</strong>
          <small>Visible in charts and progress reports</small>
        </div>
        <div className="admin-metrics-overview-card">
          <span>Tests 1-1 cards</span>
          <strong>{standaloneEnabled}/{metricSettings.standaloneTestMetrics.length}</strong>
          <small>Runtime cards and Metrics menu</small>
        </div>
        <div className="admin-metrics-overview-card">
          <span>Package metric</span>
          <strong>%c/%r</strong>
          <small>{packageMetric?.formula ?? 'avgPercentX'}; R packages auto show %r</small>
        </div>
        <div className="admin-metrics-overview-card">
          <span>Custom metrics</span>
          <strong>{customCount}</strong>
          <small>Added at runtime, no redeploy needed</small>
        </div>
        <div className={`admin-metrics-overview-card ${invalidFormulaCount ? 'is-warning' : ''}`}>
          <span>Formula review</span>
          <strong>{invalidFormulaCount}</strong>
          <small>{invalidFormulaCount ? 'Invalid formulas need attention' : 'All formulas validate'}</small>
        </div>
      </section>

      <section className="admin-metrics-note">
        <Sigma className="h-4 w-4" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <strong>Formula variables</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Click any variable to insert into {activeFormulaTarget === 'custom' ? 'custom formula' : (selectedMetric ? `${selectedMetric.label} formula` : 'formula')}
            </span>
          </div>
          <div className="admin-var-groups">
            {FORMULA_VARIABLE_GROUPS.map((group) => (
              <div key={group.category} className="admin-var-group">
                <span className="admin-var-group-label">{group.category}</span>
                <div className="admin-var-chips">
                  {group.variables.map((name) => (
                    <button
                      type="button"
                      key={name}
                      className="admin-var-btn"
                      onClick={() => insertVariable(name)}
                      title={`Click to insert ${name} into ${activeFormulaTarget === 'custom' ? 'custom formula' : (selectedMetric?.label ?? 'formula')}`}
                    >
                      <code>{name}</code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-metrics-section">
        <header className="admin-metrics-section-head">
          <div>
            <span className="admin-metrics-section-kicker">Teacher/Learner reports</span>
            <h2>Report metric catalog</h2>
            <p>These metrics keep existing chart/report behavior. Use show/status/min sample for review gating.</p>
          </div>
          <BarChart3 className="h-5 w-5" />
        </header>

        <div className="table-wrap admin-metrics-report-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Show</th>
                <th scope="col">Status</th>
                <th scope="col" title="Minimum finalized sample before chart shows a value">
                  Min sample
                </th>
                <th scope="col">Definition / formula</th>
              </tr>
            </thead>
            <tbody>
              {metricSettings.metrics.map((m) => (
                <tr key={m.key}>
                  <td>
                    <strong>{m.label}</strong>
                    <code>{m.key}</code>
                  </td>
                  <td>
                    <label className="admin-metric-switch">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={(e) => toggle(m.key, e.target.checked)}
                        aria-label={`Show ${m.label}`}
                      />
                      {m.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      <span>{m.enabled ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td>
                    <select
                      value={m.status}
                      onChange={(e) => setStatus(m.key, e.target.value as MetricStatus)}
                      aria-label={`Status for ${m.label}`}
                    >
                      <option value="operational">Operational</option>
                      <option value="experimental">Experimental</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={m.minSample}
                      onChange={(e) => setMinSample(m.key, Number(e.target.value))}
                      aria-label={`Minimum sample for ${m.label}`}
                    />
                  </td>
                  <td className="def">{m.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-metrics-section">
        <header className="admin-metrics-section-head">
          <div>
            <span className="admin-metrics-section-kicker">Standalone Tests 1-1</span>
            <h2>Metric card editor</h2>
            <p>Select one metric, review the formula, then Save. Draft edits are not persisted while typing.</p>
          </div>
          <FlaskConical className="h-5 w-5" />
        </header>

        <div className="admin-standalone-layout">
          <div className="admin-standalone-list" aria-label="Standalone test metrics">
            {metricSettings.standaloneTestMetrics.map((m) => {
              const preview = formulaPreview(m.formula)
              const active = selectedMetric?.key === m.key
              return (
                <button
                  type="button"
                  key={m.key}
                  className={`admin-standalone-list-item ${active ? 'is-active' : ''} ${m.enabled ? 'is-enabled' : 'is-disabled'}`}
                  onClick={() => selectStandaloneMetric(m)}
                >
                  <span>
                    <strong>{m.key === 'package_percent' ? '%c/%r auto' : m.label}</strong>
                    <small>
                      <code>{m.formula}</code>
                      {m.custom ? 'Custom' : 'Built-in'}
                    </small>
                  </span>
                  <i className={`admin-formula-dot is-${preview.tone}`} aria-hidden />
                </button>
              )
            })}
          </div>

          {selectedMetric ? (
            <article className={`admin-standalone-editor ${selectedMetric.enabled ? 'is-enabled' : 'is-disabled'}`}>
              <header>
                <div>
                  <span className="admin-metrics-section-kicker">Editing</span>
                  <h3>{labelLocked ? '%c/%r package metric' : selectedMetric.label}</h3>
                  <p>
                    <code>{selectedMetric.key}</code>
                    {selectedMetric.custom ? 'Custom metric' : 'Built-in metric'}
                  </p>
                </div>
                <label className="admin-metric-switch">
                  <input
                    type="checkbox"
                    checked={selectedMetric.enabled}
                    onChange={(e) => toggleStandaloneMetric(selectedMetric.key, e.target.checked)}
                    aria-label={`Show ${selectedMetric.label}`}
                  />
                  {selectedMetric.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span>{selectedMetric.enabled ? 'On' : 'Off'}</span>
                </label>
              </header>

              {labelLocked ? (
                <div className="admin-metrics-auto-label">
                  <LockKeyhole className="h-4 w-4" />
                  <span>Auto label by package prefix: R packages show %r; G/other packages show %c.</span>
                </div>
              ) : null}

              <div className="admin-standalone-editor-grid">
                <label>
                  <span>Display name</span>
                  <input
                    type="text"
                    value={labelLocked ? '%c for G / %r for R' : draft.label}
                    disabled={labelLocked}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    aria-label={`Label for ${selectedMetric.key}`}
                  />
                </label>
                <label>
                  <span>Formula</span>
                  <input
                    type="text"
                    value={draft.formula}
                    onFocus={() => setActiveFormulaTarget('draft')}
                    onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
                    aria-label={`Formula for ${selectedMetric.label}`}
                  />
                </label>
                <label>
                  <span>Unit</span>
                  <select
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value as StandaloneTestMetricUnit })}
                    aria-label={`Unit for ${selectedMetric.label}`}
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as MetricStatus })}
                    aria-label={`Status for ${selectedMetric.label}`}
                  >
                    <option value="operational">Operational</option>
                    <option value="experimental">Experimental</option>
                  </select>
                </label>
                <label className="admin-standalone-definition">
                  <span>Definition</span>
                  <textarea
                    value={draft.definition}
                    onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
                    aria-label={`Definition for ${selectedMetric.label}`}
                    rows={4}
                  />
                </label>
              </div>

              <footer>
                <span className={`admin-formula-pill is-${draftPreview.tone}`}>
                  {draftPreview.tone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />}
                  {draftPreview.label}
                </span>
                <span className={`badge ${draft.status}`}>{statusLabel(draft.status)}</span>
                <button type="button" className="ghost" onClick={resetDraft} disabled={!isDirty}>
                  <Undo2 className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button type="button" className="primary" onClick={saveStandaloneMetric} disabled={!isDirty || draftPreview.tone === 'warning'}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>
                {selectedMetric.custom ? (
                  <button type="button" className="ghost" onClick={() => deleteCustomMetric(selectedMetric.key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : null}
              </footer>
            </article>
          ) : null}
        </div>
      </section>

      <form className="admin-custom-metric" onSubmit={addCustomMetric}>
        <header>
          <div>
            <span className="admin-metrics-section-kicker">Runtime extension</span>
            <h2>Add custom Tests 1-1 metric</h2>
            <p>Custom formulas use the whitelist above and persist with org metric settings.</p>
          </div>
          <Plus className="h-5 w-5" />
        </header>
        <div className="admin-custom-metric-grid">
          <label>
            <span>Label</span>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Metric label"
              aria-label="Custom metric label"
            />
          </label>
          <label>
            <span>Formula</span>
            <input
              type="text"
              value={customFormula}
              onFocus={() => setActiveFormulaTarget('custom')}
              onChange={(e) => setCustomFormula(e.target.value)}
              placeholder="(avgPercentX + legacyRac) / 2"
              aria-label="Custom metric formula"
            />
          </label>
          <label>
            <span>Unit</span>
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as StandaloneTestMetricUnit)}
              aria-label="Custom metric unit"
            >
              {UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="admin-custom-metric-actions">
            {customFormula ? (
              <span className={`admin-formula-pill is-${customFormulaPreview.tone}`}>
                {customFormulaPreview.label}
              </span>
            ) : null}
            <button type="submit" className="primary">
              <Plus className="h-3.5 w-3.5" />
              Add metric
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
