import { describe, expect, it, vi } from 'vitest'
import { deleteTestPackage, updateTestPackageMetadata } from './test-packages'
import * as supabaseLib from './supabase'

describe('test-packages CRUD helpers', () => {
  it('deleteTestPackage cascade-deletes versions and package', async () => {
    const deleteQueries: string[] = []

    const mockFrom = vi.fn((table: string) => {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [{ id: 'ver-1' }], error: null })),
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        delete: vi.fn(() => {
          deleteQueries.push(table)
          return {
            in: vi.fn(() => Promise.resolve({ error: null })),
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }
        }),
      }
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      from: mockFrom,
    } as any)

    await deleteTestPackage('pkg-123')

    expect(deleteQueries).toContain('narration_variants')
    expect(deleteQueries).toContain('test_items')
    expect(deleteQueries).toContain('section_measurement_snapshots')
    expect(deleteQueries).toContain('test_sections')
    expect(deleteQueries).toContain('test_package_versions')
    expect(deleteQueries).toContain('test_packages')
  })

  it('updateTestPackageMetadata updates title and description', async () => {
    let updatedPayload: any = null

    const mockFrom = vi.fn((_table: string) => {
      return {
        update: vi.fn((payload: any) => {
          updatedPayload = payload
          return {
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }
        }),
      }
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      from: mockFrom,
    } as any)

    await updateTestPackageMetadata('pkg-123', {
      title: 'New Title',
      slug: 'new-title',
      description: 'New Description',
    })

    expect(updatedPayload).not.toBeNull()
    expect(updatedPayload.title).toBe('New Title')
    expect(updatedPayload.slug).toBe('new-title')
    expect(updatedPayload.description).toBe('New Description')
  })

  it('supports full CCI Profile and Category CRUD operations', async () => {
    let insertedRows: any[] = []
    let updatedPayload: any = null
    let deletedTable = ''

    const mockFrom = vi.fn((table: string) => ({
      insert: vi.fn((rows: any[]) => {
        insertedRows = rows
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'created-id', ...rows[0] },
                error: null,
              }),
            ),
          })),
        }
      }),
      update: vi.fn((payload: any) => {
        updatedPayload = payload
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { id: 'updated-id', ...payload },
                  error: null,
                }),
              ),
            })),
          })),
        }
      }),
      delete: vi.fn(() => {
        deletedTable = table
        return {
          eq: vi.fn(() => Promise.resolve({ error: null })),
        }
      }),
      upsert: vi.fn((rows: any[]) => ({
        select: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: rows.map((r, i) => ({ id: `cat-${i}`, ...r })),
              error: null,
            }),
          ),
        })),
      })),
    }))

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({
      from: mockFrom,
    } as any)

    const {
      createCciProfile,
      updateCciProfile,
      deleteCciProfile,
      createCciCategory,
      updateCciCategory,
      deleteCciCategory,
      batchSaveCciCategories,
    } = await import('./test-packages')

    // Create profile
    const profileRes = await createCciProfile({
      organizationId: 'org-1',
      name: 'Ecommerce 7-Session Ample',
      versionLabel: 'v1',
    })
    expect(profileRes.ok).toBe(true)
    expect(insertedRows[0]?.name).toBe('Ecommerce 7-Session Ample')

    // Update profile
    const updateRes = await updateCciProfile('prof-1', { name: 'Renamed Profile' })
    expect(updateRes.ok).toBe(true)
    expect(updatedPayload?.name).toBe('Renamed Profile')

    // Delete profile
    const deleteRes = await deleteCciProfile('prof-1')
    expect(deleteRes.ok).toBe(true)
    expect(deletedTable).toBe('cci_profiles')

    // Create category (Ample)
    const catRes = await createCciCategory({
      profileId: 'prof-1',
      categoryOrder: 1,
      label: 'Session 1 Ample',
      value: 6.0,
    })
    expect(catRes.ok).toBe(true)
    expect(insertedRows[0]?.value).toBe(6.0)

    // Update category
    const updateCatRes = await updateCciCategory('cat-1', { label: 'Updated Ample', value: 8.0 })
    expect(updateCatRes.ok).toBe(true)
    expect(updatedPayload?.value).toBe(8.0)

    // Delete category
    const deleteCatRes = await deleteCciCategory('cat-1')
    expect(deleteCatRes.ok).toBe(true)
    expect(deletedTable).toBe('cci_categories')

    // Batch save categories
    const batchRes = await batchSaveCciCategories('prof-1', [
      { categoryOrder: 1, label: 'S1', value: 6.0 },
      { categoryOrder: 2, label: 'S2', value: 6.0 },
      { categoryOrder: 3, label: 'S3', value: 4.0 },
    ])
    expect(batchRes.ok).toBe(true)
    if (batchRes.ok) {
      expect(batchRes.data).toHaveLength(3)
    }
  })

  it('createMiniTestVariantFromPackage generates 21-question mini test with zero-waste audio reuse', async () => {
    const mockSections = Array.from({ length: 7 }, (_, i) => ({
      id: `sec-${i + 1}`,
      package_version_id: 'ver-source',
      section_order: i + 1,
      title: `Session ${i + 1}`,
      target_cvr: 10,
    }))

    // 7 items per session = 49 items total
    const mockItems = mockSections.flatMap((sec) =>
      Array.from({ length: 7 }, (_, j) => ({
        id: `item-${sec.section_order}-${j + 1}`,
        section_id: sec.id,
        package_version_id: 'ver-source',
        item_order: j + 1,
        prompt_vi: `Câu ${sec.section_order}.${j + 1}`,
        prompt_en: `Sentence ${sec.section_order}.${j + 1}`,
        tc: 2,
        tl: 2,
        lc: 2,
        measured_cvr: 8,
      })),
    )

    const mockVariants = [
      {
        id: 'var-intro-1',
        package_version_id: 'ver-source',
        test_section_id: 'sec-1',
        test_item_id: null,
        narration_target: 'section_intro',
        language: 'vi',
        voice_id: 'google/vi-VN-Neural2-A',
        audio_asset_id: 'asset-intro-1',
        approval_status: 'approved',
      },
      ...mockItems.map((it) => ({
        id: `var-${it.id}-vi`,
        package_version_id: 'ver-source',
        test_section_id: it.section_id,
        test_item_id: it.id,
        narration_target: 'test_item',
        language: 'vi',
        voice_id: 'google/vi-VN-Neural2-A',
        audio_asset_id: `asset-${it.id}`,
        approval_status: 'approved',
      })),
    ]

    let insertedPackage: any = null
    let insertedVersion: any = null
    let insertedSections: any[] = []
    let insertedItems: any[] = []
    let insertedVariants: any[] = []

    const mockFrom = vi.fn((table: string) => {
      if (table === 'test_packages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => {
              const promise = Promise.resolve({ data: [], error: null }) as any
              promise.single = vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'pkg-source',
                    slug: 'g1-56v',
                    title: 'Standard G1-56V',
                    description: 'Original Standard Test',
                    published_version_id: 'ver-source',
                    source_metadata: { targetVoltage: 56 },
                  },
                  error: null,
                }),
              )
              return promise
            }),
          })),
          insert: vi.fn((row: any) => {
            insertedPackage = row
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'pkg-mini-123' }, error: null })),
              })),
            }
          }),
        }
      }
      if (table === 'test_package_versions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'ver-source',
                    package_id: 'pkg-source',
                    version_label: 'v1.0.0',
                    status: 'published',
                    test_packages: {
                      id: 'pkg-source',
                      organization_id: 'org-1',
                      slug: 'g1-56v',
                      title: 'Standard G1-56V',
                      description: 'Original Standard Test',
                      published_version_id: 'ver-source',
                      source_metadata: { targetVoltage: 56 },
                    },
                  },
                  error: null,
                }),
              ),
            })),
          })),
          insert: vi.fn((row: any) => {
            insertedVersion = row
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'ver-mini-456', ...row }, error: null })),
              })),
            }
          }),
          update: vi.fn((updates: any) => {
            insertedVersion = { ...insertedVersion, ...updates }
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { id: 'ver-mini-456', ...insertedVersion },
                      error: null,
                    }),
                  ),
                })),
              })),
            }
          }),
        }
      }
      if (table === 'test_sections') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: mockSections, error: null })),
            })),
          })),
          insert: vi.fn((rows: any) => {
            insertedSections = Array.isArray(rows) ? rows : [rows]
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: `new-sec-${rows.section_order || 1}`, section_order: rows.section_order || 1, ...rows },
                    error: null,
                  }),
                ),
              })),
            }
          }),
        }
      }
      if (table === 'test_items') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: mockItems, error: null })),
            })),
          })),
          insert: vi.fn((rows: any) => {
            insertedItems.push(rows)
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: `new-item-${insertedItems.length}`,
                      section_id: rows.section_id,
                      item_order: rows.item_order,
                      ...rows,
                    },
                    error: null,
                  }),
                ),
              })),
            }
          }),
        }
      }
      if (table === 'section_measurement_snapshots') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          insert: vi.fn(() => Promise.resolve({ error: null })),
        }
      }
      if (table === 'narration_variants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: mockVariants, error: null })),
          })),
          insert: vi.fn((rows: any[]) => {
            insertedVariants = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
      return {}
    })

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue({ from: mockFrom } as any)

    const { createMiniTestVariantFromPackage } = await import('./test-packages')

    const result = await createMiniTestVariantFromPackage({
      sourcePackageVersionId: 'ver-source',
      customCode: 'mini-g1-56v',
      customTitle: 'Mini G1-56V (21 câu)',
      samplingStrategy: 'first',
      questionsPerSection: 3,
      copyAudio: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.package.id).toBe('pkg-mini-123')
      expect(result.data.version.id).toBe('ver-mini-456')
      expect(result.data.itemCount).toBe(21) // 7 sessions * 3 questions
    }

    // Verify package metadata
    expect(insertedPackage?.slug).toBe('mini-g1-56v')
    expect(insertedPackage?.source_metadata?.package_kind).toBe('mini')
    expect(insertedPackage?.source_metadata?.total_items).toBe(21)
    expect(insertedVersion?.package_id).toBe('pkg-mini-123')
    expect(insertedVersion?.status).toBe('published')
    expect(insertedVersion?.snapshot_hash).toBeDefined()
    expect(insertedSections.length).toBeGreaterThan(0)

    // Verify exactly 21 items inserted
    expect(insertedItems).toHaveLength(21)

    // Verify zero-waste audio reuse cloned narration variants
    expect(insertedVariants.length).toBeGreaterThan(0)
    // Every cloned variant points directly to original audio_asset_id
    for (const variant of insertedVariants) {
      expect(variant.audio_asset_id).toBeDefined()
      expect(variant.package_version_id).toBe('ver-mini-456')
      if (variant.narration_target === 'test_item') {
        expect(variant.test_section_id).toBeNull()
        expect(variant.test_item_id).toBeDefined()
      } else if (variant.narration_target === 'section_intro') {
        expect(variant.test_section_id).toBeDefined()
        expect(variant.test_item_id).toBeNull()
      } else {
        expect(variant.test_section_id).toBeNull()
        expect(variant.test_item_id).toBeNull()
      }
    }
  })
})


