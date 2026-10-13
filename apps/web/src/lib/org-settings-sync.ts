/**
 * Persist org metric UI settings + default max probe count to Supabase.
 * Soft-fails when table missing or offline so local mode still works.
 */
import {
  createDefaultMetricSettings,
  mergeMetricSettings,
  type MetricSetting,
  type MetricSettingsState,
} from '../modules/metrics/settings'
import type { MetricKey, MetricStatus } from '../modules/metrics/calculate'
import { getSupabase } from './supabase'

function client() {
  return getSupabase() as any
}

function parseSettings(raw: unknown, defaultMaxProbeCount: number): MetricSettingsState {
  const base = createDefaultMetricSettings()
  base.defaultMaxProbeCount = defaultMaxProbeCount >= 1 ? defaultMaxProbeCount : 2
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return mergeMetricSettings({
      ...(raw as Partial<MetricSettingsState>),
      defaultMaxProbeCount: base.defaultMaxProbeCount,
    })
  }
  if (!Array.isArray(raw)) return base
  const byKey = new Map(
    raw
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
      .map((r) => [String(r.key), r]),
  )
  base.metrics = base.metrics.map((m) => {
    const row = byKey.get(m.key)
    if (!row) return m
    return {
      ...m,
      enabled: typeof row.enabled === 'boolean' ? row.enabled : m.enabled,
      status: (row.status as MetricStatus) ?? m.status,
      minSample: typeof row.minSample === 'number' ? row.minSample : m.minSample,
      label: typeof row.label === 'string' ? row.label : m.label,
      definition: typeof row.definition === 'string' ? row.definition : m.definition,
      } satisfies MetricSetting
  })
  return mergeMetricSettings(base)
}

export async function loadOrgMetricSettings(
  organizationId: string,
): Promise<{ ok: true; data: MetricSettingsState | null } | { ok: false; error: string }> {
  const sb = client()
  if (!sb) return { ok: true, data: null }
  try {
    const { data, error } = await sb
      .from('org_settings')
      .select('default_max_probe_count, metric_settings')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (error) {
      // Table may not be migrated yet
      if (String(error.message).includes('org_settings')) return { ok: true, data: null }
      return { ok: false, error: error.message }
    }
    if (!data) return { ok: true, data: null }
    return {
      ok: true,
      data: parseSettings(data.metric_settings, data.default_max_probe_count as number),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'load failed' }
  }
}

export async function saveOrgMetricSettings(
  organizationId: string,
  settings: MetricSettingsState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = client()
  if (!sb) return { ok: true }
  try {
    const payload = {
      organization_id: organizationId,
      default_max_probe_count: settings.defaultMaxProbeCount,
      metric_settings: {
        metrics: settings.metrics.map((m) => ({
          key: m.key as MetricKey,
          enabled: m.enabled,
          status: m.status,
          minSample: m.minSample,
          label: m.label,
          definition: m.definition,
        })),
        standaloneTestMetrics: settings.standaloneTestMetrics,
      },
      updated_at: new Date().toISOString(),
    }
    const { error } = await sb.from('org_settings').upsert(payload, {
      onConflict: 'organization_id',
    })
    if (error) {
      if (String(error.message).includes('org_settings')) return { ok: true }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'save failed' }
  }
}
