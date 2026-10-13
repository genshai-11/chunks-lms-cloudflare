import { METRIC_CATALOG, type MetricKey, type MetricStatus } from './calculate'
import {
  DEFAULT_STANDALONE_TEST_METRICS,
  mergeStandaloneTestMetrics,
  type StandaloneTestMetricSetting,
} from './standalone-settings'

export type MetricSetting = {
  key: MetricKey
  /** Shown on analysis / reports */
  enabled: boolean
  status: MetricStatus
  /** Minimum sample size before value is shown (null when below) */
  minSample: number
  /** Admin display label (optional override) */
  label: string
  definition: string
}

export type MetricSettingsState = {
  /** Default probe max for new sessions (org setting) */
  defaultMaxProbeCount: number
  metrics: MetricSetting[]
  /** Standalone Tests 1-1 analysis metric cards and runtime formulas. */
  standaloneTestMetrics: StandaloneTestMetricSetting[]
}

const LABELS: Record<MetricKey, string> = {
  rfc: 'RFC',
  rac: '%c',
  average_performance: 'Average performance',
  purple_mastery_rate: 'Purple mastery',
  clarification_rate: 'Clarification rate',
  clarification_depth: 'Chunks number avg (legacy)',
  n_count: 'chunks count',
  n_depth_max: 'max chunks number',
  n_depth_avg: 'avg chunks number',
  awareness_recovery: 'Awareness recovery',
  focus_stability: 'Focus stability',
}

export function createDefaultMetricSettings(): MetricSettingsState {
  return {
    defaultMaxProbeCount: 2,
    metrics: METRIC_CATALOG.map((m) => ({
      key: m.key,
      enabled: true,
      status: m.status,
      minSample: m.minSample,
      label: LABELS[m.key],
      definition: m.definition,
    })),
    standaloneTestMetrics: DEFAULT_STANDALONE_TEST_METRICS.map((m) => ({ ...m })),
  }
}

/** Ensure newly catalogued metrics appear after app upgrades. */
export function mergeMetricSettings(saved?: Partial<MetricSettingsState> | null): MetricSettingsState {
  const defaults = createDefaultMetricSettings()
  if (!saved?.metrics?.length) {
    return {
      ...defaults,
      defaultMaxProbeCount: saved?.defaultMaxProbeCount ?? defaults.defaultMaxProbeCount,
      standaloneTestMetrics: mergeStandaloneTestMetrics(saved?.standaloneTestMetrics),
    }
  }

  const byKey = new Map(saved.metrics.map((m) => [m.key, m]))
  return {
    defaultMaxProbeCount: saved.defaultMaxProbeCount ?? defaults.defaultMaxProbeCount,
    metrics: defaults.metrics.map((d) => {
      const prev = byKey.get(d.key)
      if (!prev) return d
      return {
        ...d,
        enabled: typeof prev.enabled === 'boolean' ? prev.enabled : d.enabled,
        status: prev.status ?? d.status,
        minSample: typeof prev.minSample === 'number' ? prev.minSample : d.minSample,
        label: prev.label || d.label,
        definition: prev.definition || d.definition,
      }
    }),
    standaloneTestMetrics: mergeStandaloneTestMetrics(saved.standaloneTestMetrics),
  }
}

export function getEnabledMetricKeys(settings: MetricSettingsState): MetricKey[] {
  return settings.metrics.filter((m) => m.enabled).map((m) => m.key)
}

export function getMetricSetting(
  settings: MetricSettingsState,
  key: MetricKey,
): MetricSetting | undefined {
  return settings.metrics.find((m) => m.key === key)
}

export function updateMetricSetting(
  settings: MetricSettingsState,
  key: MetricKey,
  patch: Partial<Omit<MetricSetting, 'key'>>,
): MetricSettingsState {
  return {
    ...settings,
    metrics: settings.metrics.map((m) => (m.key === key ? { ...m, ...patch } : m)),
  }
}

export function setDefaultMaxProbeCount(
  settings: MetricSettingsState,
  value: number,
): MetricSettingsState {
  const n = Math.floor(value)
  if (n < 1) return settings
  return { ...settings, defaultMaxProbeCount: n }
}
