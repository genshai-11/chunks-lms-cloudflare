import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AdminPackageTestsPage, detectPackageTestType } from './AdminPackageTestsPage'
import * as testPackagesLib from '../../lib/test-packages'
import * as liveTestGenLib from '../../modules/catalog/live-test-generation'
import * as supabaseLib from '../../lib/supabase'

describe('AdminPackageTestsPage', { timeout: 20000 }, () => {
  it('renders package studio page header, tabs, and create button', async () => {
    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-1',
          organizationId: 'org-1',
          title: 'RED-TEST-42Q-TOPIC12-56V · LIVE',
          slug: 'red-test-42q-topic12-56v',
          description: 'Red test package description',
          createdByUserId: null,
          sourceMetadata: { testType: 'red', targetVoltage: 56, questionCount: 42 },
          archivedAt: null,
        },
        {
          id: 'pkg-2',
          organizationId: 'org-1',
          title: 'GREEN-TEST-21Q-FOCUS-12V',
          slug: 'green-test-21q-focus-12v',
          description: 'Green test package description',
          createdByUserId: null,
          sourceMetadata: { testType: 'green', targetVoltage: 12, questionCount: 21 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-1',
          packageId: 'pkg-1',
          versionLabel: 'v1',
          status: 'published',
          snapshotHash: null,
          publishedAt: null,
          sourceMetadata: {},
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [],
    })

    vi.spyOn(liveTestGenLib, 'listFirestoreLessons').mockResolvedValue([
      { id: 'l1', lessonTitle: 'Day 1 Lesson', levelCode: 'A', dayNumber: 1, totalChunks: 40 },
    ])

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Package Tests Studio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create Package Test/i })).toBeInTheDocument()

    // Verify packages are rendered and trailing · LIVE is stripped from title
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /RED-TEST-42Q-TOPIC12-56V/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /RED-TEST-42Q-TOPIC12-56V · LIVE/i })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /GREEN-TEST-21Q-FOCUS-12V/i })).toBeInTheDocument()
    })

    // Filter tabs
    expect(screen.getByRole('button', { name: /Green test/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Red test/i })).toBeInTheDocument()
  })

  it('opens Create Package Test modal when clicking Create Package Test button', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [],
    })
    vi.spyOn(liveTestGenLib, 'listFirestoreLessons').mockResolvedValue([
      { id: 'l1', lessonTitle: 'Day 1 Lesson', levelCode: 'A', dayNumber: 1, totalChunks: 40 },
    ])

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    const createBtn = screen.getByRole('button', { name: /Create Package Test/i })
    await user.click(createBtn)

    expect(screen.getByRole('heading', { name: /Create Test Package/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Generator \(Firestore Vocab\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manual Blank Draft/i })).toBeInTheDocument()
    expect(screen.getByText(/Dynamic Test Type/i)).toBeInTheDocument()
  })

  it('detectPackageTestType correctly identifies R4-31V-0826 and red/green packages', () => {
    // Exact user reported case: R4-31V-0826 without explicit metadata must be classified as RED
    expect(detectPackageTestType({ title: 'R4-31V-0826', slug: 'r4-31v-0826' })).toBe('red')
    expect(detectPackageTestType({ title: 'R01-42Q-56V', slug: 'r01-42q-56v' })).toBe('red')
    expect(detectPackageTestType({ title: 'RED-TEST-AWARENESS', slug: 'red-test-01' })).toBe('red')

    // Green tests
    expect(detectPackageTestType({ title: 'G01-21Q-12V', slug: 'g01-21q-12v' })).toBe('green')
    expect(detectPackageTestType({ title: 'GREEN-TEST-FOCUS', slug: 'green-test-01' })).toBe('green')
    expect(detectPackageTestType({ title: 'General Practice Test', slug: 'general-practice' })).toBe('green')
  })

  it('switches between Studio tabs (Gói bài test, Soạn thảo, Audio, CCI)', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [],
    })
    vi.spyOn(testPackagesLib, 'listCciProfiles').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'prof-1',
          organizationId: 'org-1',
          name: 'Ecommerce 7-Session Ample',
          versionLabel: 'v1',
          status: 'active',
          description: 'Ample curve for eCommerce',
        },
      ],
    })
    vi.spyOn(testPackagesLib, 'listCciCategories').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'cat-1',
          profileId: 'prof-1',
          categoryOrder: 1,
          label: 'Session 1 Ample',
          value: 6.0,
          description: null,
          metadata: {},
        },
      ],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    // Switch to Soạn thảo & Nội dung câu
    const contentTab = screen.getByRole('button', { name: /Soạn thảo & Nội dung câu/i })
    await user.click(contentTab)
    expect(screen.getByText(/Vui lòng chọn một gói bài test từ danh mục/i)).toBeInTheDocument()

    // Switch to Quản lý Audio & Review
    const audioTab = screen.getByRole('button', { name: /Quản lý Audio & Review/i })
    await user.click(audioTab)
    expect(screen.getByText(/Vui lòng chọn một gói bài test từ danh mục để quản lý âm thanh/i)).toBeInTheDocument()

    // Switch to Hệ số CCI & Ample CRUD
    const cciTab = screen.getByRole('button', { name: /Hệ số CCI & Ample CRUD/i })
    await user.click(cciTab)
    expect(screen.getByRole('heading', { name: /Quản lý Hệ Số CCI & Cường Độ Ample/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ Hồ sơ mới/i })).toBeInTheDocument()
  })

  it('displays CVR formula and Ample inputs in active AI generator modal', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [],
    })
    vi.spyOn(liveTestGenLib, 'listFirestoreLessons').mockResolvedValue([
      { id: 'l1', lessonTitle: 'Day 1 Lesson', levelCode: 'A', dayNumber: 1, totalChunks: 40 },
    ])

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    const createBtn = screen.getByRole('button', { name: /Create Package Test/i })
    await user.click(createBtn)

    // Verify CVR controls are present
    expect(screen.getByText(/Tham số CVR = TC × TL × LC/i)).toBeInTheDocument()
    expect(screen.getByText(/TC \(Term\)/i)).toBeInTheDocument()
    expect(screen.getByText(/TL \(Topic Level\)/i)).toBeInTheDocument()
    expect(screen.getByText(/LC \(Length\)/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Số Session/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Số câu \/ session/i)).toBeInTheDocument()
    expect(screen.getByText(/Target CPD \(Volt\)/i)).toBeInTheDocument()
  })

  it('renders Green validation badges when inspecting package content', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-green',
          organizationId: 'org-1',
          title: 'GREEN-TEST-FOCUS-12V',
          slug: 'green-test-focus-12v',
          description: null,
          createdByUserId: null,
          sourceMetadata: { testType: 'green', targetVoltage: 12 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-green',
          packageId: 'pkg-green',
          versionLabel: 'v1',
          status: 'draft',
          snapshotHash: null,
          publishedAt: null,
          sourceMetadata: {},
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'sec-1',
          packageVersionId: 'ver-green',
          sectionOrder: 1,
          title: 'Focus Sprint 1',
          targetCvrOhm: 3.0,
          introTextVi: 'Phần 1',
          introTextEn: 'Part 1',
          cciProfileId: 'prof-1',
          cciCategoryId: 'cat-1',
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestItems').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'item-1',
          packageVersionId: 'ver-green',
          sectionId: 'sec-1',
          itemOrder: 1,
          termVi: 'quy trình thanh toán',
          termEn: 'payment process',
          promptVi: 'Khách hàng hoàn tất quy trình thanh toán trực tuyến nhanh chóng và thuận tiện.',
          promptEn: 'Customers complete the online payment process quickly and conveniently.',
          spokenScriptVi: 'Khách hàng hoàn tất quy trình thanh toán trực tuyến nhanh chóng và thuận tiện.',
          spokenScriptEn: 'Customers complete the online payment process quickly and conveniently.',
          tc: 3.0,
          lc: 1.0,
          tl: 1.0,
          measuredCvr: 3.0,
        },
      ],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /GREEN-TEST-FOCUS-12V/i })).toBeInTheDocument()
    })

    const contentBtn = screen.getByRole('button', { name: /Soạn thảo & Nội dung/i })
    await user.click(contentBtn)

    await waitFor(() => {
      expect(screen.getByText(/Focus Sprint 1/i)).toBeInTheDocument()
      expect(screen.getAllByText(/quy trình thanh toán/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/15 từ \(Giới hạn: 8–22 từ\)/i)).toBeInTheDocument()
    })
  })

  it('renders complete lifecycle audio cards including part_intro and session_intro in Audio tab', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-audio',
          organizationId: 'org-1',
          title: 'RED-TEST-42Q-56V',
          slug: 'red-test-42q-56v',
          description: null,
          createdByUserId: null,
          sourceMetadata: { testType: 'red', targetVoltage: 56 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-audio',
          packageId: 'pkg-audio',
          versionLabel: 'v1',
          status: 'draft',
          snapshotHash: null,
          publishedAt: null,
          sourceMetadata: {},
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'sec-audio-1',
          packageVersionId: 'ver-audio',
          sectionOrder: 1,
          title: 'Awareness Trap 1',
          targetCvrOhm: 6.9,
          introTextVi: 'Phiên 1 - Bắt đầu',
          introTextEn: 'Session 1 - Start',
          cciProfileId: 'prof-1',
          cciCategoryId: 'cat-1',
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestItems').mockResolvedValue({
      ok: true,
      data: [],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /RED-TEST-42Q-56V/i })).toBeInTheDocument()
    })

    const audioBtn = screen.getByRole('button', { name: /^Audio$/i })
    await user.click(audioBtn)

    await waitFor(() => {
      expect(screen.getByText(/Lời Chào Đầu Bài \(Package Start\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Lời Chúc Mừng Kết Thúc \(Package End\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Giới thiệu từng phần \(Part Intros · P1 - P3\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Part 1 Intro/i)).toBeInTheDocument()
      expect(screen.getByText(/Giới thiệu từng phiên \(Session Intros/i)).toBeInTheDocument()
      expect(screen.getByText(/Session 1: Awareness Trap 1/i)).toBeInTheDocument()
    })
  })

  it('switches to Formulas & Generator Physics tab and displays formulas, archetype matrix, and physics sandbox', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    const formulasTab = screen.getByRole('button', { name: /Công thức & Generator Physics/i })
    await user.click(formulasTab)

    expect(screen.getByText(/Vật Lý Nhận Thức & Công Thức Sinh Đề Chunks/i)).toBeInTheDocument()
    expect(screen.getByText(/CVR = TC × TL × LC/i)).toBeInTheDocument()
    expect(screen.getByText(/CPD = CVR × CCI/i)).toBeInTheDocument()
    expect(screen.getByText(/CCI = round\(CPD \/ CVR\)/i)).toBeInTheDocument()
    expect(screen.getByText(/GREEN TEST \(Focus\)/i)).toBeInTheDocument()
    expect(screen.getByText(/RED TEST \(Awareness\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Green Focus 12V/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Red Awareness 56V/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Áp dụng vào Generator & Tạo Đề/i })).toBeInTheDocument()
  })

  it('supports multi-view modes across Packages, Content, and Audio tabs', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-modes',
          organizationId: 'org-1',
          title: 'GREEN-TEST-21Q-FOCUS-12V',
          slug: 'green-test-21q-focus-12v',
          description: 'Package for view mode test',
          createdByUserId: null,
          sourceMetadata: { testType: 'green', targetVoltage: 12 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-modes',
          packageId: 'pkg-modes',
          versionLabel: 'v1',
          status: 'draft',
          snapshotHash: null,
          publishedAt: null,
          sourceMetadata: {},
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'sec-m1',
          packageVersionId: 'ver-modes',
          sectionOrder: 1,
          title: 'Section 1',
          targetCvrOhm: 3.0,
          introTextVi: 'Intro 1',
          introTextEn: 'Intro 1',
          cciProfileId: null,
          cciCategoryId: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestItems').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'item-m1',
          packageVersionId: 'ver-modes',
          sectionId: 'sec-m1',
          itemOrder: 1,
          termVi: 'quy trình xử lý',
          termEn: 'processing flow',
          promptVi: 'Đội ngũ kỹ sư tiến hành kiểm tra quy trình xử lý dữ liệu tự động.',
          promptEn: 'Engineers test the automated data processing workflow.',
          spokenScriptVi: 'Đội ngũ kỹ sư tiến hành kiểm tra quy trình xử lý dữ liệu tự động.',
          spokenScriptEn: 'Engineers test the automated data processing workflow.',
          tc: 3.0,
          lc: 1.0,
          tl: 1.0,
          measuredCvr: 3.0,
        },
      ],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /GREEN-TEST-21Q-FOCUS-12V/i })).toBeInTheDocument()
    })

    // Test Packages Tab: Switch to Table View
    const packagesTableBtn = screen.getByTitle(/Dạng bảng chi tiết/i)
    await user.click(packagesTableBtn)
    expect(screen.getByText(/Phân loại & Điện áp/i)).toBeInTheDocument()

    // Switch to Content tab
    const contentTab = screen.getByRole('button', { name: /Soạn thảo & Nội dung câu/i })
    await user.click(contentTab)

    // Test Content Tab: Table View
    const contentTableBtn = screen.getByTitle(/Bảng toàn bộ câu hỏi/i)
    await user.click(contentTableBtn)
    expect(screen.getByText(/Nội dung Tiếng Việt \(VI\)/i)).toBeInTheDocument()

    // Test Content Tab: Validation View
    const contentValidationBtn = screen.getByTitle(/Kiểm định chất lượng & Vật lý/i)
    await user.click(contentValidationBtn)
    expect(screen.getByText(/Tỷ lệ tuân thủ quy chuẩn/i)).toBeInTheDocument()
    expect(screen.getByText(/Quy chuẩn vật lý & ngôn ngữ học cho GREEN TEST/i)).toBeInTheDocument()

    // Switch to Audio tab
    const audioTab = screen.getByRole('button', { name: /Quản lý Audio & Review/i })
    await user.click(audioTab)

    // Test Audio Tab: Table View
    const audioTableBtn = screen.getByTitle(/Bảng tổng hợp Audio/i)
    await user.click(audioTableBtn)
    expect(screen.getByText(/Bảng tổng hợp toàn bộ tài sản âm thanh/i)).toBeInTheDocument()
    expect(screen.getByText(/Kịch bản phát âm \(Script\)/i)).toBeInTheDocument()
  })

  it('displays audio storage status badges and maps variants across Content and Audio tabs', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-audio',
          organizationId: 'org-1',
          title: 'GREEN-TEST-AUDIO-DEMO',
          slug: 'green-test-audio-demo',
          description: 'Package with audio variants',
          createdByUserId: null,
          sourceMetadata: { testType: 'green', targetVoltage: 12, questionCount: 2 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-audio',
          packageId: 'pkg-audio',
          versionLabel: 'v1',
          status: 'draft',
          snapshotHash: null,
          publishedAt: null,
          sourceMetadata: {},
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'sec-audio-1',
          packageVersionId: 'ver-audio',
          sectionOrder: 1,
          title: 'Session 1',
          targetCvrOhm: 3.0,
          introTextVi: 'Intro Section 1',
          introTextEn: 'Intro Section 1',
          cciProfileId: null,
          cciCategoryId: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestItems').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'item-audio-1',
          packageVersionId: 'ver-audio',
          sectionId: 'sec-audio-1',
          itemOrder: 1,
          termVi: 'từ vựng 1',
          termEn: 'vocab 1',
          promptVi: 'Câu hỏi số 1 nội dung tiếng Việt.',
          promptEn: 'Question number 1 English content.',
          spokenScriptVi: 'Câu hỏi số 1 nội dung tiếng Việt.',
          spokenScriptEn: 'Question number 1 English content.',
          tc: 3.0,
          lc: 1.0,
          tl: 1.0,
          measuredCvr: 3.0,
        },
        {
          id: 'item-audio-2',
          packageVersionId: 'ver-audio',
          sectionId: 'sec-audio-1',
          itemOrder: 2,
          termVi: 'từ vựng 2',
          termEn: 'vocab 2',
          promptVi: 'Câu hỏi số 2 chưa lưu audio.',
          promptEn: 'Question number 2 no audio yet.',
          spokenScriptVi: 'Câu hỏi số 2 chưa lưu audio.',
          spokenScriptEn: 'Question number 2 no audio yet.',
          tc: 3.0,
          lc: 1.0,
          tl: 1.0,
          measuredCvr: 3.0,
        },
      ],
    })

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'narration_variants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'var-item-1',
                  narration_target: 'test_item',
                  language: 'en',
                  voice_id: 'google/en-US-Neural2-F',
                  audio_asset_id: 'asset-1',
                  approval_status: 'approved',
                  test_item_id: 'item-audio-1',
                  test_section_id: 'sec-audio-1',
                  provider_metadata: null,
                },
                {
                  id: 'var-pkg-start',
                  narration_target: 'package_start',
                  language: 'vi',
                  voice_id: 'google/vi-VN-Neural2-A',
                  audio_asset_id: 'asset-start',
                  approval_status: 'approved',
                  test_item_id: null,
                  test_section_id: null,
                  provider_metadata: null,
                },
              ],
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }
      }),
    }

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue(mockSupabase as any)

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /GREEN-TEST-AUDIO-DEMO/i })).toBeInTheDocument()
    })

    // Content tab: verify accordion shows "Đã lưu audio" and "Chưa lưu audio"
    const contentTab = screen.getByRole('button', { name: /Soạn thảo & Nội dung câu/i })
    await user.click(contentTab)

    await waitFor(() => {
      const savedBadges = screen.getAllByText('Đã lưu audio')
      const unsavedBadges = screen.getAllByText('Chưa lưu audio')
      expect(savedBadges.length).toBeGreaterThanOrEqual(1)
      expect(unsavedBadges.length).toBeGreaterThanOrEqual(1)
    })

    // Switch to Audio tab: verify badges display
    const audioTab = screen.getByRole('button', { name: /Quản lý Audio & Review/i })
    await user.click(audioTab)

    await waitFor(() => {
      const savedBadges = screen.getAllByText('Đã lưu audio')
      const unsavedBadges = screen.getAllByText('Chưa lưu audio')
      expect(savedBadges.length).toBeGreaterThanOrEqual(1)
      expect(unsavedBadges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('supports category filtering (Standard vs Mini) and opens Create Mini modal', async () => {
    const user = userEvent.setup()

    vi.spyOn(testPackagesLib, 'listTestPackages').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pkg-std-1',
          organizationId: 'org-1',
          title: 'G1-56V-ECOMMERCE · LIVE',
          slug: 'g1-56v-ecommerce',
          description: 'Standard 49 questions test',
          createdByUserId: null,
          sourceMetadata: { package_kind: 'standard', total_items: 49 },
          archivedAt: null,
        },
        {
          id: 'pkg-mini-1',
          organizationId: 'org-1',
          title: '[Mini] G1-56V-ECOMMERCE',
          slug: 'mini-g1-56v-ecommerce',
          description: 'Mini variant 21 questions',
          createdByUserId: null,
          sourceMetadata: { package_kind: 'mini', total_items: 21 },
          archivedAt: null,
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestPackageVersions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ver-std-1',
          packageId: 'pkg-std-1',
          versionLabel: 'v1.0.0',
          status: 'published',
          snapshotHash: null,
          publishedAt: '2026-09-24T00:00:00Z',
          sourceMetadata: { package_kind: 'standard', total_items: 49 },
        },
        {
          id: 'ver-mini-1',
          packageId: 'pkg-mini-1',
          versionLabel: 'v1.0.0',
          status: 'published',
          snapshotHash: null,
          publishedAt: '2026-09-24T00:00:00Z',
          sourceMetadata: { package_kind: 'mini', total_items: 21 },
        },
      ],
    })

    vi.spyOn(testPackagesLib, 'listTestSections').mockResolvedValue({
      ok: true,
      data: [],
    })

    render(
      <MemoryRouter>
        <AdminPackageTestsPage />
      </MemoryRouter>,
    )

    // Wait for packages to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^G1-56V-ECOMMERCE$/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /\[Mini\] G1-56V-ECOMMERCE/i })).toBeInTheDocument()
    })

    // Verify Category Filter Tabs exist
    expect(screen.getByRole('button', { name: /Standard \(49 câu\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mini-test \(21 câu\)/i })).toBeInTheDocument()

    // Filter by Mini-test only
    const miniFilterBtn = screen.getByRole('button', { name: /Mini-test \(21 câu\)/i })
    await user.click(miniFilterBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /\[Mini\] G1-56V-ECOMMERCE/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /^G1-56V-ECOMMERCE$/i })).not.toBeInTheDocument()
    })

    // Filter by Standard only
    const standardFilterBtn = screen.getByRole('button', { name: /Standard \(49 câu\)/i })
    await user.click(standardFilterBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^G1-56V-ECOMMERCE$/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /\[Mini\] G1-56V-ECOMMERCE/i })).not.toBeInTheDocument()
    })

    // Verify "Tạo Mini" button is visible for the standard package
    const createMiniBtn = await screen.findByTestId('create-mini-btn')
    expect(createMiniBtn).toBeInTheDocument()

    // Click "Tạo Mini" to open modal
    await user.click(createMiniBtn)

    await waitFor(() => {
      expect(screen.getByText(/⚡ Zero-Waste Audio & Data Reuse/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/mini-g1-56v/i)).toBeInTheDocument()
    })
  })
})


