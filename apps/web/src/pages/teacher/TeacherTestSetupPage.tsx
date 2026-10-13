import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  Gauge,
  Layers3,
  ListChecks,
  Loader2,
  Play,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import {
  getTestPackage,
  getTestPackageVersion,
  detectPackageKind,
  type PackageKind,
  listSectionNarrationReview,
  listTestItems,
  listTestSections,
  type NarrationReviewRecord,
} from '../../lib/test-packages'
import { getSupabase } from '../../lib/supabase'
import type { TestItem, TestSection } from '../../modules/catalog/test-package-catalog'
import {
  audioReadiness,
  type AudioLanguage,
  type AudioTargetStatus,
} from '../../modules/catalog/spoken-scripts'
import {
  listStandaloneAssignments,
  prepareStandaloneRun,
  startStandaloneRun,
} from '../../lib/standalone-tests'
import { generateNarration } from '../../modules/catalog/live-test-generation'

type RunMode = 'single' | 'multi' | 'full'
type SectionPreview = {
  section: TestSection
  itemCount: number
}
type AudioSummary = ReturnType<typeof audioReadiness> & {
  generated: number
  missing: number
  approvedModelSpecific: boolean
}
type AudioStatusSummary = {
  vi: AudioSummary
  en: AudioSummary
}

function defaultLanguageForSection(
  section: TestSection,
  languagePolicy?: unknown,
  pkgType?: 'green' | 'red' | string | null,
  sessionLanguages?: Array<'vi' | 'en'> | null,
  sectionIntroLang?: 'vi' | 'en' | null,
  languagePlan?: Record<string, 'vi' | 'en'> | null,
): AudioLanguage {
  // 1. Direct from section_intro audio variant established in the package
  if (sectionIntroLang === 'vi' || sectionIntroLang === 'en') {
    return sectionIntroLang
  }

  // 2. Language plan in version source_metadata (e.g. { "1": "en", "2": "en", ... })
  if (languagePlan) {
    const planLang = languagePlan[String(section.sectionOrder)] || languagePlan[section.sectionOrder]
    if (planLang === 'vi' || planLang === 'en') {
      return planLang
    }
  }

  // 3. Explicit sessionLanguages array from package version metadata
  if (Array.isArray(sessionLanguages) && sessionLanguages[section.sectionOrder - 1]) {
    return sessionLanguages[section.sectionOrder - 1]
  }

  // 4. Section specific metadata
  const secMeta = (section as any).metadata || (section as any).sourceMetadata
  if (secMeta?.sessionLanguage === 'vi' || secMeta?.sessionLanguage === 'en') {
    return secMeta.sessionLanguage
  }

  // 5. Known language policies
  if (languagePolicy === 'alternating_vi_en') {
    return section.sectionOrder % 2 === 1 ? 'vi' : 'en'
  }
  if (languagePolicy === 'first4_en_last4_vi') {
    return section.sectionOrder <= 4 ? 'en' : 'vi'
  }
  if (languagePolicy === 'green_test_49q') {
    return section.sectionOrder <= 3 || section.sectionOrder === 7 ? 'en' : 'vi'
  }

  // 6. Archetype 7x3 defaults (Green: S1-S3 EN, S4-S6 VI, S7 EN; Red: S1-S3 VI, S4-S7 EN)
  if ((pkgType || '').toLowerCase() === 'green') {
    return section.sectionOrder <= 3 || section.sectionOrder === 7 ? 'en' : 'vi'
  } else if ((pkgType || '').toLowerCase() === 'red') {
    return section.sectionOrder <= 3 ? 'vi' : 'en'
  }

  return section.sectionOrder <= 4 ? 'vi' : 'en'
}

function summarizeStatuses(statuses: AudioTargetStatus[]): AudioSummary {
  const readiness = audioReadiness(statuses)
  return {
    ...readiness,
    generated: statuses.filter((status) => status === 'generated').length,
    missing: statuses.filter((status) => status === 'missing').length,
    approvedModelSpecific: readiness.ready,
  }
}

function targetKey(record: NarrationReviewRecord): string {
  return record.variant.narrationTarget === 'section_intro'
    ? `section:${record.variant.testSectionId}`
    : `item:${record.variant.testItemId}`
}

function languageAudioTargetStatus(
  records: NarrationReviewRecord[],
  key: string,
): AudioTargetStatus {
  const candidates = records.filter((record) => targetKey(record) === key)
  if (candidates.some((record) => record.variant.approvalStatus === 'approved' && record.variant.audioAssetId)) {
    return 'approved'
  }
  if (candidates.some((record) => record.job?.status === 'failed')) return 'failed'
  if (candidates.some((record) => record.variant.approvalStatus === 'generated' && record.variant.audioAssetId)) {
    return 'generated'
  }
  if (candidates.some((record) => ['rejected', 'archived'].includes(record.variant.approvalStatus))) {
    return 'rejected'
  }
  return 'missing'
}

async function sectionAudioStatuses(input: {
  packageVersionId: string
  section: TestSection
  items: TestItem[]
  language: AudioLanguage
}): Promise<AudioTargetStatus[]> {
  const review = await listSectionNarrationReview({
    packageVersionId: input.packageVersionId,
    sectionId: input.section.id,
    itemIds: input.items.map((item) => item.id),
    language: input.language,
  })
  if (!review.ok) return Array(input.items.length + 1).fill('missing')
  return [
    languageAudioTargetStatus(review.data, `section:${input.section.id}`),
    ...input.items.map((item) => languageAudioTargetStatus(review.data, `item:${item.id}`)),
  ]
}

export function TeacherTestSetupPage() {
  const { assignmentId, sectionId: initialSectionId } = useParams()
  const navigate = useNavigate()
  const [packageVersionId, setPackageVersionId] = useState('')
  const [packageKind, setPackageKind] = useState<PackageKind>('standard')
  const [packageType, setPackageType] = useState<'green' | 'red' | null>(null)
  const [packageSessionLanguages, setPackageSessionLanguages] = useState<Array<'vi' | 'en'> | null>(null)
  const [languagePolicy, setLanguagePolicy] = useState<unknown>(null)
  const [sections, setSections] = useState<TestSection[]>([])
  const [itemsBySection, setItemsBySection] = useState<Record<string, TestItem[]>>({})
  const [sectionId, setSectionId] = useState(initialSectionId ?? '')
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set())
  const [languageBySection, setLanguageBySection] = useState<Record<string, AudioLanguage>>({})
  const [voiceId] = useState('google/vi-VN-Neural2-A')
  const [autoPlaySessionIntro, setAutoPlaySessionIntro] = useState(() =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem('chunks-lms:live-test-autoplay-intro') === 'true'
      : false,
  )
  const [autoPlayItems, setAutoPlayItems] = useState(() =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem('chunks-lms:live-test-autoplay-items') === 'true'
      : false,
  )
  const [audioSummaryBySection, setAudioSummaryBySection] = useState<Record<string, AudioStatusSummary>>({})
  const [runMode, setRunMode] = useState<RunMode>('full')
  const [busy, setBusy] = useState(false)
  const [generatingKey, setGeneratingKey] = useState<string | null>(null)
  const [generationProgress, setGenerationProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAudioSummary = useCallback(
    async (nextPackageVersionId = packageVersionId, nextSections = sections) => {
      if (!nextPackageVersionId || nextSections.length === 0) return
      const summaries: Record<string, AudioStatusSummary> = {}
      await Promise.all(
        nextSections.map(async (section) => {
          const items = itemsBySection[section.id] ?? []
          const [viStatuses, enStatuses] = await Promise.all([
            sectionAudioStatuses({ packageVersionId: nextPackageVersionId, section, items, language: 'vi' }),
            sectionAudioStatuses({ packageVersionId: nextPackageVersionId, section, items, language: 'en' }),
          ])
          summaries[section.id] = {
            vi: summarizeStatuses(viStatuses),
            en: summarizeStatuses(enStatuses),
          }
        }),
      )
      setAudioSummaryBySection(summaries)
    },
    [itemsBySection, packageVersionId, sections],
  )

  useEffect(() => {
    if (!assignmentId) return
    void (async () => {
      const assignments = await listStandaloneAssignments()
      if (!assignments.ok) return setError(assignments.error)
      const assignment = assignments.data.find((candidate) => candidate.id === assignmentId)
      if (!assignment) return setError('Standalone assignment not found')
      setPackageVersionId(assignment.packageVersionId)
      const versionResult = await getTestPackageVersion(assignment.packageVersionId)
      if (versionResult.ok && versionResult.data) {
        setPackageKind(detectPackageKind({ sourceMetadata: versionResult.data.sourceMetadata }))
      }
      const meta = versionResult.ok ? (versionResult.data?.sourceMetadata as Record<string, any>) : null
      const languagePlan = meta?.languagePlan as Record<string, 'vi' | 'en'> | null
      const nextLanguagePolicy = meta?.languagePolicy ?? null
      setLanguagePolicy(nextLanguagePolicy ?? null)
      const sessionLanguages = (meta?.sessionLanguages ?? null) as Array<'vi' | 'en'> | null
      setPackageSessionLanguages(sessionLanguages ?? null)
      let pkgType: 'green' | 'red' | null = null
      if (meta?.testType === 'green' || meta?.testType === 'red') {
        pkgType = meta.testType
      } else if (versionResult.ok && versionResult.data?.packageId) {
        const pkgRes = await getTestPackage(versionResult.data.packageId)
        if (pkgRes.ok && pkgRes.data) {
          const title = pkgRes.data.title.toLowerCase()
          pkgType = title.includes('green') ? 'green' : title.includes('red') ? 'red' : null
        }
      }
      setPackageType(pkgType)

      // Query section_intro narration variants to get exact established language per session
      const sb = getSupabase()
      const sectionIntroLangs: Record<string, 'vi' | 'en'> = {}
      if (sb) {
        const { data: secVars } = await (sb as any)
          .from('narration_variants')
          .select('test_section_id, language')
          .eq('package_version_id', assignment.packageVersionId)
          .eq('narration_target', 'section_intro')
          .eq('approval_status', 'approved')
          .not('audio_asset_id', 'is', null)

        if (Array.isArray(secVars)) {
          for (const v of secVars) {
            if (v.test_section_id && (v.language === 'vi' || v.language === 'en')) {
              sectionIntroLangs[v.test_section_id] = v.language
            }
          }
        }
      }

      const sectionResult = await listTestSections(assignment.packageVersionId)
      if (!sectionResult.ok) return setError(sectionResult.error)
      setSections(sectionResult.data)
      setSectionId((current) =>
        sectionResult.data.some((section) => section.id === current)
          ? current
          : (sectionResult.data[0]?.id ?? ''),
      )
      setSelectedSectionIds(new Set(sectionResult.data.map((section) => section.id)))
      setLanguageBySection(
        Object.fromEntries(
          sectionResult.data.map((section) => [
            section.id,
            defaultLanguageForSection(
              section,
              nextLanguagePolicy,
              pkgType,
              sessionLanguages,
              sectionIntroLangs[section.id],
              languagePlan,
            ),
          ]),
        ),
      )

      const itemResults = await Promise.all(
        sectionResult.data.map(async (section) => [section.id, await listTestItems(section.id)] as const),
      )
      const nextItems: Record<string, TestItem[]> = {}
      for (const [id, result] of itemResults) {
        if (result.ok) nextItems[id] = result.data
      }
      setItemsBySection(nextItems)
    })()
  }, [assignmentId])

  useEffect(() => {
    try {
      window.localStorage.setItem('chunks-lms:live-test-autoplay-intro', String(autoPlaySessionIntro))
    } catch {
      /* ignore */
    }
  }, [autoPlaySessionIntro])

  useEffect(() => {
    try {
      window.localStorage.setItem('chunks-lms:live-test-autoplay-items', String(autoPlayItems))
    } catch {
      /* ignore */
    }
  }, [autoPlayItems])

  useEffect(() => {
    void loadAudioSummary()
  }, [loadAudioSummary])

  const preview = useMemo<SectionPreview[]>(
    () =>
      sections.map((section) => ({
        section,
        itemCount: itemsBySection[section.id]?.length ?? 0,
      })),
    [itemsBySection, sections],
  )

  const targetPreview = useMemo(() => {
    if (runMode === 'full') return preview
    if (runMode === 'single') return preview.filter((item) => item.section.id === sectionId)
    return preview.filter((item) => selectedSectionIds.has(item.section.id))
  }, [preview, runMode, sectionId, selectedSectionIds])

  const totalItemCount = useMemo(
    () => targetPreview.reduce((sum, item) => sum + item.itemCount, 0),
    [targetPreview],
  )
  const packageItemCount = useMemo(
    () => preview.reduce((sum, item) => sum + item.itemCount, 0),
    [preview],
  )

  function toggleSection(section: TestSection) {
    setRunMode('multi')
    setSelectedSectionIds((current) => {
      const next = new Set(current)
      if (next.has(section.id)) next.delete(section.id)
      else next.add(section.id)
      return next
    })
  }

  function audioPrepHref(section: TestSection, language: AudioLanguage) {
    return `/admin/package-tests?tab=audio&version=${packageVersionId}&section=${section.id}&language=${language}&voice=${encodeURIComponent(voiceId)}`
  }


  async function generateAudioForTargets(
    targets: Array<{ section: TestSection; language: AudioLanguage }>,
    key: string,
  ) {
    if (!packageVersionId || !voiceId || targets.length === 0) return
    const total = targets.reduce((sum, target) => sum + (itemsBySection[target.section.id]?.length ?? 0) + 1, 0)
    let done = 0
    setGeneratingKey(key)
    setGenerationProgress({ done, total })
    setError(null)
    setMessage(null)
    try {
      for (const target of targets) {
        const sectionItems = itemsBySection[target.section.id] ?? []
        const introReceipt = await generateNarration({
          packageVersionId,
          target: 'section_intro',
          testSectionId: target.section.id,
          language: target.language,
          voiceId,
        })
        if (introReceipt.status === 'failed') {
          throw new Error(introReceipt.errorMessage ?? `Generation failed for Session ${target.section.sectionOrder} intro`)
        }
        done += 1
        setGenerationProgress({ done, total })

        for (const item of sectionItems) {
          const itemReceipt = await generateNarration({
            packageVersionId,
            target: 'test_item',
            testItemId: item.id,
            language: target.language,
            voiceId,
          })
          if (itemReceipt.status === 'failed') {
            throw new Error(itemReceipt.errorMessage ?? `Generation failed for Session ${target.section.sectionOrder} Item ${item.itemOrder}`)
          }
          done += 1
          setGenerationProgress({ done, total })
        }
      }
      await loadAudioSummary()
      setMessage(
        `Generated ${done} audio prompt${done === 1 ? '' : 's'} for ${targets.length} session${targets.length === 1 ? '' : 's'}. Review and approve generated audio before starting the test.`,
      )
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(
        `Generate audio failed. ${detail} If this account cannot generate paid audio, sign in as active staff with generation access or open Admin Audio Prep.`,
      )
    } finally {
      setGeneratingKey(null)
      setGenerationProgress(null)
    }
  }

  function pendingGenerationTargets() {
    return targetPreview
      .map((item) => {
        const language = languageBySection[item.section.id] ?? defaultLanguageForSection(item.section, languagePolicy, packageType, packageSessionLanguages)
        return { section: item.section, language }
      })
      .filter((target) => !audioSummaryBySection[target.section.id]?.[target.language]?.ready)
  }

  async function prepareAndStart() {
    if (!assignmentId || targetPreview.length === 0 || !voiceId) return
    setBusy(true)
    setError(null)
    setMessage(null)

    const startedRunIds: string[] = []
    for (const item of targetPreview) {
      const language = languageBySection[item.section.id] ?? defaultLanguageForSection(item.section, languagePolicy, packageType, packageSessionLanguages)
      const run = await prepareStandaloneRun(assignmentId, item.section.id, language, voiceId)
      if (!run.ok) {
        setBusy(false)
        setError(run.error)
        return
      }
      if (run.data.status === 'in_progress') {
        startedRunIds.push(run.data.runId)
        continue
      }
      if (!run.data.canStart) {
        setBusy(false)
        setMessage(
          `Session ${item.section.sectionOrder} is not ready for ${language.toUpperCase()}. Start requires approved intro + approved item audio for this language. Approved item audio: ${run.data.approvedItemAudioCount}/${item.itemCount}. Generate missing prompts, then review/approve audio before starting.`,
        )
        return
      }
      const started = await startStandaloneRun(run.data.runId, run.data.readinessToken)
      if (!started.ok) {
        setBusy(false)
        setError(started.error)
        return
      }
      startedRunIds.push(run.data.runId)
    }

    setBusy(false)
    navigate(`/teacher/test-runs/${startedRunIds[0]}?assignmentId=${assignmentId}`)
  }

  const pendingTargets = pendingGenerationTargets()
  const isGeneratingSelected = generatingKey === 'selected'

  return (
    <div className="test-setup-page">
      <PageHeader
        icon={ClipboardPlus}
        kicker={packageKind === 'mini' ? 'Teacher · Mini-Test 1-1 (21 câu)' : 'Teacher · Tests 1-1'}
        title="Run setup"
        subtitle="Review sessions, languages, item count, and audio readiness before entering the Live Test room."
        actions={
          packageKind === 'mini' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              ⚡ Mini-Test · 21 câu (3Q/session)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Standard Test · 49 câu
            </span>
          )
        }
      />
      <Flash message={message} error={error} />

      <Panel
        icon={ClipboardPlus}
        title={packageKind === 'mini' ? 'Prepare Mini-Test Run (21 câu)' : 'Prepare Test Run'}
        description={
          packageKind === 'mini'
            ? 'Phiên bản đánh giá nhanh Mini-test 21 câu (3 câu/session) lấy ngẫu nhiên từ bộ Standard gốc.'
            : 'Choose Single Session or flexible Multi-Session groups such as Session 1–4 VI and Session 5–8 EN.'
        }
        collapsible={false}
      >
        <div className="btn-row mt-4 test-setup-start-row">
          <button className="primary" disabled={busy || !assignmentId || !voiceId || targetPreview.length === 0} onClick={() => void prepareAndStart()}>
            <Play className="h-4 w-4" />
            {busy ? 'Preparing…' : `Start Test · ${targetPreview.length} sessions · ${totalItemCount} items`}
          </button>
          <button className="ghost" onClick={() => navigate('/teacher/tests')}>Cancel</button>
        </div>

        <div className="test-setup-audio-card">
          <div>
            <strong>Audio behavior in test room</strong>
            <span>Saved here and applied automatically when entering Live Test.</span>
          </div>
          <label>
            <input
              type="checkbox"
              checked={autoPlaySessionIntro}
              onChange={(event) => setAutoPlaySessionIntro(event.target.checked)}
            />
            Auto-play session intro
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoPlayItems}
              onChange={(event) => setAutoPlayItems(event.target.checked)}
            />
            Auto-play question audio
          </label>
        </div>

        <div className="test-setup-shell">
          <div className="test-setup-side">
            <div className="test-setup-stats">
              <div><Layers3 className="h-4 w-4 text-indigo-500" /><span>Sessions</span><strong>{targetPreview.length || preview.length}</strong></div>
              <div><ListChecks className="h-4 w-4 text-green-500" /><span>Items</span><strong>{totalItemCount || packageItemCount}</strong></div>
              <div>
                <Gauge className="h-4 w-4 text-yellow-500" />
                <span>Loại bài</span>
                <strong className={packageKind === 'mini' ? 'text-purple-600 capitalize' : 'text-blue-600 capitalize'}>
                  {packageKind === 'mini' ? 'Mini (21Q)' : 'Standard'}
                </strong>
              </div>
            </div>

            <div className="test-run-mode-picker">
              {(['full', 'multi', 'single'] as RunMode[]).map((mode) => (
                <button key={mode} type="button" className={runMode === mode ? 'is-active' : ''} onClick={() => setRunMode(mode)}>
                  {mode === 'full' ? 'Full Package' : mode === 'multi' ? 'Multi-Session' : 'Single Session'}
                </button>
              ))}
            </div>

            <label className="field">
              Single session focus
              <select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setRunMode('single') }}>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>Session {section.sectionOrder} · {section.title}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="test-setup-main">
            <div className="test-audio-review-head">
              <div>
                <h3>Session & audio review</h3>
                <p>Each selected session can use VI or EN before the run starts.</p>
              </div>
              <div className="test-audio-review-actions">
                <span>{totalItemCount || packageItemCount} questions</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || generatingKey !== null || pendingTargets.length === 0}
                  onClick={() => void generateAudioForTargets(pendingTargets, 'selected')}
                  title="Generate intro + item audio for selected sessions that are not ready in the selected language. Generated audio still needs review/approval."
                >
                  {isGeneratingSelected ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isGeneratingSelected && generationProgress
                    ? `Generating ${generationProgress.done}/${generationProgress.total}…`
                    : `Generate selected audio (${pendingTargets.length})`}
                </button>
              </div>
            </div>
            {sections.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No Session is available" description="The assigned published Package Version has no sessions." />
            ) : (
              <div className="test-audio-review-table">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Session</th>
                      <th>Items</th>
                      <th>Language</th>
                      <th>VI audio</th>
                      <th>EN audio</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(({ section, itemCount }) => {
                      const selected = runMode === 'full' || (runMode === 'single' ? section.id === sectionId : selectedSectionIds.has(section.id))
                      const language = languageBySection[section.id] ?? defaultLanguageForSection(section, languagePolicy, packageType, packageSessionLanguages)
                      const summary = audioSummaryBySection[section.id]
                      const currentSummary = summary?.[language]
                      const ready = currentSummary?.ready ?? false
                      const needsAudioPrep = !ready
                      const rowGenerateKey = `${section.id}:${language}`
                      const isGeneratingRow = generatingKey === rowGenerateKey
                      return (
                        <tr key={section.id} className={selected ? 'is-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={runMode === 'full' || runMode === 'single'}
                              onChange={() => toggleSection(section)}
                            />
                          </td>
                          <td>
                            <button type="button" className="test-session-cell" onClick={() => { setSectionId(section.id); setRunMode('single') }}>
                              <strong>Session {section.sectionOrder}</strong>
                              <span>{section.title || 'Untitled session'}</span>
                            </button>
                          </td>
                          <td>{itemCount} Q</td>
                          <td>
                            <select
                              value={language}
                              onChange={(event) => setLanguageBySection((current) => ({ ...current, [section.id]: event.target.value as AudioLanguage }))}
                            >
                              <option value="vi">VI</option>
                              <option value="en">EN</option>
                            </select>
                          </td>
                          <td>
                            <span className={summary?.vi.ready ? 'badge success' : 'badge warning'} title="Approved Vietnamese audio / expected prompts, across any model">
                              A {summary?.vi.approved ?? 0}/{summary?.vi.expected ?? itemCount + 1}
                            </span>
                            {summary?.vi.generated ? <span className="badge info ml-1">G {summary.vi.generated}</span> : null}
                          </td>
                          <td>
                            <span className={summary?.en.ready ? 'badge success' : 'badge warning'} title="Approved English audio / expected prompts, across any model">
                              A {summary?.en.approved ?? 0}/{summary?.en.expected ?? itemCount + 1}
                            </span>
                            {summary?.en.generated ? <span className="badge info ml-1">G {summary.en.generated}</span> : null}
                          </td>
                          <td>
                            {ready ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span>
                            ) : needsAudioPrep ? (
                              <div className="test-audio-row-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  disabled={busy || generatingKey !== null}
                                  onClick={() => void generateAudioForTargets([{ section, language }], rowGenerateKey)}
                                  title="Generate intro + item audio for this session/language/model. Generated audio still needs review/approval."
                                >
                                  {isGeneratingRow ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                  {isGeneratingRow && generationProgress
                                    ? `${generationProgress.done}/${generationProgress.total}`
                                    : 'Generate'}
                                </button>
                                <Link className="btn ghost" to={audioPrepHref(section, language)}>
                                  Audio Prep
                                </Link>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <p className="banner-inline mt-5">
          <Volume2 className="h-4 w-4" />
          Start validates approved intro + item audio for each selected session/language.
        </p>
        {targetPreview.length === 0 ? (
          <p className="banner-inline warning"><AlertTriangle className="h-4 w-4" />Select at least one session.</p>
        ) : null}

      </Panel>
    </div>
  )
}
