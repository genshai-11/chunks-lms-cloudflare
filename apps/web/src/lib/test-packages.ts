import { cacheKey, cachedQuery, clearRequestCache } from './request-cache'
import { getSupabase } from './supabase'
import {
  type TestPackage,
  type TestPackageVersion,
  type TestSection,
  type TestItem,
  type SectionMeasurementSnapshot,
  type CciProfile,
  type CciCategory,
  type PackageKind,
  detectPackageKind,
} from '../modules/catalog/test-package-catalog'

export { detectPackageKind, type PackageKind }

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function client() {
  return getSupabase() as any
}

function mapTestPackage(row: any): TestPackage {
  const rawTitle = row.title ?? ''
  const cleanTitle = rawTitle.replace(/\s*·\s*LIVE\s*$/i, '').trim()
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: cleanTitle,
    slug: row.slug,
    description: row.description ?? null,
    createdByUserId: row.created_by_user_id,
    sourceMetadata: (row.source_metadata ?? {}) as Record<string, unknown>,
    archivedAt: row.archived_at,
  }
}

function mapTestPackageVersion(row: any): TestPackageVersion {
  return {
    id: row.id,
    packageId: row.package_id,
    versionLabel: row.version_label,
    status: row.status,
    snapshotHash: row.snapshot_hash,
    publishedAt: row.published_at,
    sourceMetadata: (row.source_metadata ?? {}) as Record<string, unknown>,
  }
}

export async function getTestPackageVersion(versionId: string): Promise<Result<TestPackageVersion | null>> {
  return cachedQuery(
    cacheKey(['catalog', 'version', versionId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_package_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data ? mapTestPackageVersion(data) : null }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

function mapTestSection(row: any): TestSection {
  return {
    id: row.id,
    packageVersionId: row.package_version_id,
    sectionOrder: row.section_order,
    title: row.title,
    introTextVi: row.intro_text_vi ?? null,
    introTextEn: row.intro_text_en ?? null,
    targetCvrOhm: row.target_cvr_ohm == null ? null : Number(row.target_cvr_ohm),
    cciProfileId: row.cci_profile_id ?? null,
    cciCategoryId: row.cci_category_id ?? null,
  }
}

function mapTestItem(row: any): TestItem {
  return {
    id: row.id,
    sectionId: row.section_id,
    packageVersionId: row.package_version_id,
    itemOrder: row.item_order,
    termVi: row.term_vi ?? null,
    termEn: row.term_en ?? null,
    promptVi: row.prompt_vi,
    promptEn: row.prompt_en,
    spokenScriptVi: row.spoken_script_vi ?? null,
    spokenScriptEn: row.spoken_script_en ?? null,
    tc: row.tc ? Number(row.tc) : null,
    lc: row.lc ? Number(row.lc) : null,
    tl: row.tl ? Number(row.tl) : null,
    measuredCvr: row.measured_cvr ? Number(row.measured_cvr) : null,
  }
}

function mapCciProfile(row: any): CciProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    versionLabel: row.version_label,
    status: row.status,
    description: row.description ?? null,
  }
}


function mapCciCategory(row: any): CciCategory {
  return {
    id: row.id,
    profileId: row.profile_id,
    categoryOrder: row.category_order,
    label: row.label,
    value: Number(row.value),
    description: row.description,
    metadata: row.metadata ?? {},
  }
}

function mapSectionMeasurementSnapshot(row: any): SectionMeasurementSnapshot {
  return {
    id: row.id,
    sectionId: row.test_section_id,
    packageVersionId: row.package_version_id,
    targetCvrOhm: Number(row.target_cvr_ohm),
    cciProfileId: row.cci_profile_id,
    cciCategoryId: row.cci_category_id,
    cciCategoryLabel: row.cci_category_label,
    cciValue: Number(row.cci_value),
    supersedesSnapshotId: row.supersedes_snapshot_id,
    overrideReason: row.override_reason,
    createdAt: row.created_at,
  }
}

export async function listTestPackages(): Promise<Result<TestPackage[]>> {
  return cachedQuery(
    cacheKey(['catalog', 'packages']),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_packages')
        .select('*')
        .is('archived_at', null)
        .order('title')
      if (error) return { ok: false, error: error.message }
      const packages = (data ?? []).map(mapTestPackage).sort((a: TestPackage, b: TestPackage) => {
        const aDefault = a.sourceMetadata?.isDefaultLiveTestPackage === true
        const bDefault = b.sourceMetadata?.isDefaultLiveTestPackage === true
        if (aDefault !== bDefault) return aDefault ? -1 : 1
        return a.title.localeCompare(b.title)
      })
      return { ok: true, data: packages }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

export async function getTestPackage(packageId: string): Promise<Result<TestPackage | null>> {
  return cachedQuery(
    cacheKey(['catalog', 'package', packageId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_packages')
        .select('*')
        .eq('id', packageId)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data ? mapTestPackage(data) : null }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

export async function updateTestPackage(input: {
  packageId: string
  title: string
  slug?: string | null
}): Promise<Result<TestPackage>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const values: Record<string, unknown> = { title: input.title.trim() }
  if (input.slug !== undefined) values.slug = input.slug?.trim() || slugify(input.title)
  const { data, error } = await sb
    .from('test_packages')
    .update(values)
    .eq('id', input.packageId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  clearRequestCache('catalog')
  return { ok: true, data: mapTestPackage(data) }
}

export type SelectablePackageVersion = {
  id: string
  packageId: string
  code: string
  label: string
  title: string
  versionLabel: string
  kind: PackageKind
  testType: 'green' | 'red'
  questionCount: number
}

export async function listSelectablePackageVersions(): Promise<Result<SelectablePackageVersion[]>> {
  return cachedQuery(
    cacheKey(['catalog', 'selectable-published-versions']),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }

      // 1 single query using PostgREST embedding:
      // Fetch packages with published versions and their section IDs
      const { data, error } = await sb
        .from('test_packages')
        .select(`
          id,
          title,
          slug,
          source_metadata,
          archived_at,
          test_package_versions (
            id,
            version_label,
            status,
            test_sections (
              id
            )
          )
        `)
        .is('archived_at', null)
        .order('title')

      if (error) {
        // Fallback: If nested embedding has schema issue, fetch packages and published versions in 2 batch queries
        const { data: pkgs, error: pErr } = await sb
          .from('test_packages')
          .select('id, title, slug, source_metadata')
          .is('archived_at', null)
          .order('title')
        if (pErr) return { ok: false, error: pErr.message }

        const { data: vers, error: vErr } = await sb
          .from('test_package_versions')
          .select('id, package_id, version_label, status, test_sections(id)')
          .eq('status', 'published')
        if (vErr) return { ok: false, error: vErr.message }

        const pkgMap = new Map<string, any>(((pkgs as any[]) ?? []).map((p: any) => [p.id, p]))
        const fallbackList: SelectablePackageVersion[] = []

        for (const ver of (vers as any[]) ?? []) {
          const pkg = pkgMap.get(ver.package_id)
          if (!pkg || pkg.source_metadata?.is_active === false) continue
          const sections = (ver as any).test_sections ?? []
          if (sections.length === 0) continue

          const kind = detectPackageKind(pkg)
          const rawTitle = (pkg.title || '').replace(/\s*·\s*LIVE.*$/i, '').trim()
          const isMini = kind === 'mini' || rawTitle.toLowerCase().includes('[mini]') || (pkg.slug || '').startsWith('mini-')
          const baseCode = rawTitle.replace(/^\[Mini\]\s*/i, '').replace(/^mini-/i, '').trim()
          const cleanLabel = isMini ? `${baseCode} [Mini]` : baseCode
          const isGreen = baseCode.toLowerCase().startsWith('g') || baseCode.toLowerCase().includes('green')
          const testType: 'green' | 'red' = isGreen ? 'green' : 'red'

          fallbackList.push({
            id: ver.id,
            packageId: pkg.id,
            code: baseCode,
            label: cleanLabel,
            title: cleanLabel,
            versionLabel: ver.version_label,
            kind: isMini ? 'mini' : 'standard',
            testType,
            questionCount: isMini ? 21 : 49,
          })
        }

        fallbackList.sort((a, b) => {
          if (a.testType !== b.testType) return a.testType === 'green' ? -1 : 1
          if (a.code !== b.code) return a.code.localeCompare(b.code)
          if (a.kind !== b.kind) return a.kind === 'standard' ? -1 : 1
          return 0
        })

        return { ok: true, data: fallbackList }
      }

      const list: SelectablePackageVersion[] = []
      for (const pkg of (data as any[]) ?? []) {
        if (pkg.source_metadata?.is_active === false) continue

        const versions = (pkg as any).test_package_versions ?? []
        const kind = detectPackageKind(pkg)
        const rawTitle = (pkg.title || '').replace(/\s*·\s*LIVE.*$/i, '').trim()
        const isMini = kind === 'mini' || rawTitle.toLowerCase().includes('[mini]') || (pkg.slug || '').startsWith('mini-')
        const baseCode = rawTitle.replace(/^\[Mini\]\s*/i, '').replace(/^mini-/i, '').trim()
        const cleanLabel = isMini ? `${baseCode} [Mini]` : baseCode
        const isGreen = baseCode.toLowerCase().startsWith('g') || baseCode.toLowerCase().includes('green')
        const testType: 'green' | 'red' = isGreen ? 'green' : 'red'

        for (const version of versions) {
          if (version.status !== 'published') continue
          const sections = version.test_sections ?? []
          if (sections.length === 0) continue

          list.push({
            id: version.id,
            packageId: pkg.id,
            code: baseCode,
            label: cleanLabel,
            title: cleanLabel,
            versionLabel: version.version_label,
            kind: isMini ? 'mini' : 'standard',
            testType,
            questionCount: isMini ? 21 : 49,
          })
        }
      }

      list.sort((a, b) => {
        if (a.testType !== b.testType) return a.testType === 'green' ? -1 : 1
        if (a.code !== b.code) return a.code.localeCompare(b.code)
        if (a.kind !== b.kind) return a.kind === 'standard' ? -1 : 1
        return 0
      })

      return { ok: true, data: list }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

export async function listTestPackageVersions(
  packageId: string,
): Promise<Result<TestPackageVersion[]>> {
  return cachedQuery(
    cacheKey(['catalog', 'versions', packageId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_package_versions')
        .select('*')
        .eq('package_id', packageId)
        .order('published_at', { ascending: false, nullsFirst: true })
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: (data ?? []).map(mapTestPackageVersion) }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}


export type TestPackagePublicationReadiness = {
  packageVersionId: string
  status: 'draft' | 'published' | 'archived'
  sectionCount: number
  itemCount: number
  voiceVi: string
  voiceEn: string
  readyVietnameseSections: number
  readyEnglishSections: number
  readyEitherSections?: number
  canPublish: boolean
  snapshotHash?: string
  publishedAt?: string
}

export async function getTestPackagePublicationReadiness(input: {
  packageVersionId: string
  voiceVi: string
  voiceEn: string
}): Promise<Result<TestPackagePublicationReadiness>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb.rpc('get_test_package_publication_readiness', {
    p_package_version_id: input.packageVersionId,
    p_voice_vi: input.voiceVi,
    p_voice_en: input.voiceEn,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as TestPackagePublicationReadiness }
}

export async function publishTestPackageVersion(input: {
  packageVersionId: string
  voiceVi: string
  voiceEn: string
}): Promise<Result<TestPackagePublicationReadiness>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb.rpc('publish_test_package_version', {
    p_package_version_id: input.packageVersionId,
    p_voice_vi: input.voiceVi,
    p_voice_en: input.voiceEn,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as TestPackagePublicationReadiness }
}

export async function listTestSections(versionId: string): Promise<Result<TestSection[]>> {
  return cachedQuery(
    cacheKey(['catalog', 'sections', versionId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_sections')
        .select('*')
        .eq('package_version_id', versionId)
        .order('section_order')
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: (data ?? []).map(mapTestSection) }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

export async function listTestItems(sectionId: string): Promise<Result<TestItem[]>> {
  return cachedQuery(
    cacheKey(['catalog', 'items', sectionId]),
    async () => {
      const sb = client()
      if (!sb) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await sb
        .from('test_items')
        .select('*')
        .eq('section_id', sectionId)
        .order('item_order')
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: (data ?? []).map(mapTestItem) }
    },
    { ttlMs: 5 * 60_000, persist: true },
  )
}

export async function listCciProfiles(): Promise<Result<CciProfile[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb.from('cci_profiles').select('*').order('name')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(mapCciProfile) }
}

export async function listCciCategories(profileId: string): Promise<Result<CciCategory[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_categories')
    .select('*')
    .eq('profile_id', profileId)
    .order('category_order')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(mapCciCategory) }
}

export async function createCciProfile(input: {
  organizationId: string
  name: string
  versionLabel?: string
  status?: 'draft' | 'active' | 'archived'
  description?: string | null
}): Promise<Result<CciProfile>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_profiles')
    .insert([
      {
        organization_id: input.organizationId,
        name: input.name,
        version_label: input.versionLabel ?? 'v1',
        status: input.status ?? 'active',
        description: input.description ?? null,
      },
    ])
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciProfile(data) }
}

export async function updateCciProfile(
  profileId: string,
  updates: Partial<Pick<CciProfile, 'name' | 'versionLabel' | 'status'>> & {
    description?: string | null
  },
): Promise<Result<CciProfile>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.versionLabel !== undefined) payload.version_label = updates.versionLabel
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.description !== undefined) payload.description = updates.description
  const { data, error } = await sb
    .from('cci_profiles')
    .update(payload)
    .eq('id', profileId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciProfile(data) }
}

export async function deleteCciProfile(profileId: string): Promise<Result<boolean>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb.from('cci_profiles').delete().eq('id', profileId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function createCciCategory(input: {
  profileId: string
  categoryOrder: number
  label: string
  value: number
  description?: string | null
  metadata?: Record<string, unknown>
}): Promise<Result<CciCategory>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_categories')
    .insert([
      {
        profile_id: input.profileId,
        category_order: input.categoryOrder,
        label: input.label,
        value: input.value,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
      },
    ])
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciCategory(data) }
}

export async function updateCciCategory(
  categoryId: string,
  updates: Partial<Pick<CciCategory, 'label' | 'value' | 'categoryOrder' | 'description' | 'metadata'>>,
): Promise<Result<CciCategory>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const payload: Record<string, unknown> = {}
  if (updates.label !== undefined) payload.label = updates.label
  if (updates.value !== undefined) payload.value = updates.value
  if (updates.categoryOrder !== undefined) payload.category_order = updates.categoryOrder
  if (updates.description !== undefined) payload.description = updates.description
  if (updates.metadata !== undefined) payload.metadata = updates.metadata
  const { data, error } = await sb
    .from('cci_categories')
    .update(payload)
    .eq('id', categoryId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciCategory(data) }
}

export async function deleteCciCategory(categoryId: string): Promise<Result<boolean>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb.from('cci_categories').delete().eq('id', categoryId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function batchSaveCciCategories(
  profileId: string,
  categories: Array<{
    id?: string
    categoryOrder: number
    label: string
    value: number
    description?: string | null
  }>,
): Promise<Result<CciCategory[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const rows = categories.map((cat) => ({
    ...(cat.id ? { id: cat.id } : {}),
    profile_id: profileId,
    category_order: cat.categoryOrder,
    label: cat.label,
    value: cat.value,
    description: cat.description ?? null,
  }))
  const { data, error } = await sb
    .from('cci_categories')
    .upsert(rows)
    .select()
    .order('category_order')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(mapCciCategory) }
}


export async function getSectionSnapshot(
  sectionId: string,
): Promise<Result<SectionMeasurementSnapshot | null>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('section_measurement_snapshots')
    .select('*')
    .eq('test_section_id', sectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data ? mapSectionMeasurementSnapshot(data) : null }
}

export async function createSnapshotOverride(input: {
  sectionId: string
  packageVersionId: string
  targetCvrOhm: number
  cciProfileId: string
  cciCategoryId: string
  cciCategoryLabel: string
  cciValue: number
  supersedesSnapshotId: string | null
  overrideReason: string
}): Promise<Result<SectionMeasurementSnapshot>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('section_measurement_snapshots')
    .insert([
      {
        test_section_id: input.sectionId,
        package_version_id: input.packageVersionId,
        target_cvr_ohm: input.targetCvrOhm,
        cci_profile_id: input.cciProfileId,
        cci_category_id: input.cciCategoryId,
        cci_category_label: input.cciCategoryLabel,
        cci_value: input.cciValue,
        supersedes_snapshot_id: input.supersedesSnapshotId,
        override_reason: input.overrideReason,
      },
    ])
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapSectionMeasurementSnapshot(data) }
}

export type NarrationTarget = 'package_start' | 'part_intro' | 'package_end' | 'section_intro' | 'test_item'

export type NarrationVariant = {
  id: string
  packageVersionId: string
  testSectionId: string | null
  testItemId: string | null
  narrationTarget: NarrationTarget
  language: 'vi' | 'en'
  voiceId: string
  voiceLabel: string | null
  sourceTextHash: string
  providerMetadata: Record<string, unknown>
  approvalStatus: 'draft' | 'generated' | 'approved' | 'rejected' | 'archived'
  audioAssetId: string | null
  generationJobId: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type NarrationAudioAsset = {
  id: string
  storageBucket: string
  storagePath: string
  mimeType: string
  durationMs: number | null
  bytes: number | null
  createdAt: string
}

export type NarrationGenerationJob = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  errorMessage: string | null
  requestedAt: string
  completedAt: string | null
}

export type NarrationReviewRecord = {
  variant: NarrationVariant
  audio: NarrationAudioAsset | null
  job: NarrationGenerationJob | null
}

function mapNarrationVariant(row: any): NarrationVariant {
  return {
    id: row.id,
    packageVersionId: row.package_version_id,
    testSectionId: row.test_section_id,
    testItemId: row.test_item_id,
    narrationTarget: row.narration_target,
    language: row.language,
    voiceId: row.voice_id,
    voiceLabel: row.voice_label,
    sourceTextHash: row.source_text_hash,
    providerMetadata: row.provider_metadata ?? {},
    approvalStatus: row.approval_status,
    audioAssetId: row.audio_asset_id,
    generationJobId: row.generation_job_id,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listApprovedSectionVoiceIds(
  sectionId: string,
  language: 'vi' | 'en',
): Promise<Result<string[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('narration_variants')
    .select('voice_id')
    .eq('test_section_id', sectionId)
    .eq('narration_target', 'section_intro')
    .eq('language', language)
    .eq('approval_status', 'approved')
    .not('audio_asset_id', 'is', null)
  if (error) return { ok: false, error: error.message }
  const voiceIds: string[] = (data ?? [])
    .map((row: any) => String(row.voice_id ?? ''))
    .filter((value: string) => value.length > 0)
  return { ok: true, data: [...new Set<string>(voiceIds)].sort() }
}

export async function listNarrationVariants(itemId: string): Promise<Result<NarrationVariant[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('narration_variants')
    .select('*')
    .eq('test_item_id', itemId)
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(mapNarrationVariant) }
}

export async function listSectionNarrationReview(input: {
  packageVersionId: string
  sectionId: string
  itemIds: string[]
  language: 'vi' | 'en'
  voiceId?: string
}): Promise<Result<NarrationReviewRecord[]>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  let query = sb
    .from('narration_variants')
    .select('*')
    .eq('package_version_id', input.packageVersionId)
    .eq('language', input.language)
  if (input.voiceId) query = query.eq('voice_id', input.voiceId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return { ok: false, error: error.message }
  const itemIds = new Set(input.itemIds)
  const variants = (data ?? [])
    .map(mapNarrationVariant)
    .filter(
      (variant: NarrationVariant) =>
        variant.narrationTarget === 'package_start' ||
        variant.narrationTarget === 'part_intro' ||
        variant.narrationTarget === 'package_end' ||
        variant.testSectionId === input.sectionId ||
        (variant.testItemId !== null && itemIds.has(variant.testItemId)),
    )
  const audioIds = [
    ...new Set(variants.map((v: NarrationVariant) => v.audioAssetId).filter(Boolean)),
  ]
  const jobIds = [
    ...new Set(variants.map((v: NarrationVariant) => v.generationJobId).filter(Boolean)),
  ]
  const [{ data: audioRows, error: audioError }, { data: jobRows, error: jobError }] =
    await Promise.all([
      audioIds.length
        ? sb.from('audio_assets').select('*').in('id', audioIds)
        : Promise.resolve({ data: [], error: null }),
      jobIds.length
        ? sb.from('generation_jobs').select('*').in('id', jobIds)
        : Promise.resolve({ data: [], error: null }),
    ])
  if (audioError) return { ok: false, error: audioError.message }
  if (jobError) return { ok: false, error: jobError.message }
  const audioById = new Map(
    (audioRows ?? []).map((row: any) => [
      row.id,
      {
        id: row.id,
        storageBucket: row.storage_bucket,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        bytes: row.bytes == null ? null : Number(row.bytes),
        createdAt: row.created_at,
      } satisfies NarrationAudioAsset,
    ]),
  )
  const jobById = new Map(
    (jobRows ?? []).map((row: any) => [
      row.id,
      {
        id: row.id,
        status: row.status,
        errorMessage: row.error_message ?? null,
        requestedAt: row.requested_at,
        completedAt: row.completed_at ?? null,
      } satisfies NarrationGenerationJob,
    ]),
  )
  return {
    ok: true,
    data: variants.map((variant: NarrationVariant) => ({
      variant,
      audio: variant.audioAssetId
        ? ((audioById.get(variant.audioAssetId) as NarrationAudioAsset | undefined) ?? null)
        : null,
      job: variant.generationJobId
        ? ((jobById.get(variant.generationJobId) as NarrationGenerationJob | undefined) ?? null)
        : null,
    })),
  }
}

export async function setNarrationReviewStatus(
  variantId: string,
  status: 'rejected' | 'archived',
): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb
    .from('narration_variants')
    .update({ approval_status: status, approved_at: null, approved_by_user_id: null })
    .eq('id', variantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

async function assertDraftPackageVersion(packageVersionId: string): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('test_package_versions')
    .select('status')
    .eq('id', packageVersionId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Package Version not found' }
  if (data.status !== 'draft') {
    return {
      ok: false,
      error:
        'Published or archived Package Versions are immutable. Create a new draft/version instead.',
    }
  }
  return { ok: true, data: true }
}

async function assertDraftCciProfile(profileId: string): Promise<Result<true>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_profiles')
    .select('status')
    .eq('id', profileId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'CCI Profile not found' }
  if (data.status !== 'draft') {
    return {
      ok: false,
      error:
        'Only draft CCI Profiles/Categories can be edited directly. Archive or supersede active catalogs instead.',
    }
  }
  return { ok: true, data: true }
}

async function countRows(table: string, column: string, value: string): Promise<Result<number>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { count, error } = await sb
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: count ?? 0 }
}

async function countItemExternalRefs(itemId: string): Promise<Result<number>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { count, error } = await sb
    .from('session_questions')
    .select('id', { count: 'exact', head: true })
    .like('external_ref', `live-test-item:${itemId}%`)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: count ?? 0 }
}

async function firstOrganizationId(): Promise<Result<string>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb.from('organizations').select('id').limit(1)
  if (error) return { ok: false, error: error.message }
  const id = data?.[0]?.id
  if (!id) return { ok: false, error: 'No organization found for catalog creation' }
  return { ok: true, data: id }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function createDraftTestItem(input: {
  packageVersionId: string
  sectionId: string
  promptVi: string | null
  promptEn: string | null
  tc: number | null
  lc: number | null
  tl: number | null
}): Promise<Result<TestItem>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data: existing, error: orderError } = await sb
    .from('test_items')
    .select('item_order')
    .eq('section_id', input.sectionId)
    .order('item_order', { ascending: false })
    .limit(1)
  if (orderError) return { ok: false, error: orderError.message }
  const nextOrder = (existing?.[0]?.item_order ?? 0) + 1
  const { data, error } = await sb
    .from('test_items')
    .insert({
      package_version_id: input.packageVersionId,
      section_id: input.sectionId,
      item_order: nextOrder,
      prompt_vi: input.promptVi,
      prompt_en: input.promptEn,
      tc: input.tc,
      lc: input.lc,
      tl: input.tl,
      source_metadata: { source: 'admin-resources-manual' },
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapTestItem(data) }
}

export async function updateDraftTestItem(input: {
  itemId: string
  packageVersionId: string
  promptVi: string | null
  promptEn: string | null
  tc: number | null
  lc: number | null
  tl: number | null
  spokenScriptVi?: string | null
  spokenScriptEn?: string | null
}): Promise<Result<TestItem>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const values: Record<string, unknown> = {
    prompt_vi: input.promptVi,
    prompt_en: input.promptEn,
    tc: input.tc,
    lc: input.lc,
    tl: input.tl,
  }
  if ('spokenScriptVi' in input) values.spoken_script_vi = input.spokenScriptVi ?? null
  if ('spokenScriptEn' in input) values.spoken_script_en = input.spokenScriptEn ?? null
  const { data, error } = await sb
    .from('test_items')
    .update(values)
    .eq('id', input.itemId)
    .eq('package_version_id', input.packageVersionId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapTestItem(data) }
}

export async function deleteDraftTestItem(input: {
  itemId: string
  packageVersionId: string
}): Promise<Result<true>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb
    .from('test_items')
    .delete()
    .eq('id', input.itemId)
    .eq('package_version_id', input.packageVersionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function createDraftTestSection(input: {
  packageVersionId: string
  title: string | null
  targetCvrOhm: number
  cciProfileId: string
  cciCategoryId: string
  cciCategoryLabel: string
  cciValue: number
}): Promise<Result<TestSection>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data: existing, error: orderError } = await sb
    .from('test_sections')
    .select('section_order')
    .eq('package_version_id', input.packageVersionId)
    .order('section_order', { ascending: false })
    .limit(1)
  if (orderError) return { ok: false, error: orderError.message }
  const nextOrder = (existing?.[0]?.section_order ?? 0) + 1
  const { data, error } = await sb
    .from('test_sections')
    .insert({
      package_version_id: input.packageVersionId,
      section_order: nextOrder,
      title: input.title,
      target_cvr_ohm: input.targetCvrOhm,
      cci_profile_id: input.cciProfileId,
      cci_category_id: input.cciCategoryId,
      cci_snapshot: {
        label: input.cciCategoryLabel,
        value: input.cciValue,
        unit: 'Ampe',
        targetCvrOhm: input.targetCvrOhm,
        source: 'admin-resources-manual',
      },
      metadata: { source: 'admin-resources-manual' },
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  const { error: snapshotError } = await sb.from('section_measurement_snapshots').insert({
    test_section_id: data.id,
    package_version_id: input.packageVersionId,
    target_cvr_ohm: input.targetCvrOhm,
    cci_profile_id: input.cciProfileId,
    cci_category_id: input.cciCategoryId,
    cci_category_label: input.cciCategoryLabel,
    cci_value: input.cciValue,
    snapshot_metadata: { source: 'admin-resources-manual', unit: 'Ampe', sectionOrder: nextOrder },
  })
  if (snapshotError) return { ok: false, error: snapshotError.message }
  return { ok: true, data: mapTestSection(data) }
}

export async function updateDraftTestSection(input: {
  sectionId: string
  packageVersionId: string
  title: string | null
  sectionOrder: number
  introTextVi?: string | null
  introTextEn?: string | null
}): Promise<Result<TestSection>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const values: Record<string, unknown> = { title: input.title, section_order: input.sectionOrder }
  if ('introTextVi' in input) values.intro_text_vi = input.introTextVi ?? null
  if ('introTextEn' in input) values.intro_text_en = input.introTextEn ?? null
  const { data, error } = await sb
    .from('test_sections')
    .update(values)
    .eq('id', input.sectionId)
    .eq('package_version_id', input.packageVersionId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapTestSection(data) }
}

export async function deleteDraftTestSection(input: {
  sectionId: string
  packageVersionId: string
}): Promise<Result<true>> {
  const draft = await assertDraftPackageVersion(input.packageVersionId)
  if (!draft.ok) return draft
  const sessions = await countRows('learning_sessions', 'test_section_id', input.sectionId)
  if (!sessions.ok) return sessions
  if (sessions.data > 0) {
    return {
      ok: false,
      error:
        'This Test Section is linked to Learning Sessions. It cannot be deleted; archive or create a new version instead.',
    }
  }
  const items = await listTestItems(input.sectionId)
  if (!items.ok) return items
  for (const item of items.data) {
    const refs = await countItemExternalRefs(item.id)
    if (!refs.ok) return refs
    if (refs.data > 0) {
      return {
        ok: false,
        error:
          'This Test Section contains items linked to Session Questions. It cannot be deleted.',
      }
    }
  }
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb
    .from('test_sections')
    .delete()
    .eq('id', input.sectionId)
    .eq('package_version_id', input.packageVersionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function createDraftCciProfile(input: {
  name: string
  versionLabel?: string
  description?: string | null
}): Promise<Result<CciProfile>> {
  const org = await firstOrganizationId()
  if (!org.ok) return org
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_profiles')
    .insert({
      organization_id: org.data,
      name: input.name.trim(),
      version_label: input.versionLabel?.trim() || 'draft',
      status: 'draft',
      description: input.description ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciProfile(data) }
}

export async function createDraftCciCategory(input: {
  profileId: string
  label: string
  value: number
  description: string | null
  metadata?: Record<string, unknown>
}): Promise<Result<CciCategory>> {
  const draft = await assertDraftCciProfile(input.profileId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data: existing, error: maxError } = await sb
    .from('cci_categories')
    .select('category_order')
    .eq('profile_id', input.profileId)
    .order('category_order', { ascending: false })
    .limit(1)
  if (maxError) return { ok: false, error: maxError.message }
  const nextOrder = (existing?.[0]?.category_order ?? 0) + 1
  const { data, error } = await sb
    .from('cci_categories')
    .insert({
      profile_id: input.profileId,
      category_order: nextOrder,
      label: input.label.trim(),
      value: input.value,
      description: input.description,
      metadata: input.metadata ?? {},
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciCategory(data) }
}

export async function updateDraftCciCategory(input: {
  categoryId: string
  profileId: string
  label: string
  value: number
  description: string | null
  metadata?: Record<string, unknown>
}): Promise<Result<CciCategory>> {
  const draft = await assertDraftCciProfile(input.profileId)
  if (!draft.ok) return draft
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_categories')
    .update({
      label: input.label,
      value: input.value,
      description: input.description,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    .eq('id', input.categoryId)
    .eq('profile_id', input.profileId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciCategory(data) }
}

export async function deleteDraftCciCategory(input: {
  categoryId: string
  profileId: string
}): Promise<Result<true>> {
  const draft = await assertDraftCciProfile(input.profileId)
  if (!draft.ok) return draft
  const snapshots = await countRows(
    'section_measurement_snapshots',
    'cci_category_id',
    input.categoryId,
  )
  if (!snapshots.ok) return snapshots
  if (snapshots.data > 0) {
    return {
      ok: false,
      error:
        'This CCI Category is referenced by measurement snapshots. Archive/supersede the catalog instead of deleting it.',
    }
  }
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { error } = await sb
    .from('cci_categories')
    .delete()
    .eq('id', input.categoryId)
    .eq('profile_id', input.profileId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: true }
}

export async function publishCciProfile(profileId: string): Promise<Result<CciProfile>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data: current, error: currentError } = await sb
    .from('cci_profiles')
    .select('status')
    .eq('id', profileId)
    .maybeSingle()
  if (currentError) return { ok: false, error: currentError.message }
  if (!current) return { ok: false, error: 'CCI Profile not found' }
  if (current.status !== 'draft') {
    return { ok: false, error: 'Only draft CCI Profiles can be published to active.' }
  }
  const { data, error } = await sb
    .from('cci_profiles')
    .update({ status: 'active' })
    .eq('id', profileId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciProfile(data) }
}

export async function archiveCciProfile(profileId: string): Promise<Result<CciProfile>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  const { data, error } = await sb
    .from('cci_profiles')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: mapCciProfile(data) }
}

export async function createDraftTestPackage(input: {
  title: string
  versionLabel: string
  sessionCount: number
  itemsPerSession: number
  sessions: Array<{
    sectionOrder: number
    title: string
    targetCvrOhm: number
    cciProfileId: string
    cciCategoryId: string
    cciCategoryLabel: string
    cciValue: number
  }>
}): Promise<Result<{ package: TestPackage; version: TestPackageVersion }>> {
  const org = await firstOrganizationId()
  if (!org.ok) return org
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }
  if (!input.title.trim()) return { ok: false, error: 'Package name is required' }
  if (!input.versionLabel.trim()) return { ok: false, error: 'Package Version label is required' }
  if (input.sessionCount < 1 || input.itemsPerSession < 1) {
    return { ok: false, error: 'Session count and items/session must be positive' }
  }
  const slug = `${slugify(input.title) || 'test-package'}-${Date.now().toString(36)}`

  try {
    const { data: pkgRow, error: pkgError } = await sb
      .from('test_packages')
      .insert({
        organization_id: org.data,
        title: input.title.trim(),
        slug,
        description: 'Created from Admin Resources package builder.',
        source_metadata: { source: 'admin-resources-builder' },
      })
      .select()
      .single()
    if (pkgError) throw new Error(pkgError.message)

    const { data: versionRow, error: versionError } = await sb
      .from('test_package_versions')
      .insert({
        package_id: pkgRow.id,
        version_label: input.versionLabel.trim(),
        status: 'draft',
        source_metadata: {
          source: 'admin-resources-builder',
          sessionCount: input.sessionCount,
          itemsPerSession: input.itemsPerSession,
        },
      })
      .select()
      .single()
    if (versionError) throw new Error(versionError.message)

    for (const session of input.sessions.slice(0, input.sessionCount)) {
      const { data: sectionRow, error: sectionError } = await sb
        .from('test_sections')
        .insert({
          package_version_id: versionRow.id,
          section_order: session.sectionOrder,
          title: session.title,
          target_cvr_ohm: session.targetCvrOhm,
          cci_profile_id: session.cciProfileId,
          cci_category_id: session.cciCategoryId,
          cci_snapshot: {
            label: session.cciCategoryLabel,
            value: session.cciValue,
            unit: 'Ampe',
            targetCvrOhm: session.targetCvrOhm,
            source: 'admin-resources-builder',
          },
        })
        .select()
        .single()
      if (sectionError) throw new Error(sectionError.message)

      const { error: snapshotError } = await sb.from('section_measurement_snapshots').insert({
        test_section_id: sectionRow.id,
        package_version_id: versionRow.id,
        target_cvr_ohm: session.targetCvrOhm,
        cci_profile_id: session.cciProfileId,
        cci_category_id: session.cciCategoryId,
        cci_category_label: session.cciCategoryLabel,
        cci_value: session.cciValue,
        snapshot_metadata: {
          source: 'admin-resources-builder',
          unit: 'Ampe',
          sectionOrder: session.sectionOrder,
        },
      })
      if (snapshotError) throw new Error(snapshotError.message)

      const itemRows = Array.from({ length: input.itemsPerSession }, (_, idx) => ({
        package_version_id: versionRow.id,
        section_id: sectionRow.id,
        item_order: idx + 1,
        source_metadata: {
          source: 'admin-resources-builder',
          placeholder: true,
        },
      }))
      const { error: itemsError } = await sb.from('test_items').insert(itemRows)
      if (itemsError) throw new Error(itemsError.message)
    }

    return {
      ok: true,
      data: { package: mapTestPackage(pkgRow), version: mapTestPackageVersion(versionRow) },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create Test Package' }
  }
}

export async function deleteTestPackage(packageId: string): Promise<void> {
  const sb = client()
  if (!sb) throw new Error('Supabase is not configured')

  // Find all versions of this package
  const { data: versions, error: vErr } = await sb
    .from('test_package_versions')
    .select('id')
    .eq('package_id', packageId)
  if (vErr) throw new Error(vErr.message)

  const versionIds = (versions ?? []).map((v: any) => v.id)

  if (versionIds.length > 0) {
    // Cascade delete standalone assignments and runs if any
    const { data: assignments } = await sb
      .from('standalone_assignments')
      .select('id')
      .in('package_version_id', versionIds)
    const assignmentIds = (assignments ?? []).map((a: any) => a.id)
    if (assignmentIds.length > 0) {
      await sb.from('standalone_runs').delete().in('assignment_id', assignmentIds)
      await sb.from('standalone_assignments').delete().in('id', assignmentIds)
    }

    // Cascade delete generation_jobs
    await sb.from('generation_jobs').delete().in('package_version_id', versionIds)

    // Delete narration_variants
    await sb.from('narration_variants').delete().in('package_version_id', versionIds)
    // Delete test_items
    await sb.from('test_items').delete().in('package_version_id', versionIds)
    // Delete section_measurement_snapshots
    await sb.from('section_measurement_snapshots').delete().in('package_version_id', versionIds)
    // Delete test_sections
    await sb.from('test_sections').delete().in('package_version_id', versionIds)
    // Delete test_package_versions
    await sb.from('test_package_versions').delete().eq('package_id', packageId)
  }

  const { error: pkgErr } = await sb.from('test_packages').delete().eq('id', packageId)
  if (pkgErr) throw new Error(pkgErr.message)
  clearRequestCache()
}

export async function updateTestPackageMetadata(
  packageId: string,
  updates: { title?: string; slug?: string; description?: string },
): Promise<void> {
  const sb = client()
  if (!sb) throw new Error('Supabase is not configured')

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.title !== undefined) payload.title = updates.title.trim()
  if (updates.slug !== undefined) payload.slug = updates.slug.trim()
  if (updates.description !== undefined) payload.description = updates.description.trim()

  const { error } = await sb.from('test_packages').update(payload).eq('id', packageId)
  if (error) throw new Error(error.message)
  clearRequestCache()
}

export async function toggleTestPackageActive(
  packageId: string,
  isActive: boolean,
): Promise<Result<void>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  const { data: pkgRow, error: fetchErr } = await sb
    .from('test_packages')
    .select('source_metadata')
    .eq('id', packageId)
    .maybeSingle()

  if (fetchErr) return { ok: false, error: fetchErr.message }

  const nextMeta = {
    ...(pkgRow?.source_metadata || {}),
    is_active: isActive,
  }

  const { error: updateErr } = await sb
    .from('test_packages')
    .update({
      source_metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packageId)

  if (updateErr) return { ok: false, error: updateErr.message }
  clearRequestCache()
  return { ok: true, data: undefined }
}

export async function updateTestItemContent(input: {
  itemId: string
  promptVi: string
  promptEn: string
  termVi?: string | null
  termEn?: string | null
  spokenScriptVi?: string | null
  spokenScriptEn?: string | null
  tc?: number | null
  tl?: number | null
  lc?: number | null
  measuredCvr?: number | null
}): Promise<Result<{ ok: boolean; itemId: string }>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  const { error } = await sb.rpc('edit_test_item_text', {
    p_item_id: input.itemId,
    p_prompt_vi: input.promptVi,
    p_prompt_en: input.promptEn,
    p_term_vi: input.termVi ?? null,
    p_term_en: input.termEn ?? null,
    p_spoken_script_vi: input.spokenScriptVi ?? null,
    p_spoken_script_en: input.spokenScriptEn ?? null,
    p_tc: input.tc ?? null,
    p_tl: input.tl ?? null,
    p_lc: input.lc ?? null,
    p_measured_cvr: input.measuredCvr ?? null,
  })

  if (error) return { ok: false, error: error.message }
  clearRequestCache()
  return { ok: true, data: { ok: true, itemId: input.itemId } }
}

export type CreateMiniTestVariantInput = {
  sourcePackageVersionId: string
  customCode?: string
  customTitle?: string
  questionsPerSection?: number // defaults to 3
  samplingStrategy?: 'random' | 'first' // defaults to 'random'
  copyAudio?: boolean // defaults to true
}

export type CreateMiniTestVariantResult = {
  package: TestPackage
  version: TestPackageVersion
  itemCount: number
}

export async function createMiniTestVariantFromPackage(
  input: CreateMiniTestVariantInput,
): Promise<Result<CreateMiniTestVariantResult>> {
  const sb = client()
  if (!sb) return { ok: false, error: 'Supabase is not configured' }

  try {
    // 1. Fetch source version and its parent package
    const { data: sourceVerRow, error: verErr } = await sb
      .from('test_package_versions')
      .select('*, test_packages(*)')
      .eq('id', input.sourcePackageVersionId)
      .single()

    if (verErr || !sourceVerRow) {
      return { ok: false, error: verErr?.message || 'Source package version not found' }
    }

    const sourcePkgRow = sourceVerRow.test_packages
    if (!sourcePkgRow) {
      return { ok: false, error: 'Source test package not found' }
    }

    // 2. Fetch sections for source version
    const { data: sourceSections, error: secErr } = await sb
      .from('test_sections')
      .select('*')
      .eq('package_version_id', input.sourcePackageVersionId)
      .order('section_order', { ascending: true })

    if (secErr || !sourceSections || sourceSections.length === 0) {
      return { ok: false, error: secErr?.message || 'No sections found in source package' }
    }

    const sectionIds = sourceSections.map((s: any) => s.id)

    // 3. Fetch items for those sections
    const { data: sourceItems, error: itemErr } = await sb
      .from('test_items')
      .select('*')
      .in('section_id', sectionIds)
      .order('item_order', { ascending: true })

    if (itemErr || !sourceItems || sourceItems.length === 0) {
      return { ok: false, error: itemErr?.message || 'No items found in source package' }
    }

    // 4. Fetch narration variants for source version
    const { data: sourceVariants } = await sb
      .from('narration_variants')
      .select('*')
      .eq('package_version_id', input.sourcePackageVersionId)

    // 4b. Fetch measurement snapshots for source version
    const { data: sourceSnapshots } = await sb
      .from('section_measurement_snapshots')
      .select('*')
      .eq('package_version_id', input.sourcePackageVersionId)

    const questionsPerSection = Math.max(1, input.questionsPerSection ?? 3)
    const strategy = input.samplingStrategy ?? 'random'

    // 5. Derive Mini package code and title
    const baseCode = sourcePkgRow.slug || 'standard-test'
    const miniCode = (input.customCode?.trim() || `mini-${baseCode}`).toLowerCase()
    const miniTitle = input.customTitle?.trim() || `[Mini] ${sourcePkgRow.title.replace(/\s*·\s*LIVE\s*$/i, '')}`

    // 5b. Self-healing check: clean up or handle existing orphaned package stubs with same slug
    const { data: existingPkgList } = await sb
      .from('test_packages')
      .select('id, slug, test_package_versions(id, status, test_sections(id), narration_variants(id))')
      .eq('slug', miniCode)

    if (existingPkgList && existingPkgList.length > 0) {
      for (const exPkg of existingPkgList) {
        const versions = (exPkg as any).test_package_versions || []
        const completeVer = versions.find(
          (v: any) =>
            v.test_sections &&
            v.test_sections.length > 0 &&
            (!shouldCopyAudio || (v.narration_variants && v.narration_variants.length > 0)),
        )
        if (completeVer) {
          const pubVer = versions.find((v: any) => v.status === 'published' && v.id === completeVer.id) || completeVer
          return {
            ok: true,
            data: {
              package: mapTestPackage(exPkg),
              version: mapTestPackageVersion(pubVer),
              itemCount: sourceSections.length * questionsPerSection,
            },
          }
        } else {
          // Empty or incomplete stub (missing sections or missing audio) -> archive it so we can regenerate cleanly
          for (const v of versions) {
            try {
              if (v.status === 'draft') {
                await sb.from('test_package_versions').delete().eq('id', v.id)
              } else if (v.status === 'published') {
                await sb
                  .from('test_package_versions')
                  .update({ status: 'archived', archived_at: new Date().toISOString() })
                  .eq('id', v.id)
              }
            } catch {
              // ignore cleanup error
            }
          }
          await sb
            .from('test_packages')
            .update({
              slug: `${exPkg.slug}-orphaned-${Date.now()}`,
              archived_at: new Date().toISOString(),
            })
            .eq('id', exPkg.id)
        }
      }
    }

    // 6. Create new test_packages row
    const { data: newPkgRow, error: pkgInsertErr } = await sb
      .from('test_packages')
      .insert({
        organization_id: sourcePkgRow.organization_id,
        title: miniTitle,
        slug: miniCode,
        description: `Mini-test variant (${sourceSections.length * questionsPerSection} questions) derived from ${sourcePkgRow.title}. Zero-waste audio reuse.`,
        created_by_user_id: sourcePkgRow.created_by_user_id,
        source_metadata: {
          ...(sourcePkgRow.source_metadata ?? {}),
          package_kind: 'mini',
          is_mini_test: true,
          derived_from_package_id: sourcePkgRow.id,
          derived_from_version_id: sourceVerRow.id,
          original_code: sourcePkgRow.slug,
          total_items: sourceSections.length * questionsPerSection,
          questions_per_section: questionsPerSection,
          sampling_strategy: strategy,
        },
      })
      .select()
      .single()

    if (pkgInsertErr || !newPkgRow) {
      return { ok: false, error: pkgInsertErr?.message || 'Failed to create mini package' }
    }

    // 7. Create new test_package_versions row in DRAFT status
    // Must be in draft mode so triggers allow test_sections, test_items, and narration_variants inserts!
    const { data: newVerRow, error: verInsertErr } = await sb
      .from('test_package_versions')
      .insert({
        package_id: newPkgRow.id,
        version_label: 'v1.0.0',
        status: 'draft',
        source_metadata: {
          ...(sourceVerRow.source_metadata ?? {}),
          package_kind: 'mini',
          is_mini_test: true,
          derived_from_version_id: sourceVerRow.id,
          total_items: sourceSections.length * questionsPerSection,
          questions_per_section: questionsPerSection,
        },
      })
      .select()
      .single()

    if (verInsertErr || !newVerRow) {
      try {
        await sb.from('test_packages').delete().eq('id', newPkgRow.id)
      } catch {
        // ignore
      }
      return { ok: false, error: verInsertErr?.message || 'Failed to create mini package version' }
    }

    // 8. Clone sections and sample items
    let totalItemsCreated = 0
    const shouldCopyAudio = input.copyAudio !== false
    const itemMapping: Array<{ sourceItemId: string; newItemId: string; newSectionId: string }> = []
    const sectionMapping: Array<{ sourceSectionId: string; newSectionId: string; sectionOrder: number }> = []

    for (const sec of sourceSections) {
      const { data: newSecRow, error: newSecErr } = await sb
        .from('test_sections')
        .insert({
          package_version_id: newVerRow.id,
          section_order: sec.section_order,
          title: sec.title,
          intro_text_vi: sec.intro_text_vi,
          intro_text_en: sec.intro_text_en,
          target_cvr_ohm: sec.target_cvr_ohm,
          cci_profile_id: sec.cci_profile_id,
          cci_category_id: sec.cci_category_id,
          cci_snapshot: sec.cci_snapshot,
          metadata: {
            ...(sec.metadata ?? sec.source_metadata ?? {}),
            derived_from_section_id: sec.id,
          },
        })
        .select()
        .single()

      if (newSecErr || !newSecRow) {
        throw new Error(newSecErr?.message || 'Failed to clone section')
      }

      sectionMapping.push({
        sourceSectionId: sec.id,
        newSectionId: newSecRow.id,
        sectionOrder: sec.section_order,
      })

      // Clone section_measurement_snapshots from source snapshot or create from section attributes
      const matchingSnap = (sourceSnapshots || []).find((s: any) => s.test_section_id === sec.id)
      if (matchingSnap) {
        await sb.from('section_measurement_snapshots').insert({
          test_section_id: newSecRow.id,
          package_version_id: newVerRow.id,
          target_cvr_ohm: matchingSnap.target_cvr_ohm,
          cci_profile_id: matchingSnap.cci_profile_id,
          cci_category_id: matchingSnap.cci_category_id,
          cci_category_label: matchingSnap.cci_category_label,
          cci_value: matchingSnap.cci_value,
          snapshot_metadata: {
            ...(matchingSnap.snapshot_metadata ?? {}),
            source: 'mini-test-generator',
            derived_from_snapshot_id: matchingSnap.id,
            sectionOrder: sec.section_order,
          },
        })
      } else if (sec.cci_profile_id && sec.cci_category_id) {
        await sb.from('section_measurement_snapshots').insert({
          test_section_id: newSecRow.id,
          package_version_id: newVerRow.id,
          target_cvr_ohm: sec.target_cvr_ohm ?? 3.0,
          cci_profile_id: sec.cci_profile_id,
          cci_category_id: sec.cci_category_id,
          cci_category_label: sec.cci_snapshot?.label || `Section ${sec.section_order}`,
          cci_value: sec.cci_snapshot?.value ?? 4,
          snapshot_metadata: {
            source: 'mini-test-generator',
            derived_from_section_id: sec.id,
            sectionOrder: sec.section_order,
          },
        })
      }

      // Filter items for this section
      const itemsForSec = sourceItems.filter((i: any) => i.section_id === sec.id)
      let sampledItems: any[] = []

      if (strategy === 'first' || itemsForSec.length <= questionsPerSection) {
        sampledItems = itemsForSec.slice(0, questionsPerSection)
      } else {
        // Random sampling without replacement
        const shuffled = [...itemsForSec].sort(() => Math.random() - 0.5)
        sampledItems = shuffled.slice(0, questionsPerSection)
      }

      // Insert sampled items with renumbered item_order
      for (let idx = 0; idx < sampledItems.length; idx++) {
        const srcItem = sampledItems[idx]
        totalItemsCreated += 1
        const newItemOrder = idx + 1

        const { data: newItemRow, error: newItemErr } = await sb
          .from('test_items')
          .insert({
            package_version_id: newVerRow.id,
            section_id: newSecRow.id,
            item_order: newItemOrder,
            term_vi: srcItem.term_vi,
            term_en: srcItem.term_en,
            prompt_vi: srcItem.prompt_vi,
            prompt_en: srcItem.prompt_en,
            spoken_script_vi: srcItem.spoken_script_vi,
            spoken_script_en: srcItem.spoken_script_en,
            tc: srcItem.tc,
            lc: srcItem.lc,
            tl: srcItem.tl,
            source_metadata: {
              ...(srcItem.source_metadata ?? {}),
              derived_from_item_id: srcItem.id,
              original_item_order: srcItem.item_order,
              total_order: totalItemsCreated,
            },
          })
          .select()
          .single()

        if (newItemErr || !newItemRow) {
          throw new Error(newItemErr?.message || 'Failed to clone test item')
        }

        itemMapping.push({
          sourceItemId: srcItem.id,
          newItemId: newItemRow.id,
          newSectionId: newSecRow.id,
        })
      }
    }

    // 9. Zero-waste audio reuse: clone narration variants directly to existing audio_asset_id
    if (shouldCopyAudio && sourceVariants && sourceVariants.length > 0) {
      const newVariantsToInsert: any[] = []

      // A. Item narration variants
      for (const map of itemMapping) {
        const itemVariants = sourceVariants.filter(
          (v: any) => v.test_item_id === map.sourceItemId && v.audio_asset_id != null,
        )

        for (const v of itemVariants) {
          const status = v.approval_status ?? 'approved'
          const isApproved = status === 'approved'
          newVariantsToInsert.push({
            package_version_id: newVerRow.id,
            test_section_id: null, // Per narration_variants_target_shape_check: test_section_id must be null when narration_target is 'test_item'
            test_item_id: map.newItemId,
            narration_target: 'test_item',
            language: v.language,
            voice_id: v.voice_id,
            voice_label: v.voice_label,
            source_text_hash: v.source_text_hash,
            provider_metadata: v.provider_metadata ?? {},
            approval_status: status,
            audio_asset_id: v.audio_asset_id, // EXACT SAME Supabase Storage audio asset!
            approved_at: isApproved ? (v.approved_at ?? new Date().toISOString()) : null,
          })
        }
      }

      // B. Section intro narration variants
      for (const secMap of sectionMapping) {
        const secVariants = sourceVariants.filter(
          (v: any) =>
            v.narration_target === 'section_intro' &&
            v.test_section_id === secMap.sourceSectionId &&
            v.audio_asset_id != null,
        )

        for (const v of secVariants) {
          const status = v.approval_status ?? 'approved'
          const isApproved = status === 'approved'
          newVariantsToInsert.push({
            package_version_id: newVerRow.id,
            test_section_id: secMap.newSectionId,
            test_item_id: null,
            narration_target: 'section_intro',
            language: v.language,
            voice_id: v.voice_id,
            voice_label: v.voice_label,
            source_text_hash: v.source_text_hash,
            provider_metadata: v.provider_metadata ?? {},
            approval_status: status,
            audio_asset_id: v.audio_asset_id,
            approved_at: isApproved ? (v.approved_at ?? new Date().toISOString()) : null,
          })
        }
      }

      // C. Package start / end and part intro narration variants
      const lifecycleVariants = sourceVariants.filter(
        (v: any) =>
          ['package_start', 'package_end', 'part_intro'].includes(v.narration_target) &&
          v.audio_asset_id != null,
      )

      for (const v of lifecycleVariants) {
        const status = v.approval_status ?? 'approved'
        const isApproved = status === 'approved'
        newVariantsToInsert.push({
          package_version_id: newVerRow.id,
          test_section_id: null,
          test_item_id: null,
          narration_target: v.narration_target,
          language: v.language,
          voice_id: v.voice_id,
          voice_label: v.voice_label,
          source_text_hash: v.source_text_hash,
          provider_metadata: v.provider_metadata ?? {},
          approval_status: status,
          audio_asset_id: v.audio_asset_id,
          approved_at: isApproved ? (v.approved_at ?? new Date().toISOString()) : null,
        })
      }

      if (newVariantsToInsert.length > 0) {
        const { error: variantInsertErr } = await sb.from('narration_variants').insert(newVariantsToInsert)
        if (variantInsertErr) {
          throw new Error(`Failed to copy audio narration variants: ${variantInsertErr.message}`)
        }
      }
    }

    // 10. Finalize: Publish the package version with its snapshot hash
    const derivedSnapshotHash =
      sourceVerRow.snapshot_hash
        ? `mini:${sourceVerRow.snapshot_hash}`
        : `mini-snapshot-${newPkgRow.id}-${Date.now()}`

    const { data: publishedVerRow, error: publishErr } = await sb
      .from('test_package_versions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        snapshot_hash: derivedSnapshotHash,
      })
      .eq('id', newVerRow.id)
      .select()
      .single()

    if (publishErr || !publishedVerRow) {
      throw new Error(publishErr?.message || 'Failed to publish mini package version')
    }

    clearRequestCache('catalog')
    return {
      ok: true,
      data: {
        package: mapTestPackage(newPkgRow),
        version: mapTestPackageVersion(publishedVerRow),
        itemCount: totalItemsCreated,
      },
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

