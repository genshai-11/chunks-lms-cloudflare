import type {
  LiveTestBlock,
  LiveTestItem,
  LiveTestResource,
} from '../modules/assessment/live-test'
import { getSupabase } from './supabase'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function client() {
  return getSupabase() as any
}

function n(value: unknown): number | null {
  return typeof value === 'number' ? value : value == null ? null : Number(value)
}

function resourceFromDb(row: any): LiveTestResource {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    title: row.title,
    version: row.version ?? '1.0.0',
    status: row.status ?? 'draft',
    sourceFilename: row.source_filename ?? null,
  }
}

function blockFromDb(row: any): LiveTestBlock {
  return {
    id: row.id,
    resourceId: row.resource_id,
    blockNumber: row.block_number,
    title: row.title ?? null,
    cciMin: n(row.cci_min),
    cciMax: n(row.cci_max),
    cciAvg: n(row.cci_avg),
    cvrMin: n(row.cvr_min),
    cvrMax: n(row.cvr_max),
    cvrAvg: n(row.cvr_avg),
    cpdMin: n(row.cpd_min),
    cpdMax: n(row.cpd_max),
    cpdAvg: n(row.cpd_avg),
    introTextVi: row.intro_text_vi ?? null,
    introTextEn: row.intro_text_en ?? null,
    introAudioViAssetId: row.intro_audio_vi_asset_id ?? null,
    introAudioEnAssetId: row.intro_audio_en_asset_id ?? null,
  }
}

function itemFromDb(row: any): LiveTestItem {
  return {
    id: row.id,
    blockId: row.block_id,
    itemNumber: row.item_number,
    sourceDay: row.source_day ?? null,
    sourceStt: row.source_stt ?? null,
    unitOhm: n(row.unit_ohm),
    cciValue: n(row.cci_value),
    cciMeasure: row.cci_measure ?? 'Unit (Ohm)',
    cciUnitLabel: row.cci_unit_label ?? 'CCI',
    cciSource: row.cci_source ?? 'csv:Unit (Ohm)',
    termVi: row.term_vi ?? '',
    termEn: row.term_en ?? '',
    promptVi: row.prompt_vi ?? null,
    promptEn: row.prompt_en ?? null,
    tc: n(row.tc),
    lc: n(row.lc),
    tl: n(row.tl),
    cvrValue: n(row.cvr_value),
    cvrMeasure: row.cvr_measure ?? 'Estimated TC × LC × TL',
    cvrUnitLabel: row.cvr_unit_label ?? 'CVR',
    cpdValue: n(row.cpd_value),
    audioViAssetId: row.audio_vi_asset_id ?? null,
    audioEnAssetId: row.audio_en_asset_id ?? null,
  }
}

export async function listLiveTestResources(): Promise<Result<LiveTestResource[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('live_test_resources')
    .select('*')
    .order('title')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(resourceFromDb) }
}

export async function listLiveTestBlocks(resourceId: string): Promise<Result<LiveTestBlock[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('live_test_blocks')
    .select('*')
    .eq('resource_id', resourceId)
    .order('block_number')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(blockFromDb) }
}

export async function listLiveTestItems(blockId: string): Promise<Result<LiveTestItem[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('live_test_items')
    .select('*')
    .eq('block_id', blockId)
    .order('item_number')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(itemFromDb) }
}

export async function audioUrl(assetId: string | null | undefined): Promise<string | null> {
  if (!assetId) return null
  const sb = client()
  if (!sb) return null
  const { data, error } = await sb
    .from('audio_assets')
    .select('storage_bucket,storage_path')
    .eq('id', assetId)
    .maybeSingle()
  if (error || !data) return null
  const pub = sb.storage.from(data.storage_bucket).getPublicUrl(data.storage_path)
  return pub.data.publicUrl ?? null
}
