import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Headphones,
  Info,
  Layers,
  LayoutGrid,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Table,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { useFlash } from '../../hooks/useFlash'
import { getSupabase } from '../../lib/supabase'
import {
  batchSaveCciCategories,
  createCciProfile,
  createDraftTestPackage,
  createMiniTestVariantFromPackage,
  deleteTestPackage,
  detectPackageKind,
  listCciCategories,
  listCciProfiles,
  listTestItems,
  listTestPackageVersions,
  listTestPackages,
  listTestSections,
  toggleTestPackageActive,
  updateTestItemContent,
  updateTestPackageMetadata,
  type PackageKind,
} from '../../lib/test-packages'
import {
  calculateCciFromCpd,
  calculateCvr,
  calculateWordCountLc,
  countWords,
  detectPackageTestType,
  extractPackageVoltage,
  validateGreenSentence,
  validateRedCollocations,
  type CciCategory,
  type CciProfile,
  type TestItem,
  type TestPackage,
  type TestPackageVersion,
  type TestSection,
} from '../../modules/catalog/test-package-catalog'
import {
  generateNarration,
  generatePackageFromVocab,
  getFirestoreLessonChunks,
  getNarrationPlaybackUrl,
  listFirestoreLessons,
  playGoogleCloudTts,
  uploadNarrationAudio,
  GREEN_TEST_SESSION_LANGUAGES_7X3,
  RED_TEST_SESSION_LANGUAGES_7X3,
  type FirestoreChunk,
  type FirestoreLesson,
  type NarrationGenerationTarget,
} from '../../modules/catalog/live-test-generation'

export { detectPackageTestType }

export type StudioTab = 'packages' | 'content' | 'audio' | 'formulas' | 'cci'
type FilterTab = 'all' | 'green' | 'red'

export type PackageSummary = {
  pkg: TestPackage
  version: TestPackageVersion | null
  sections: TestSection[]
  items: TestItem[]
  variants: Array<{
    id: string
    narration_target: string
    language: string
    voice_id: string
    audio_asset_id: string | null
    approval_status: string
    test_item_id: string | null
    test_section_id: string | null
    provider_metadata?: any
  }>
  testType: 'green' | 'red'
  targetVoltage: number
  questionCount: number
  cvrMin: number
  cvrMax: number
  audioApprovedCount: number
  audioTotalCount: number
  isLegacyLive: boolean
  packageKind: PackageKind
  isActive: boolean
}

export function AdminPackageTestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { message, error, ok, err } = useFlash()

  // Studio Tab State
  const initialTab = (searchParams.get('tab') as StudioTab) || 'packages'
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab)

  const handleTabChange = (tab: StudioTab) => {
    setActiveTab(tab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  // Catalog State
  const [packageSummaries, setPackageSummaries] = useState<PackageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'standard' | 'mini'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Mini-Test Generator Modal State
  const [miniModalSummary, setMiniModalSummary] = useState<PackageSummary | null>(null)
  const [miniCode, setMiniCode] = useState('')
  const [miniTitle, setMiniTitle] = useState('')
  const [miniSamplingStrategy, setMiniSamplingStrategy] = useState<'random' | 'first'>('random')
  const [miniCopyAudio, setMiniCopyAudio] = useState(true)
  const [creatingMini, setCreatingMini] = useState(false)
  const [batchCreatingMini, setBatchCreatingMini] = useState(false)
  const [batchProgress, setBatchProgress] = useState<string | null>(null)

  // Active Selected Package
  const [selectedVersionState, setSelectedVersionState] = useState('')
  const selectedVersionId = searchParams.get('version') || selectedVersionState
  const selectedPackage = useMemo(() => {
    if (selectedVersionId) {
      const found = packageSummaries.find((s) => s.version?.id === selectedVersionId)
      if (found) return found
    }
    return packageSummaries[0] ?? null
  }, [packageSummaries, selectedVersionId])

  const selectedVariants = useMemo(() => selectedPackage?.variants ?? [], [selectedPackage])

  const itemVariantMap = useMemo(() => {
    const map = new Map<string, (typeof selectedVariants)[0]>()
    for (const v of selectedVariants) {
      if (v.test_item_id && v.language) {
        const key = `${v.test_item_id}_${v.language}`
        const existing = map.get(key)
        if (!existing || (v.approval_status === 'approved' && existing.approval_status !== 'approved')) {
          map.set(key, v)
        }
      }
    }
    return map
  }, [selectedVariants])

  const sectionVariantMap = useMemo(() => {
    const map = new Map<string, (typeof selectedVariants)[0]>()
    for (const v of selectedVariants) {
      if (v.test_section_id && v.language && (v.narration_target === 'section_intro' || !v.narration_target)) {
        const key = `${v.test_section_id}_${v.language}`
        const existing = map.get(key)
        if (!existing || (v.approval_status === 'approved' && existing.approval_status !== 'approved')) {
          map.set(key, v)
        }
      }
    }
    return map
  }, [selectedVariants])

  const partVariantMap = useMemo(() => {
    const map = new Map<string, (typeof selectedVariants)[0]>()
    for (const v of selectedVariants) {
      if (v.narration_target === 'part_intro' && v.language) {
        const part = v.provider_metadata?.part
        if (part != null) {
          const key = `${part}_${v.language}`
          const existing = map.get(key)
          if (!existing || (v.approval_status === 'approved' && existing.approval_status !== 'approved')) {
            map.set(key, v)
          }
        }
      }
    }
    return map
  }, [selectedVariants])

  const packageStartVariant = useCallback(
    (lang: string) => {
      const matching = selectedVariants.filter(
        (v) => v.narration_target === 'package_start' && v.language === lang,
      )
      return matching.find((v) => v.approval_status === 'approved') ?? matching[0] ?? null
    },
    [selectedVariants],
  )

  const packageEndVariant = useCallback(
    (lang: string) => {
      const matching = selectedVariants.filter(
        (v) => v.narration_target === 'package_end' && v.language === lang,
      )
      return matching.find((v) => v.approval_status === 'approved') ?? matching[0] ?? null
    },
    [selectedVariants],
  )

  const selectPackage = (pkg: PackageSummary) => {
    if (!pkg.version) return
    setSelectedVersionState(pkg.version.id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('version', pkg.version!.id)
      return next
    })
  }

  // View Modes across tabs
  const [packagesViewMode, setPackagesViewMode] = useState<'grid' | 'table'>('grid')
  const [contentViewMode, setContentViewMode] = useState<'accordion' | 'table' | 'validation'>('accordion')
  const [audioViewMode, setAudioViewMode] = useState<'lifecycle' | 'table'>('lifecycle')

  // Formula & Physics Sandbox State
  const [calcTc, setCalcTc] = useState<number>(3.0)
  const [calcTl, setCalcTl] = useState<number>(1.5)
  const [calcWordCount, setCalcWordCount] = useState<number>(14)
  const [calcCpd, setCalcCpd] = useState<number>(56)
  const [copiedFormula, setCopiedFormula] = useState(false)

  // Derived Sandbox Values
  const derivedSandboxLc = useMemo(() => calculateWordCountLc(calcWordCount), [calcWordCount])
  const derivedSandboxCvr = useMemo(
    () => calculateCvr(calcTc, derivedSandboxLc, calcTl),
    [calcTc, derivedSandboxLc, calcTl],
  )
  const derivedSandboxCci = useMemo(
    () => calculateCciFromCpd(calcCpd, derivedSandboxCvr),
    [calcCpd, derivedSandboxCvr],
  )

  const applySandboxPreset = (type: 'green_12v' | 'green_18v' | 'red_56v' | 'red_72v') => {
    if (type === 'green_12v') {
      setCalcCpd(12)
      setCalcTc(3.0)
      setCalcTl(1.0)
      setCalcWordCount(10)
    } else if (type === 'green_18v') {
      setCalcCpd(18)
      setCalcTc(3.0)
      setCalcTl(1.25)
      setCalcWordCount(15)
    } else if (type === 'red_56v') {
      setCalcCpd(56)
      setCalcTc(3.0)
      setCalcTl(2.0)
      setCalcWordCount(12)
    } else if (type === 'red_72v') {
      setCalcCpd(72)
      setCalcTc(4.0)
      setCalcTl(2.0)
      setCalcWordCount(18)
    }
  }

  const applySandboxToGenerator = () => {
    setAiTargetVoltage(calcCpd)
    setUiTc(calcTc)
    setUiTl(calcTl)
    setUiLc(derivedSandboxLc)
    if (calcCpd <= 24) {
      setAiTestType('green')
    } else {
      setAiTestType('red')
    }
    setShowCreateModal(true)
    setCreateTab('ai')
  }

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTab, setCreateTab] = useState<'ai' | 'manual'>('ai')
  const [creatingPackage, setCreatingPackage] = useState(false)

  // AI Active Generator Fields (Fully customizable CPD, Sessions, Questions, CVR)
  const [lessons, setLessons] = useState<FirestoreLesson[]>([])
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [lessonChunks, setLessonChunks] = useState<FirestoreChunk[]>([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [aiTestType, setAiTestType] = useState<'green' | 'red'>('red')
  const [aiSessionCount, setAiSessionCount] = useState<number>(7)
  const [aiQuestionsPerSession, setAiQuestionsPerSession] = useState<number>(3)
  const [aiTargetVoltage, setAiTargetVoltage] = useState(56)
  const aiTopic = 'ecommerce'
  const [customPackageCode, setCustomPackageCode] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [allowCustomCode, setAllowCustomCode] = useState(false)

  // Direct UI controls for CVR = TC x TL x LC
  const [uiTc, setUiTc] = useState<number>(3.0) // Term Complexity, default 3 ohm
  const [uiTl, setUiTl] = useState<number>(2.0) // Topic Level / Latency (1.0 to 2.0)
  const [uiLc, setUiLc] = useState<number>(1.15) // Length Complexity (1.0 to 2.5)
  const [perSessionAmple, setPerSessionAmple] = useState<number[]>([12, 7, 5, 10, 6, 4, 4])

  // Manual Blank Draft fields
  const [manualTitle, setManualTitle] = useState('')
  const [manualVersionLabel, setManualVersionLabel] = useState('v1')
  const [manualSessionCount, setManualSessionCount] = useState(7)
  const [manualItemsPerSession, setManualItemsPerSession] = useState(3)

  // Edit Metadata Modal
  const [editingPackage, setEditingPackage] = useState<TestPackage | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingMetadata, setSavingMetadata] = useState(false)

  // Delete Confirmation Modal
  const [deletingPackage, setDeletingPackage] = useState<TestPackage | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Preview Modal
  const [previewPackage, setPreviewPackage] = useState<PackageSummary | null>(null)

  // Audio Studio State
  const [audioVoiceId, setAudioVoiceId] = useState('google/vi-VN-Neural2-A')
  const [audioVoiceLang, setAudioVoiceLang] = useState<'vi' | 'en'>('vi')
  const [testingTtsVoice, setTestingTtsVoice] = useState(false)
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null)
  const [batchAudioProgress, setBatchAudioProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [uploadingTargetKey, setUploadingTargetKey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingUploadTarget, setPendingUploadTarget] = useState<{
    target: NarrationGenerationTarget
    part?: number
    testSectionId?: string
    testItemId?: string
    language: 'vi' | 'en'
    text: string
  } | null>(null)

  // Session languages per package
  const [sessionLanguages, setSessionLanguages] = useState<Record<string, 'vi' | 'en'>>({})

  // Helper to get active language for a section
  function getSectionLanguage(sec?: TestSection | null): 'vi' | 'en' {
    if (!sec) return 'vi'
    if (sessionLanguages[sec.id]) {
      return sessionLanguages[sec.id]
    }

    // 1. Direct from section_intro audio variant established in the package
    const introVar = selectedVariants.find(
      (v) =>
        v.test_section_id === sec.id &&
        v.narration_target === 'section_intro' &&
        v.audio_asset_id != null &&
        (v.language === 'vi' || v.language === 'en'),
    )
    if (introVar?.language === 'vi' || introVar?.language === 'en') {
      return introVar.language as 'vi' | 'en'
    }

    // 2. Language plan in version source_metadata (e.g. { "1": "en", "2": "en", ... })
    const langPlan = (selectedPackage?.version?.sourceMetadata as any)?.languagePlan
    if (langPlan) {
      const planVal = langPlan[String(sec.sectionOrder)] || langPlan[sec.sectionOrder]
      if (planVal === 'vi' || planVal === 'en') return planVal
    }

    const metaLangs = (selectedPackage?.version?.sourceMetadata as any)?.sessionLanguages
    if (Array.isArray(metaLangs) && metaLangs[sec.sectionOrder - 1]) {
      return metaLangs[sec.sectionOrder - 1]
    }
    const secMeta = (sec as any).metadata || (sec as any).sourceMetadata
    if (secMeta?.sessionLanguage === 'vi' || secMeta?.sessionLanguage === 'en') {
      return secMeta.sessionLanguage
    }
    if (selectedPackage?.testType === 'green') {
      return sec.sectionOrder <= 3 || sec.sectionOrder === 7 ? 'en' : 'vi'
    } else {
      return sec.sectionOrder <= 3 ? 'vi' : 'en'
    }
  }

  function handleToggleSectionLanguage(sectionId: string, currentLang: 'vi' | 'en') {
    const nextLang = currentLang === 'vi' ? 'en' : 'vi'
    setSessionLanguages((prev) => ({
      ...prev,
      [sectionId]: nextLang,
    }))
  }

  // Editing Test Item Modal
  const [editingItem, setEditingItem] = useState<TestItem | null>(null)
  const [editPromptVi, setEditPromptVi] = useState('')
  const [editPromptEn, setEditPromptEn] = useState('')
  const [editTermVi, setEditTermVi] = useState('')
  const [editTermEn, setEditTermEn] = useState('')
  const [editSpokenVi, setEditSpokenVi] = useState('')
  const [editSpokenEn, setEditSpokenEn] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [regeneratingItemAudio, setRegeneratingItemAudio] = useState(false)

  function handleOpenEditItem(item: TestItem) {
    setEditingItem(item)
    setEditPromptVi(item.promptVi || '')
    setEditPromptEn(item.promptEn || '')
    setEditTermVi(item.termVi || '')
    setEditTermEn(item.termEn || '')
    setEditSpokenVi(item.spokenScriptVi || item.promptVi || '')
    setEditSpokenEn(item.spokenScriptEn || item.promptEn || '')
  }

  async function handleSaveItem(alsoRegenerateAudio = false) {
    if (!editingItem || !selectedPackage?.version) return
    setSavingItem(true)
    if (alsoRegenerateAudio) setRegeneratingItemAudio(true)
    try {
      const res = await updateTestItemContent({
        itemId: editingItem.id,
        promptVi: editPromptVi.trim(),
        promptEn: editPromptEn.trim(),
        termVi: editTermVi.trim() || null,
        termEn: editTermEn.trim() || null,
        spokenScriptVi: editSpokenVi.trim() || editPromptVi.trim() || null,
        spokenScriptEn: editSpokenEn.trim() || editPromptEn.trim() || null,
      })

      if (!res.ok) {
        throw new Error(res.error)
      }

      if (alsoRegenerateAudio) {
        const sec = selectedPackage.sections.find((s) => s.id === editingItem.sectionId)
        const sessionLang = getSectionLanguage(sec)
        const script = sessionLang === 'vi' ? editSpokenVi.trim() || editPromptVi.trim() : editSpokenEn.trim() || editPromptEn.trim()
        const voice = sessionLang === 'vi' ? 'google/vi-VN-Neural2-A' : 'google/en-US-Neural2-F'

        await generateNarration({
          packageVersionId: selectedPackage.version.id,
          target: 'test_item',
          testSectionId: editingItem.sectionId,
          testItemId: editingItem.id,
          language: sessionLang,
          voiceId: voice,
          textOverride: script,
        })
        ok('Đã cập nhật câu hỏi và sinh mới audio Google Cloud TTS thành công!')
      } else {
        ok('Đã cập nhật nội dung câu hỏi thành công!')
      }

      setEditingItem(null)
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Cập nhật câu hỏi thất bại')
    } finally {
      setSavingItem(false)
      setRegeneratingItemAudio(false)
    }
  }

  // CCI Profiles Tab State
  const [cciProfiles, setCciProfiles] = useState<CciProfile[]>([])
  const [selectedCciProfileId, setSelectedCciProfileId] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<CciCategory[]>([])
  const [loadingCci, setLoadingCci] = useState(false)
  const [savingCci, setSavingCci] = useState(false)
  const [showNewProfileModal, setShowNewProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileDesc, setNewProfileDesc] = useState('')

  // Derived calculations
  const totalQuestions = useMemo(
    () => aiSessionCount * aiQuestionsPerSession,
    [aiSessionCount, aiQuestionsPerSession],
  )

  const computedCvr = useMemo(() => {
    return calculateCvr(uiTc, uiLc, uiTl)
  }, [uiTc, uiLc, uiTl])

  const computedDerivedCci = useMemo(() => {
    return calculateCciFromCpd(aiTargetVoltage, computedCvr)
  }, [aiTargetVoltage, computedCvr])

  // Sync test type defaults for CVR/CPD/Ample
  useEffect(() => {
    if (aiTestType === 'green') {
      setAiTargetVoltage(12)
      setUiTc(3.0)
      setUiTl(1.0)
      setUiLc(1.0)
      setPerSessionAmple([6, 6, 4, 4, 3, 3, 2])
    } else {
      setAiTargetVoltage(56)
      setUiTc(3.0)
      setUiTl(2.0)
      setUiLc(1.15)
      setPerSessionAmple([12, 7, 5, 10, 6, 4, 4])
    }
  }, [aiTestType])

  // Compute live package code and title
  const computedPackageCode = useMemo(() => {
    const prefix = aiTestType === 'red' ? 'R01' : 'G01'
    const cleanTopic = aiTopic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const topicSegment = cleanTopic ? `-${cleanTopic}` : ''
    return `${prefix}-${totalQuestions}Q${topicSegment}-${aiTargetVoltage}V`
  }, [aiTestType, totalQuestions, aiTopic, aiTargetVoltage])

  const selectedLesson = useMemo(() => {
    return lessons.find((l) => l.id === selectedLessonId) ?? null
  }, [lessons, selectedLessonId])

  const computedTitle = useMemo(() => {
    const typeLabel = aiTestType === 'red' ? 'RED (Awareness & Traps)' : 'GREEN (Focus)'
    const lessonLabel = selectedLesson?.lessonTitle || selectedLessonId || 'General'
    return `[${typeLabel}] ${lessonLabel} · ${totalQuestions}Q - ${aiTargetVoltage}V`
  }, [aiTestType, selectedLesson, selectedLessonId, totalQuestions, aiTargetVoltage])

  const activePackageCode =
    allowCustomCode && customPackageCode ? customPackageCode : computedPackageCode
  const activeTitle = allowCustomCode && customTitle ? customTitle : computedTitle

  // Load packages catalog
  const loadPackages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listTestPackages()
      if (!res.ok) {
        err(res.error)
        return
      }

      const summaries: PackageSummary[] = await Promise.all(
        res.data.map(async (pkg) => {
          const versionsRes = await listTestPackageVersions(pkg.id)
          const version = versionsRes.ok ? versionsRes.data[0] ?? null : null

          let sections: TestSection[] = []
          let items: TestItem[] = []
          let variants: Array<{
            id: string
            narration_target: string
            language: string
            voice_id: string
            audio_asset_id: string | null
            approval_status: string
            test_item_id: string | null
            test_section_id: string | null
            provider_metadata?: any
          }> = []
          let audioApproved = 0

          if (version) {
            const sectionsRes = await listTestSections(version.id)
            if (sectionsRes.ok) {
              sections = sectionsRes.data
              const itemPromises = sections.map((s) => listTestItems(s.id))
              const itemResults = await Promise.all(itemPromises)
              items = itemResults.flatMap((r) => (r.ok ? r.data : []))
            }

            const sb = getSupabase() as any
            if (sb) {
              const { data: fetchedVariants } = await sb
                .from('narration_variants')
                .select(
                  'id, narration_target, language, voice_id, audio_asset_id, approval_status, test_item_id, test_section_id, provider_metadata',
                )
                .eq('package_version_id', version.id)
              variants = (fetchedVariants ?? []) as any
              audioApproved = variants.filter(
                (v) => v.approval_status === 'approved',
              ).length
            }
          }

          const testType = detectPackageTestType(pkg)
          const targetVoltage = extractPackageVoltage(pkg, testType)
          const questionCount =
            items.length || Number(pkg.sourceMetadata?.questionCount ?? 21)

          const cvrValues = items
            .map((i) => i.measuredCvr)
            .filter((c): c is number => c != null && !isNaN(c))
          const cvrMin = cvrValues.length
            ? Math.min(...cvrValues)
            : testType === 'red'
              ? 4.6
              : 2.0
          const cvrMax = cvrValues.length
            ? Math.max(...cvrValues)
            : testType === 'red'
              ? 13.8
              : 6.0

          const isLegacyLive =
            pkg.title.includes('· LIVE') || version?.versionLabel === 'LIVE'

          const packageKind = detectPackageKind({
            title: pkg.title,
            slug: pkg.slug,
            sourceMetadata: pkg.sourceMetadata,
            itemCount: items.length,
          })

          return {
            pkg,
            version,
            sections,
            items,
            variants,
            testType,
            targetVoltage,
            questionCount,
            cvrMin,
            cvrMax,
            audioApprovedCount: audioApproved,
            audioTotalCount: items.length,
            isLegacyLive,
            packageKind,
            isActive: pkg.sourceMetadata?.is_active !== false,
          }
        }),
      )

      setPackageSummaries(summaries)
    } catch (e) {
      err(e instanceof Error ? e.message : 'Failed to load test packages')
    } finally {
      setLoading(false)
    }
  }, [err])

  // Load CCI Profiles
  const loadCciProfiles = useCallback(async () => {
    setLoadingCci(true)
    try {
      const res = await listCciProfiles()
      if (res.ok) {
        setCciProfiles(res.data)
        if (res.data.length > 0 && !selectedCciProfileId) {
          setSelectedCciProfileId(res.data[0].id)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingCci(false)
    }
  }, [selectedCciProfileId])

  // Load Categories for Selected CCI Profile
  useEffect(() => {
    if (!selectedCciProfileId) {
      setSelectedCategories([])
      return
    }
    void (async () => {
      const res = await listCciCategories(selectedCciProfileId)
      if (res.ok) setSelectedCategories(res.data)
    })()
  }, [selectedCciProfileId])

  // Initial Load
  useEffect(() => {
    void loadPackages()
    void loadCciProfiles()
    void (async () => {
      try {
        const loadedLessons = await listFirestoreLessons()
        setLessons(loadedLessons)
        if (loadedLessons.length > 0) {
          setSelectedLessonId(loadedLessons[0].id)
        }
      } catch {
        // fallback
      }
    })()
  }, [loadPackages, loadCciProfiles])

  // Load chunks when lesson changes
  useEffect(() => {
    if (!selectedLessonId) {
      setLessonChunks([])
      return
    }
    setLoadingChunks(true)
    void getFirestoreLessonChunks(selectedLessonId)
      .then((chunks) => setLessonChunks(chunks))
      .catch(() => setLessonChunks([]))
      .finally(() => setLoadingChunks(false))
  }, [selectedLessonId])

  // Filtered packages
  const filteredSummaries = useMemo(() => {
    return packageSummaries.filter((summary) => {
      if (filterTab === 'green' && summary.testType !== 'green') return false
      if (filterTab === 'red' && summary.testType !== 'red') return false
      if (categoryFilter === 'standard' && summary.packageKind !== 'standard') return false
      if (categoryFilter === 'mini' && summary.packageKind !== 'mini') return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const cleanTitle = summary.pkg.title.replace(/ · LIVE$/i, '').toLowerCase()
        const slug = summary.pkg.slug.toLowerCase()
        const desc = (summary.pkg.description || '').toLowerCase()
        const code = String(summary.pkg.sourceMetadata?.packageCode || '').toLowerCase()
        return (
          cleanTitle.includes(query) ||
          slug.includes(query) ||
          desc.includes(query) ||
          code.includes(query)
        )
      }
      return true
    })
  }, [packageSummaries, filterTab, categoryFilter, searchQuery])

  // Mini-Test Variant Handlers
  function openCreateMiniModal(summary: PackageSummary) {
    setMiniModalSummary(summary)
    const baseSlug = summary.pkg.slug || 'test'
    setMiniCode(baseSlug.startsWith('mini-') ? baseSlug : `mini-${baseSlug}`)
    const baseTitle = summary.pkg.title.replace(/\s*·\s*LIVE\s*$/i, '')
    setMiniTitle(baseTitle.startsWith('[Mini]') ? baseTitle : `[Mini] ${baseTitle}`)
    setMiniSamplingStrategy('random')
    setMiniCopyAudio(true)
  }

  async function handleCreateMiniTest(e: React.FormEvent) {
    e.preventDefault()
    if (!miniModalSummary?.version) return
    setCreatingMini(true)
    try {
      const res = await createMiniTestVariantFromPackage({
        sourcePackageVersionId: miniModalSummary.version.id,
        customCode: miniCode,
        customTitle: miniTitle,
        questionsPerSection: 3,
        samplingStrategy: miniSamplingStrategy,
        copyAudio: miniCopyAudio,
      })
      if (!res.ok) throw new Error(res.error)
      ok(`Đã tạo thành công biến thể Mini-test: "${res.data.package.title}" (${res.data.itemCount} câu)!`)
      setMiniModalSummary(null)
      await loadPackages()
      if (res.data.version?.id) {
        setSelectedVersionState(res.data.version.id)
      }
    } catch (errCause) {
      err(errCause instanceof Error ? errCause.message : 'Tạo mini-test thất bại')
    } finally {
      setCreatingMini(false)
    }
  }

  async function handleBatchCreateMiniTests() {
    const standardPackages = packageSummaries.filter(
      (s) => s.packageKind === 'standard' && s.version,
    )
    if (standardPackages.length === 0) {
      err('Không tìm thấy gói Standard test nào để tạo biến thể mini.')
      return
    }

    if (
      !window.confirm(
        `Xác nhận tự động tạo ${standardPackages.length} bài Mini-Test (21 câu / zero-waste audio reuse) tương ứng với các gói Standard hiện có?`,
      )
    ) {
      return
    }

    setBatchCreatingMini(true)
    let createdCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (let i = 0; i < standardPackages.length; i++) {
      const summary = standardPackages[i]
      const baseSlug = summary.pkg.slug || 'standard'
      const targetSlug = baseSlug.startsWith('mini-') ? baseSlug : `mini-${baseSlug}`
      const baseTitle = summary.pkg.title.replace(/\s*·\s*LIVE.*$/i, '').trim()
      const targetTitle = baseTitle.startsWith('[Mini]') ? baseTitle : `[Mini] ${baseTitle}`

      // Check if already exists in packageSummaries and has questions
      const existing = packageSummaries.find((s) => s.pkg.slug === targetSlug)
      if (existing && existing.questionCount > 0) {
        skippedCount++
        continue
      }

      setBatchProgress(`Đang tạo (${i + 1}/${standardPackages.length}): ${targetSlug}...`)

      const res = await createMiniTestVariantFromPackage({
        sourcePackageVersionId: summary.version!.id,
        customCode: targetSlug,
        customTitle: targetTitle,
        samplingStrategy: 'random',
        questionsPerSection: 3,
        copyAudio: true,
      })

      if (res.ok) {
        createdCount++
      } else {
        errors.push(`${summary.pkg.title}: ${res.error}`)
      }
    }

    setBatchCreatingMini(false)
    setBatchProgress(null)

    if (errors.length > 0) {
      err(`Hoàn tất tạo ${createdCount} gói. Có lỗi: ${errors.join(', ')}`)
    } else {
      ok(`Đã tạo thành công ${createdCount} bài Mini-Test mới! (Đã bỏ qua ${skippedCount} gói đã tồn tại)`)
    }
    await loadPackages()
  }

  // Handle AI Package Generation with custom CVR math and Ample
  async function handleGenerateAiPackage(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLessonId) return err('Vui lòng chọn bài học Firestore')
    setCreatingPackage(true)
    try {
      const res = await generatePackageFromVocab({
        testType: aiTestType,
        lessonId: selectedLessonId,
        targetQuestions: totalQuestions,
        sessionCount: aiSessionCount,
        questionsPerSession: aiQuestionsPerSession,
        sessionLayout: `${aiSessionCount}x${aiQuestionsPerSession}`,
        sessionLanguages:
          aiTestType === 'red'
            ? RED_TEST_SESSION_LANGUAGES_7X3
            : GREEN_TEST_SESSION_LANGUAGES_7X3,
        targetCpd: aiTargetVoltage,
        tc: uiTc,
        tl: uiTl,
        lexicalComplexity: uiLc,
        cciProgression: perSessionAmple,
        packageCode: activePackageCode,
        title: activeTitle,
        versionLabel: 'v1',
        saveDraft: true,
      })

      ok(`Đã tạo thành công gói bài test "${res.title}" (${res.itemsCount} câu)!`)
      setShowCreateModal(false)
      await loadPackages()
      handleTabChange('content')
    } catch (e) {
      err(e instanceof Error ? e.message : 'Tạo bài test thất bại')
    } finally {
      setCreatingPackage(false)
    }
  }

  // Handle Manual Package Creation
  async function handleCreateManualPackage(e: React.FormEvent) {
    e.preventDefault()
    if (!manualTitle.trim()) return err('Tiêu đề không được để trống')
    setCreatingPackage(true)
    try {
      const defaultSessions = Array.from({ length: manualSessionCount }, (_, idx) => ({
        sectionOrder: idx + 1,
        title: `Session ${idx + 1}`,
        targetCvrOhm: (idx + 1) * 2 - 1,
        cciProfileId: '',
        cciCategoryId: '',
        cciCategoryLabel: 'Focus Baseline',
        cciValue: 4,
      }))

      const res = await createDraftTestPackage({
        title: manualTitle.trim(),
        versionLabel: manualVersionLabel.trim() || 'v1',
        sessionCount: manualSessionCount,
        itemsPerSession: manualItemsPerSession,
        sessions: defaultSessions,
      })
      if (!res.ok) throw new Error(res.error)

      ok(`Đã tạo gói bài test thủ công "${res.data.package.title}"`)
      setShowCreateModal(false)
      setManualTitle('')
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Tạo gói thủ công thất bại')
    } finally {
      setCreatingPackage(false)
    }
  }

  // Handle Metadata Update
  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPackage) return
    setSavingMetadata(true)
    try {
      await updateTestPackageMetadata(editingPackage.id, {
        title: editTitle,
        slug: editSlug,
        description: editDescription,
      })
      ok('Cập nhật thông tin gói thành công.')
      setEditingPackage(null)
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Cập nhật thất bại')
    } finally {
      setSavingMetadata(false)
    }
  }

  // Handle Package Delete
  async function handleDeletePackage() {
    if (!deletingPackage) return
    setDeleting(true)
    try {
      await deleteTestPackage(deletingPackage.id)
      ok(`Đã xóa vĩnh viễn gói "${deletingPackage.title}"`)
      setDeletingPackage(null)
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Xóa gói bài test thất bại')
    } finally {
      setDeleting(false)
    }
  }

  // Handle Package Active/Inactive Toggle (Show/Hide in Teacher Tests 1-1)
  async function handleTogglePackageActive(summary: PackageSummary) {
    const nextState = !summary.isActive
    setPackageSummaries((prev) =>
      prev.map((s) => (s.pkg.id === summary.pkg.id ? { ...s, isActive: nextState } : s)),
    )
    const res = await toggleTestPackageActive(summary.pkg.id, nextState)
    if (res.ok) {
      ok(
        nextState
          ? `Đã BẬT gói "${summary.pkg.title}" (Hiển thị ở mục Tests 1-1)`
          : `Đã TẮT gói "${summary.pkg.title}" (Ẩn khỏi mục Tests 1-1)`,
      )
    } else {
      err(res.error || 'Cập nhật trạng thái thất bại')
      setPackageSummaries((prev) =>
        prev.map((s) => (s.pkg.id === summary.pkg.id ? { ...s, isActive: !nextState } : s)),
      )
    }
  }

  // Inline Test Voice Playback
  async function handleTestVoice() {
    const sample =
      audioVoiceLang === 'vi'
        ? 'Xin chào! Đây là mô hình giọng đọc chuẩn Google Cloud Neural2 trên hệ thống Chunks LMS.'
        : 'Hello! This is a high-fidelity Google Cloud Neural2 voice model on Chunks LMS.'
    setTestingTtsVoice(true)
    try {
      await playGoogleCloudTts(sample, audioVoiceLang, audioVoiceId)
    } catch (e) {
      err(e instanceof Error ? e.message : 'Lỗi nghe thử giọng đọc')
    } finally {
      setTestingTtsVoice(false)
    }
  }

  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const currentPlayKeyRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
    }
  }, [])

  // Inline Audio Playback for Item / Intro
  async function handlePlayItemAudio(
    key: string,
    text: string,
    lang: 'vi' | 'en',
    options?: {
      itemOrder?: number
      variantId?: string | null
      target?: 'test_item' | 'package_start' | 'part_intro' | 'section_intro' | 'package_end'
    },
  ) {
    if (playingAudioKey === key) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      currentPlayKeyRef.current = null
      setPlayingAudioKey(null)
      return
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }

    currentPlayKeyRef.current = key
    setPlayingAudioKey(key)

    const isCurrent = () => currentPlayKeyRef.current === key

    const playAudioUrl = (url: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!isCurrent()) {
          resolve()
          return
        }
        const audio = new Audio(url)
        currentAudioRef.current = audio
        audio.onended = () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null
          }
          resolve()
        }
        audio.onerror = (e) => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null
          }
          reject(new Error('Audio playback failed: ' + String(e)))
        }
        audio.play().catch((playErr) => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null
          }
          reject(playErr)
        })
      })
    }

    try {
      const voice =
        audioVoiceLang === lang
          ? audioVoiceId
          : lang === 'vi'
            ? 'google/vi-VN-Neural2-A'
            : 'google/en-US-Neural2-F'

      if (options?.itemOrder != null) {
        // Play prefix audio /audio/number_${options.itemOrder}.wav first
        try {
          await playAudioUrl(`/audio/number_${options.itemOrder}.wav`)
        } catch (prefixErr) {
          console.warn('Prefix audio error or missing:', prefixErr)
        }

        if (!isCurrent()) return

        // On prefix end:
        if (options?.variantId) {
          const playback = await getNarrationPlaybackUrl(options.variantId)
          if (!isCurrent()) return
          await playAudioUrl(playback.signedUrl)
        } else {
          ok('Đang phát preview TTS (chưa có audio trong gói)')
          await playGoogleCloudTts(text, lang, voice)
        }
      } else {
        // Intro audios (package_start, part_intro, section_intro, package_end) or non-item targets
        if (options?.variantId) {
          const playback = await getNarrationPlaybackUrl(options.variantId)
          if (!isCurrent()) return
          await playAudioUrl(playback.signedUrl)
        } else {
          await playGoogleCloudTts(text, lang, voice)
        }
      }
    } catch (e) {
      if (isCurrent()) {
        err(e instanceof Error ? e.message : 'Phát âm thanh thất bại')
      }
    } finally {
      if (isCurrent()) {
        currentPlayKeyRef.current = null
        setPlayingAudioKey(null)
      }
    }
  }

  // Regenerate Audio via GCP TTS
  async function handleRegenerateAudio(
    target: NarrationGenerationTarget,
    text: string,
    lang: 'vi' | 'en',
    sectionId?: string,
    itemId?: string,
    part?: number,
  ) {
    if (!selectedPackage?.version) return
    const voice =
      audioVoiceLang === lang
        ? audioVoiceId
        : lang === 'vi'
          ? 'google/vi-VN-Neural2-A'
          : 'google/en-US-Neural2-F'
    try {
      await generateNarration({
        packageVersionId: selectedPackage.version.id,
        target,
        part,
        testSectionId: sectionId,
        testItemId: itemId,
        language: lang,
        voiceId: voice,
        textOverride: text,
      })
      ok('Đã sinh mới file âm thanh từ Google Cloud TTS!')
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Lỗi sinh âm thanh từ GCP')
    }
  }

  // Trigger Custom Audio Upload File Picker
  function handleTriggerUpload(
    target: NarrationGenerationTarget,
    text: string,
    lang: 'vi' | 'en',
    sectionId?: string,
    itemId?: string,
    part?: number,
  ) {
    setPendingUploadTarget({
      target,
      part,
      testSectionId: sectionId,
      testItemId: itemId,
      language: lang,
      text,
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // Process Uploaded File
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingUploadTarget || !selectedPackage?.version) return
    setUploadingTargetKey('uploading')
    try {
      const voice =
        audioVoiceLang === pendingUploadTarget.language
          ? audioVoiceId
          : pendingUploadTarget.language === 'vi'
            ? 'google/vi-VN-Neural2-A'
            : 'google/en-US-Neural2-F'
      await uploadNarrationAudio({
        packageVersionId: selectedPackage.version.id,
        target: pendingUploadTarget.target,
        part: pendingUploadTarget.part,
        testSectionId: pendingUploadTarget.testSectionId,
        testItemId: pendingUploadTarget.testItemId,
        language: pendingUploadTarget.language,
        voiceId: voice,
        sourceTextHash: `hash-${Date.now()}`,
        file,
      })
      ok(`Đã tải lên và phê duyệt file audio: "${file.name}"!`)
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Tải lên file audio thất bại')
    } finally {
      setUploadingTargetKey(null)
      setPendingUploadTarget(null)
    }
  }

  // Batch generate all missing audio
  async function handleBatchGenerateAll() {
    if (!selectedPackage?.version) return
    setBatchGenerating(true)
    setBatchAudioProgress({ done: 0, total: selectedPackage.items.length })
    let done = 0
    try {
      for (const item of selectedPackage.items) {
        const sec = selectedPackage.sections.find((s) => s.id === item.sectionId)
        const lang: 'vi' | 'en' =
          selectedPackage.testType === 'green'
            ? sec && sec.sectionOrder <= 3
              ? 'en'
              : 'vi'
            : sec && sec.sectionOrder <= 3
              ? 'vi'
              : 'en'
        const voice = lang === 'vi' ? 'google/vi-VN-Neural2-A' : 'google/en-US-Neural2-F'
        const script =
          lang === 'vi'
            ? item.spokenScriptVi || item.promptVi || ''
            : item.spokenScriptEn || item.promptEn || ''

        await generateNarration({
          packageVersionId: selectedPackage.version.id,
          target: 'test_item',
          testItemId: item.id,
          language: lang,
          voiceId: voice,
          textOverride: script,
        })
        done++
        setBatchAudioProgress({ done, total: selectedPackage.items.length })
      }
      ok(`Đã tạo xong ${done} file âm thanh Google Cloud TTS!`)
      await loadPackages()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Sinh âm thanh hàng loạt dừng do lỗi')
    } finally {
      setBatchGenerating(false)
      setBatchAudioProgress(null)
    }
  }

  // Save CCI Categories (Ample CRUD)
  async function handleSaveCciCategories() {
    if (!selectedCciProfileId) return
    setSavingCci(true)
    try {
      const res = await batchSaveCciCategories(
        selectedCciProfileId,
        selectedCategories.map((c) => ({
          id: c.id,
          categoryOrder: c.categoryOrder,
          label: c.label,
          value: c.value,
          description: c.description,
        })),
      )
      if (!res.ok) throw new Error(res.error)
      ok('Đã lưu thành công các thông số Ample cho profile!')
      await loadCciProfiles()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Lưu CCI thất bại')
    } finally {
      setSavingCci(false)
    }
  }

  // Create new CCI Profile
  async function handleCreateProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newProfileName.trim()) return
    try {
      const sb = getSupabase() as any
      const { data: orgs } = await sb.from('organizations').select('id').limit(1)
      const orgId = orgs?.[0]?.id
      if (!orgId) throw new Error('Organization not found')

      const res = await createCciProfile({
        organizationId: orgId,
        name: newProfileName.trim(),
        description: newProfileDesc.trim() || null,
        status: 'active',
      })
      if (!res.ok) throw new Error(res.error)

      // Add default 7 session categories (Ample)
      await batchSaveCciCategories(res.data.id, [
        { categoryOrder: 1, label: 'Session 1 Ample', value: 6.0 },
        { categoryOrder: 2, label: 'Session 2 Ample', value: 6.0 },
        { categoryOrder: 3, label: 'Session 3 Ample', value: 4.0 },
        { categoryOrder: 4, label: 'Session 4 Ample', value: 4.0 },
        { categoryOrder: 5, label: 'Session 5 Ample', value: 3.0 },
        { categoryOrder: 6, label: 'Session 6 Ample', value: 3.0 },
        { categoryOrder: 7, label: 'Session 7 Ample', value: 2.0 },
      ])

      ok(`Đã tạo hồ sơ CCI mới: "${newProfileName}"!`)
      setShowNewProfileModal(false)
      setNewProfileName('')
      setNewProfileDesc('')
      setSelectedCciProfileId(res.data.id)
      await loadCciProfiles()
    } catch (e) {
      err(e instanceof Error ? e.message : 'Tạo hồ sơ CCI thất bại')
    }
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Hidden File Input for Custom Audio Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => void handleFileSelected(e)}
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        className="hidden"
      />

      <PageHeader
        title="Package Tests Studio"
        subtitle="Quản lý toàn diện gói bài test: CVR/CPD Physics, cấu hình Ample (CCI), kiểm soát nội dung câu hỏi Green & Red test và pipeline âm thanh Google Cloud TTS."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="ghost flex items-center gap-2"
              onClick={() => void loadPackages()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              className="primary flex items-center gap-2"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-4 w-4" />
              <span>Create Package Test</span>
            </button>
          </div>
        }
      />

      <Flash message={message} error={error} />

      {/* Main Studio Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 rounded-2xl shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          <button
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'packages'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            onClick={() => handleTabChange('packages')}
          >
            <Layers className="h-4 w-4" />
            <span>Gói bài test</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                activeTab === 'packages' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200/80 text-slate-600'
              }`}
            >
              {packageSummaries.length}
            </span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'content'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            onClick={() => handleTabChange('content')}
          >
            <FileText className="h-4 w-4" />
            <span>Soạn thảo & Nội dung câu</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'audio'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            onClick={() => handleTabChange('audio')}
          >
            <Headphones className="h-4 w-4" />
            <span>Quản lý Audio & Review</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'formulas'
                ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-400/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            onClick={() => handleTabChange('formulas')}
          >
            <Calculator className="h-4 w-4 text-violet-300" />
            <span>Công thức & Generator Physics</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-violet-500/20 text-violet-100">
              CVR/CPD
            </span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'cci'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            onClick={() => handleTabChange('cci')}
          >
            <Zap className="h-4 w-4" />
            <span>Hệ số CCI & Ample CRUD</span>
          </button>
        </div>

        {selectedPackage && activeTab !== 'packages' && activeTab !== 'formulas' && (
          <div className="flex items-center gap-2 text-xs py-1">
            <span className="text-slate-400 font-medium">Gói đang chọn:</span>
            <select
              value={selectedPackage.version?.id ?? ''}
              onChange={(e) => {
                const target = packageSummaries.find((s) => s.version?.id === e.target.value)
                if (target) selectPackage(target)
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-hidden max-w-xs truncate"
            >
              {packageSummaries.map((s) => (
                <option key={s.pkg.id} value={s.version?.id ?? ''}>
                  {s.pkg.title.replace(/ · LIVE$/i, '')} ({s.testType.toUpperCase()} - {s.targetVoltage}V)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: PACKAGES CATALOG                                  */}
      {/* ======================================================== */}
      {activeTab === 'packages' && (
        <div className="space-y-6">
          {/* Catalog Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterTab === 'all'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => setFilterTab('all')}
                >
                  Tất cả ({packageSummaries.length})
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    filterTab === 'green'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                  onClick={() => setFilterTab('green')}
                >
                  <span>Green test</span>
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    filterTab === 'red'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                  onClick={() => setFilterTab('red')}
                >
                  <span>Red test</span>
                </button>
              </div>

              {/* Category Filter: Standard vs Mini */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => setCategoryFilter('all')}
                >
                  Mọi quy mô
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    categoryFilter === 'standard'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                  onClick={() => setCategoryFilter('standard')}
                >
                  <span>Standard (49 câu)</span>
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    categoryFilter === 'mini'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-violet-700 hover:bg-violet-50'
                  }`}
                  onClick={() => setCategoryFilter('mini')}
                >
                  <span>Mini-test (21 câu)</span>
                </button>
              </div>

              {/* Batch Mini Generator Action */}
              <button
                type="button"
                onClick={() => void handleBatchCreateMiniTests()}
                disabled={batchCreatingMini}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                title="Tự động tạo các biến thể Mini-test 21 câu từ tất cả các gói Standard test"
              >
                <Sparkles className="h-3.5 w-3.5 text-slate-950" />
                <span>{batchCreatingMini ? (batchProgress || 'Đang tạo...') : '⚡ Tạo 8 bài Mini-test'}</span>
              </button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm mã gói, bài học..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 transition-all"
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setPackagesViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    packagesViewMode === 'grid'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Dạng thẻ lưới (Grid View)"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Lưới</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPackagesViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    packagesViewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Dạng bảng chi tiết (Table View)"
                >
                  <Table className="h-4 w-4" />
                  <span className="hidden sm:inline">Bảng</span>
                </button>
              </div>
            </div>
          </div>

          {/* Packages Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="h-8 w-8 text-slate-400 animate-spin mb-3" />
              <p className="text-xs text-slate-500 font-medium">Đang tải danh mục bài test...</p>
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Không tìm thấy gói bài test</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Chưa có gói bài test nào phù hợp với bộ lọc. Hãy tạo bài test mới bằng AI Generator hoặc làm mới danh sách.
              </p>
              <button
                type="button"
                className="primary text-xs mx-auto"
                onClick={() => setShowCreateModal(true)}
              >
                Tạo Bài Test Đầu Tiên
              </button>
            </div>
          ) : packagesViewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSummaries.map((summary) => {
                const isGreen = summary.testType === 'green'
                const cleanTitle = summary.pkg.title.replace(/ · LIVE$/i, '')
                const audioRatio =
                  summary.audioTotalCount > 0
                    ? Math.round((summary.audioApprovedCount / summary.audioTotalCount) * 100)
                    : 0

                return (
                  <div
                    key={summary.pkg.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isGreen
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            }`}
                          >
                            {isGreen ? 'GREEN FOCUS' : 'RED AWARENESS'} • {summary.targetVoltage}V
                          </span>

                          {summary.packageKind === 'mini' ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200/70">
                              Mini · 21Q
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/70">
                              Standard · 49Q
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleTogglePackageActive(summary)
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              summary.isActive
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200'
                            }`}
                            title={
                              summary.isActive
                                ? 'Gói đang BẬT cho Tests 1-1 (bấm để tắt)'
                                : 'Gói đang TẮT cho Tests 1-1 (bấm để bật)'
                            }
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                summary.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{summary.isActive ? '1-1 ON' : '1-1 OFF'}</span>
                          </button>
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            {summary.questionCount}Q
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors line-clamp-2">
                          {cleanTitle}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                          {summary.pkg.description || 'Chưa có mô tả chi tiết cho gói bài test.'}
                        </p>
                      </div>

                      {/* Physics & Audio Meter */}
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Kháng trở CVR (Ohm):</span>
                          <span className="font-mono font-bold text-slate-800">
                            {summary.cvrMin.toFixed(1)}Ω – {summary.cvrMax.toFixed(1)}Ω
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Tiến độ Audio:</span>
                          <span className="font-bold text-indigo-600">
                            {summary.audioApprovedCount} / {summary.audioTotalCount} ({audioRatio}%)
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              audioRatio === 100
                                ? 'bg-emerald-500'
                                : audioRatio > 0
                                  ? 'bg-indigo-500'
                                  : 'bg-slate-300'
                            }`}
                            style={{ width: `${audioRatio}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            selectPackage(summary)
                            handleTabChange('content')
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Soạn</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            selectPackage(summary)
                            handleTabChange('audio')
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                        >
                          <Headphones className="h-3.5 w-3.5" />
                          <span>Audio</span>
                        </button>

                        {summary.packageKind !== 'mini' && (
                          <button
                            type="button"
                            data-testid="create-mini-btn"
                            onClick={() => openCreateMiniModal(summary)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1"
                            title="Tạo biến thể Mini-test 21 câu từ gói này"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                            <span>Tạo Mini</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewPackage(summary)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Xem trước cấu trúc"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingPackage(summary.pkg)
                            setEditTitle(summary.pkg.title)
                            setEditSlug(summary.pkg.slug)
                            setEditDescription(summary.pkg.description || '')
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Sửa thông tin"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingPackage(summary.pkg)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Xóa vĩnh viễn"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-3.5 px-4">Gói bài test</th>
                      <th className="py-3.5 px-4">Phân loại & Điện áp</th>
                      <th className="py-3.5 px-4">Cấu trúc đề</th>
                      <th className="py-3.5 px-4">Kháng trở CVR (Ω)</th>
                      <th className="py-3.5 px-4">Tiến độ Audio</th>
                      <th className="py-3.5 px-4 text-center">Tests 1-1</th>
                      <th className="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSummaries.map((summary) => {
                      const isGreen = summary.testType === 'green'
                      const cleanTitle = summary.pkg.title.replace(/ · LIVE$/i, '')
                      const audioRatio =
                        summary.audioTotalCount > 0
                          ? Math.round((summary.audioApprovedCount / summary.audioTotalCount) * 100)
                          : 0

                      return (
                        <tr key={summary.pkg.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 line-clamp-1">{cleanTitle}</div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{summary.pkg.slug}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                  isGreen
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {isGreen ? 'GREEN FOCUS' : 'RED AWARENESS'} • {summary.targetVoltage}V
                              </span>

                              {summary.packageKind === 'mini' ? (
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200/70">
                                  Mini
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/70">
                                  Standard
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800">{summary.sections.length}</span>{' '}
                            <span className="text-slate-400">sessions •</span>{' '}
                            <span className="font-bold text-slate-800">{summary.questionCount}</span>{' '}
                            <span className="text-slate-400">câu</span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-slate-800">
                            {summary.cvrMin.toFixed(1)}Ω – {summary.cvrMax.toFixed(1)}Ω
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    audioRatio === 100
                                      ? 'bg-emerald-500'
                                      : audioRatio > 0
                                        ? 'bg-indigo-500'
                                        : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${audioRatio}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-slate-600">
                                {summary.audioApprovedCount}/{summary.audioTotalCount} ({audioRatio}%)
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => void handleTogglePackageActive(summary)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                                summary.isActive
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200'
                              }`}
                              title={
                                summary.isActive
                                  ? 'Gói đang BẬT cho Tests 1-1 (bấm để tắt)'
                                  : 'Gói đang TẮT cho Tests 1-1 (bấm để bật)'
                              }
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  summary.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              <span>{summary.isActive ? 'ON' : 'OFF'}</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  selectPackage(summary)
                                  handleTabChange('content')
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                                title="Soạn nội dung"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span className="hidden md:inline">Soạn</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  selectPackage(summary)
                                  handleTabChange('audio')
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                title="Quản lý audio"
                              >
                                <Headphones className="h-3.5 w-3.5" />
                                <span className="hidden md:inline">Audio</span>
                              </button>
                              {summary.packageKind !== 'mini' && (
                                <button
                                  type="button"
                                  onClick={() => openCreateMiniModal(summary)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1"
                                  title="Tạo biến thể Mini-test 21 câu"
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                                  <span className="hidden md:inline">Tạo Mini</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setPreviewPackage(summary)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                title="Xem trước cấu trúc"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPackage(summary.pkg)
                                  setEditTitle(summary.pkg.title)
                                  setEditSlug(summary.pkg.slug)
                                  setEditDescription(summary.pkg.description || '')
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                title="Sửa thông tin"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPackage(summary.pkg)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Xóa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: CONTENT & QUESTIONS INSPECTOR                     */}
      {/* ======================================================== */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {!selectedPackage ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
              Vui lòng chọn một gói bài test từ danh mục.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Package Meta Header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        selectedPackage.testType === 'green'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {selectedPackage.testType.toUpperCase()} TEST • {selectedPackage.targetVoltage}V
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Mã: {selectedPackage.pkg.slug}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedPackage.pkg.title.replace(/ · LIVE$/i, '')}
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setContentViewMode('accordion')}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        contentViewMode === 'accordion'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title="Dạng Session Accordion"
                    >
                      <Layers className="h-4 w-4" />
                      <span className="hidden sm:inline">Theo Session</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentViewMode('table')}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        contentViewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title="Bảng toàn bộ câu hỏi"
                    >
                      <Table className="h-4 w-4" />
                      <span className="hidden sm:inline">Bảng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentViewMode('validation')}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        contentViewMode === 'validation'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title="Kiểm định chất lượng & Vật lý"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Kiểm định</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTabChange('audio')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 transition-all"
                  >
                    <Headphones className="h-4 w-4" />
                    <span>Mở Audio Studio</span>
                  </button>
                </div>
              </div>

              {/* CONTENT VIEW MODE 1: ACCORDION */}
              {contentViewMode === 'accordion' && (
                <div className="space-y-4">
                  {selectedPackage.sections.map((sec, secIdx) => {
                    const secItems = selectedPackage.items.filter((i) => i.sectionId === sec.id)
                    const isGreen = selectedPackage.testType === 'green'

                    return (
                      <div
                        key={sec.id}
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
                      >
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-slate-200 font-bold text-xs flex items-center justify-center text-slate-700">
                              {sec.sectionOrder}
                            </span>
                            <div>
                              <div className="font-bold text-slate-800 text-xs">
                                {sec.title || `Session ${sec.sectionOrder}`}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {secItems.length} câu hỏi • Mục tiêu CVR: {sec.targetCvrOhm ?? 3}Ω
                              </div>
                            </div>
                          </div>

                          {/* Session Physics & Language Badge */}
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                              <span className={`font-bold uppercase ${
                                getSectionLanguage(sec) === 'en' ? 'text-blue-700' : 'text-emerald-700'
                              }`}>
                                {getSectionLanguage(sec).toUpperCase()} Audio
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleSectionLanguage(sec.id, getSectionLanguage(sec))}
                                className="text-[10px] text-slate-500 hover:text-indigo-600 underline font-semibold transition-colors"
                                title="Đổi ngôn ngữ cho session này"
                              >
                                Đổi sang {getSectionLanguage(sec) === 'en' ? 'VI' : 'EN'}
                              </button>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                              CVR: {sec.targetCvrOhm ?? 3}Ω
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                              Ample: {perSessionAmple[secIdx] ?? 6}A
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                              CPD: {selectedPackage.targetVoltage}V
                            </span>
                          </div>
                        </div>

                        {/* Items Table */}
                        <div className="divide-y divide-slate-100">
                          {secItems.map((item) => {
                            const wordsVi = countWords(item.promptVi || '')
                            const greenValidation = isGreen
                              ? validateGreenSentence(item.promptVi || '', { minWords: 8, maxWords: 22 })
                              : null

                            const hintsList = !isGreen && item.promptVi ? item.promptVi.split('/') : []
                            const redValidation = !isGreen ? validateRedCollocations(hintsList) : null

                            const secLang: 'vi' | 'en' = getSectionLanguage(sec)
                            const itemVariant = itemVariantMap.get(`${item.id}_${secLang}`)
                            const isAudioApproved = itemVariant && itemVariant.approval_status === 'approved'
                            const script =
                              secLang === 'vi'
                                ? item.spokenScriptVi || item.promptVi || ''
                                : item.spokenScriptEn || item.promptEn || ''

                            return (
                              <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors space-y-2">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-1.5 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                        #{item.itemOrder}
                                      </span>
                                      <span className="font-bold text-xs text-slate-800">
                                        {item.termVi || 'Cụm từ trọng tâm'}
                                      </span>
                                      {item.termEn && (
                                        <span className="text-xs text-slate-400 font-medium">
                                          ({item.termEn})
                                        </span>
                                      )}
                                      {isAudioApproved ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                          Đã lưu audio
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                          Chưa lưu audio
                                        </span>
                                      )}
                                    </div>

                                    {/* Vietnamese Prompt */}
                                    <div className="text-xs text-slate-900 font-medium flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-rose-500 uppercase">VI:</span>
                                      <span>{item.promptVi}</span>
                                    </div>

                                    {/* English Prompt */}
                                    <div className="text-xs text-slate-600 flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-indigo-500 uppercase">EN:</span>
                                      <span>{item.promptEn}</span>
                                    </div>
                                  </div>

                                  {/* Validation Meters */}
                                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                    {isGreen && greenValidation && (
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                          greenValidation.valid
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}
                                      >
                                        {greenValidation.valid ? '✓' : '⚠️'} {wordsVi} từ (Giới hạn: 8–22 từ)
                                      </span>
                                    )}

                                    {!isGreen && redValidation && (
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                          redValidation.valid
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}
                                      >
                                        {redValidation.valid ? '✓ Zero single words' : '⚠️ Chứa từ đơn'} (
                                        {redValidation.totalHints} hints)
                                      </span>
                                    )}

                                    <div className="text-[10px] font-mono text-slate-400">
                                      TC: {item.tc ?? 2} • LC: {item.lc ?? 1} • TL: {item.tl ?? 1} • CVR: {item.measuredCvr ?? 3}Ω
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handlePlayItemAudio(`item_${item.id}`, script, secLang, {
                                            itemOrder: item.itemOrder,
                                            variantId: itemVariant?.id,
                                            target: 'test_item',
                                          })
                                        }
                                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                        title={playingAudioKey === `item_${item.id}` ? 'Dừng phát' : 'Nghe thử'}
                                      >
                                        {playingAudioKey === `item_${item.id}` ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Play className="h-3 w-3 fill-current" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditItem(item)}
                                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                        title="Chỉnh sửa nội dung câu hỏi"
                                      >
                                        <Pencil className="h-3 w-3" />
                                        <span>Sửa câu</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CONTENT VIEW MODE 2: LINEAR TABLE */}
              {contentViewMode === 'table' && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-3 px-4 w-12 text-center">#</th>
                          <th className="py-3 px-4">Session</th>
                          <th className="py-3 px-4">Cụm từ trọng tâm</th>
                          <th className="py-3 px-4">Nội dung Tiếng Việt (VI)</th>
                          <th className="py-3 px-4">Nội dung Tiếng Anh (EN)</th>
                          <th className="py-3 px-4">Tham số CVR</th>
                          <th className="py-3 px-4">Chuẩn</th>
                          <th className="py-3 px-4 text-right">Audio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPackage.items.map((item) => {
                          const sec = selectedPackage.sections.find((s) => s.id === item.sectionId)
                          const isGreen = selectedPackage.testType === 'green'
                          const wordsVi = countWords(item.promptVi || '')
                          const greenValidation = isGreen
                            ? validateGreenSentence(item.promptVi || '', { minWords: 8, maxWords: 22 })
                            : null
                          const hintsList = !isGreen && item.promptVi ? item.promptVi.split('/') : []
                          const redValidation = !isGreen ? validateRedCollocations(hintsList) : null

                          const lang: 'vi' | 'en' = getSectionLanguage(sec)
                          const itemVariant = itemVariantMap.get(`${item.id}_${lang}`)
                          const isAudioApproved = itemVariant && itemVariant.approval_status === 'approved'
                          const script =
                            lang === 'vi'
                              ? item.spokenScriptVi || item.promptVi || ''
                              : item.spokenScriptEn || item.promptEn || ''

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">
                                #{item.itemOrder}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                  S{sec?.sectionOrder ?? 1}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-800">{item.termVi || '—'}</div>
                                {item.termEn && <div className="text-[11px] text-slate-400">{item.termEn}</div>}
                              </td>
                              <td className="py-3 px-4 max-w-xs">
                                <div className="text-slate-800 line-clamp-2">{item.promptVi}</div>
                              </td>
                              <td className="py-3 px-4 max-w-xs">
                                <div className="text-slate-600 line-clamp-2">{item.promptEn}</div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                                <div>CVR: <strong className="text-slate-800">{item.measuredCvr ?? 3}Ω</strong></div>
                                <div className="text-[10px] text-slate-400">TC:{item.tc ?? 2} TL:{item.tl ?? 1} LC:{item.lc ?? 1}</div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {isGreen && greenValidation && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      greenValidation.valid
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {greenValidation.valid ? '✓ Đạt' : '⚠️ Lỗi'} ({wordsVi}w)
                                  </span>
                                )}
                                {!isGreen && redValidation && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      redValidation.valid
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {redValidation.valid ? '✓ Đạt' : '⚠️ Lỗi'} ({redValidation.totalHints}h)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isAudioApproved ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                      Đã lưu audio
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                      Chưa lưu audio
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handlePlayItemAudio(`item_${item.id}`, script, lang, {
                                        itemOrder: item.itemOrder,
                                        variantId: itemVariant?.id,
                                        target: 'test_item',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                    title={playingAudioKey === `item_${item.id}` ? 'Dừng phát' : 'Nghe thử'}
                                  >
                                    {playingAudioKey === `item_${item.id}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Play className="h-3.5 w-3.5 fill-current" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditItem(item)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 transition-colors"
                                    title="Chỉnh sửa nội dung câu hỏi"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CONTENT VIEW MODE 3: VALIDATION AUDIT CHECKLIST */}
              {contentViewMode === 'validation' && (() => {
                const isGreen = selectedPackage.testType === 'green'
                const totalItems = selectedPackage.items.length
                let validCount = 0
                let invalidCount = 0

                selectedPackage.items.forEach((item) => {
                  if (isGreen) {
                    const g = validateGreenSentence(item.promptVi || '', { minWords: 8, maxWords: 22 })
                    if (g.valid) validCount++
                    else invalidCount++
                  } else {
                    const hintsList = item.promptVi ? item.promptVi.split('/') : []
                    const r = validateRedCollocations(hintsList)
                    if (r.valid) validCount++
                    else invalidCount++
                  }
                })

                const compliancePercent = totalItems > 0 ? Math.round((validCount / totalItems) * 100) : 100

                return (
                  <div className="space-y-6">
                    {/* Quality Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
                        <span className="text-[11px] text-slate-500 font-medium">Tỷ lệ tuân thủ quy chuẩn</span>
                        <div className="flex items-center justify-between">
                          <span className={`text-2xl font-black ${compliancePercent === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {compliancePercent}%
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {validCount}/{totalItems} câu đạt
                          </span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
                        <span className="text-[11px] text-slate-500 font-medium">Kháng trở CVR trung bình</span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-slate-900 font-mono">
                            {((selectedPackage.cvrMin + selectedPackage.cvrMax) / 2).toFixed(1)}Ω
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            [{selectedPackage.cvrMin.toFixed(1)}Ω - {selectedPackage.cvrMax.toFixed(1)}Ω]
                          </span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
                        <span className="text-[11px] text-slate-500 font-medium">Target CPD (Điện thế)</span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-indigo-600 font-mono">
                            {selectedPackage.targetVoltage}V
                          </span>
                          <span className="text-xs font-bold text-slate-500 uppercase">
                            {selectedPackage.testType}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
                        <span className="text-[11px] text-slate-500 font-medium">Trạng thái rào cản</span>
                        <div className="flex items-center gap-1.5 pt-1">
                          <CheckCircle2 className={`h-5 w-5 ${invalidCount === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
                          <span className="font-bold text-xs text-slate-800">
                            {invalidCount === 0 ? 'Sẵn sàng triển khai' : `Cần điều chỉnh (${invalidCount} câu)`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Archetype Rule Manifest */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                      <div className="font-bold text-xs text-slate-800 flex items-center gap-2">
                        <Info className="h-4 w-4 text-indigo-600" />
                        <span>Quy chuẩn vật lý & ngôn ngữ học cho {isGreen ? 'GREEN TEST (Focus)' : 'RED TEST (Awareness)'}</span>
                      </div>
                      {isGreen ? (
                        <ul className="text-xs text-slate-600 space-y-1 pl-6 list-disc">
                          <li><strong>Độ dài câu:</strong> Mỗi câu hoàn chỉnh phải từ <strong>8 đến 22 từ</strong> để đảm bảo áp lực lưu giữ trong bộ nhớ làm việc.</li>
                          <li><strong>Ngữ pháp tự nhiên:</strong> 1 câu trọn vẹn, dòng chảy ngữ âm liền mạch, không sử dụng dấu gạch chéo tạo bẫy dừng ngắt quãng.</li>
                          <li><strong>Nhịp điệu liên tục:</strong> Tốc độ đọc ổn định, không chèn khoảng dừng nhân tạo.</li>
                        </ul>
                      ) : (
                        <ul className="text-xs text-slate-600 space-y-1 pl-6 list-disc">
                          <li><strong>Cụm collocations:</strong> Tuyệt đối <strong>không chứa từ đơn lẻ</strong>, mỗi cụm phải có ít nhất <strong>2 từ</strong> (≥ 2 words).</li>
                          <li><strong>Neo từ vựng:</strong> Cụm từ đầu tiên luôn được neo trong ngân hàng tài nguyên Chunks để giữ tính kế thừa giáo trình.</li>
                          <li><strong>Khoảng lặng SSML:</strong> Chèn khoảng nghỉ 650ms giữa các cụm để buộc não bộ xử lý nhận thức và kích hoạt bẫy phản xạ.</li>
                        </ul>
                      )}
                    </div>

                    {/* Detailed Audit Table */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                      <div className="p-4 bg-slate-50/80 border-b border-slate-200 font-bold text-xs text-slate-800">
                        Danh sách kiểm tra chi tiết từng câu ({selectedPackage.items.length} câu)
                      </div>
                      <div className="divide-y divide-slate-100">
                        {selectedPackage.items.map((item) => {
                          const isGreen = selectedPackage.testType === 'green'
                          const wordsVi = countWords(item.promptVi || '')
                          const greenValidation = isGreen
                            ? validateGreenSentence(item.promptVi || '', { minWords: 8, maxWords: 22 })
                            : null
                          const hintsList = !isGreen && item.promptVi ? item.promptVi.split('/') : []
                          const redValidation = !isGreen ? validateRedCollocations(hintsList) : null
                          const isItemValid = isGreen ? greenValidation?.valid : redValidation?.valid

                          return (
                            <div key={item.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/50">
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                                    #{item.itemOrder}
                                  </span>
                                  <span className="font-bold text-xs text-slate-800">{item.termVi || 'Core Term'}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isItemValid
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {isItemValid ? '✓ Hợp lệ' : '⚠️ Cần sửa'}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-800">{item.promptVi}</div>
                                {!isItemValid && (
                                  <div className="text-[11px] text-rose-600 font-medium">
                                    {isGreen ? greenValidation?.reason : redValidation?.reason}
                                  </div>
                                )}
                              </div>

                              <div className="text-right text-[11px] font-mono text-slate-400 shrink-0">
                                {isGreen ? `${wordsVi} từ` : `${hintsList.length} collocations`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: AUDIO MANAGEMENT & REVIEW STUDIO                  */}
      {/* ======================================================== */}
      {activeTab === 'audio' && (
        <div className="space-y-6">
          {!selectedPackage ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
              Vui lòng chọn một gói bài test từ danh mục để quản lý âm thanh.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Studio Header Toolbar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Quản lý & Review Audio Google Cloud TTS
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gói bài test: <strong className="text-slate-800">{selectedPackage.pkg.title.replace(/ · LIVE$/i, '')}</strong> • Giọng đọc chuẩn GCP Text-to-Speech API
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Audio View Mode Switcher */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setAudioViewMode('lifecycle')}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        audioViewMode === 'lifecycle'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title="Quy trình Vòng đời (Lifecycle View)"
                    >
                      <Layers className="h-4 w-4" />
                      <span className="hidden sm:inline">Vòng đời</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioViewMode('table')}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        audioViewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title="Bảng tổng hợp Audio (Table View)"
                    >
                      <Table className="h-4 w-4" />
                      <span className="hidden sm:inline">Bảng</span>
                    </button>
                  </div>

                  <select
                    value={audioVoiceId}
                    onChange={(e) => {
                      setAudioVoiceId(e.target.value)
                      setAudioVoiceLang(e.target.value.includes('vi-VN') ? 'vi' : 'en')
                    }}
                    className="text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-slate-800 focus:outline-hidden"
                  >
                    <option value="google/vi-VN-Neural2-A">vi-VN-Neural2-A (Nữ - Tiếng Việt)</option>
                    <option value="google/vi-VN-Neural2-D">vi-VN-Neural2-D (Nam - Tiếng Việt)</option>
                    <option value="google/en-US-Neural2-F">en-US-Neural2-F (Nữ - Tiếng Anh)</option>
                    <option value="google/en-US-Neural2-J">en-US-Neural2-J (Nam - Tiếng Anh)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void handleTestVoice()}
                    disabled={testingTtsVoice}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {testingTtsVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                    <span>Test Giọng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleBatchGenerateAll()}
                    disabled={batchGenerating || selectedPackage.items.length === 0}
                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {batchGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span>Sinh Tất Cả Câu Bằng GCP</span>
                  </button>
                </div>
              </div>

              {/* Batch Progress Bar */}
              {batchAudioProgress && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-xs text-indigo-900 font-bold">
                    <span>Đang gọi Google Cloud TTS sinh âm thanh...</span>
                    <span>
                      {batchAudioProgress.done} / {batchAudioProgress.total} (
                      {Math.round((batchAudioProgress.done / batchAudioProgress.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{
                        width: `${(batchAudioProgress.done / batchAudioProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {uploadingTargetKey && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  <span>Đang tải lên và xử lý tệp audio ghi đè...</span>
                </div>
              )}

              {/* AUDIO VIEW MODE 1: LIFECYCLE */}
              {audioViewMode === 'lifecycle' && (
                <div className="space-y-6">
                  {/* 1. Lifecycle Narrations Section */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">1. Audio Giới Thiệu & Kết Thúc (Lifecycle)</h4>
                    <p className="text-[11px] text-slate-500">
                      Bao gồm lời chào đầu bài (package_start), giới thiệu từng phần (part_intro), và lời chúc mừng kết thúc (package_end).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Package Start */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">Lời Chào Đầu Bài (Package Start)</span>
                      <div className="flex items-center gap-1.5">
                        {packageStartVariant('vi')?.approval_status === 'approved' ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                            Đã lưu audio
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                            Chưa lưu audio
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          package_start
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 italic">
                      "Chào mừng em đến với bài kiểm tra Chunks LMS. Lắng nghe cẩn thận và phát âm chính xác..."
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePlayItemAudio(
                            'pkg_start',
                            'Chào mừng em đến với bài kiểm tra Chunks LMS. Lắng nghe cẩn thận và phát âm chính xác.',
                            'vi',
                            {
                              variantId: packageStartVariant('vi')?.id,
                              target: 'package_start',
                            },
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1 transition-colors"
                        title={playingAudioKey === 'pkg_start' ? 'Dừng phát' : 'Nghe thử'}
                      >
                        {playingAudioKey === 'pkg_start' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 fill-current" />
                        )}
                        <span>{playingAudioKey === 'pkg_start' ? 'Đang phát' : 'Nghe thử'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleRegenerateAudio(
                            'package_start',
                            'Chào mừng em đến với bài kiểm tra Chunks LMS. Lắng nghe cẩn thận và phát âm chính xác.',
                            'vi',
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Sinh GCP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTriggerUpload(
                            'package_start',
                            'Chào mừng em đến với bài kiểm tra Chunks LMS.',
                            'vi',
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Upload File</span>
                      </button>
                    </div>
                  </div>

                  {/* Package End */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">Lời Chúc Mừng Kết Thúc (Package End)</span>
                      <div className="flex items-center gap-1.5">
                        {packageEndVariant('vi')?.approval_status === 'approved' ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                            Đã lưu audio
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                            Chưa lưu audio
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          package_end
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 italic">
                      "Chúc mừng em đã hoàn thành toàn bộ bài kiểm tra. Em đã thể hiện sự tập trung và lưu loát rất xuất sắc!"
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePlayItemAudio(
                            'pkg_end',
                            'Chúc mừng em đã hoàn thành toàn bộ bài kiểm tra. Em đã thể hiện sự tập trung và lưu loát rất xuất sắc!',
                            'vi',
                            {
                              variantId: packageEndVariant('vi')?.id,
                              target: 'package_end',
                            },
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1 transition-colors"
                        title={playingAudioKey === 'pkg_end' ? 'Dừng phát' : 'Nghe thử'}
                      >
                        {playingAudioKey === 'pkg_end' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 fill-current" />
                        )}
                        <span>{playingAudioKey === 'pkg_end' ? 'Đang phát' : 'Nghe thử'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleRegenerateAudio(
                            'package_end',
                            'Chúc mừng em đã hoàn thành toàn bộ bài kiểm tra. Em đã thể hiện sự tập trung và lưu loát rất xuất sắc!',
                            'vi',
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Sinh GCP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTriggerUpload(
                            'package_end',
                            'Chúc mừng em đã hoàn thành toàn bộ bài kiểm tra.',
                            'vi',
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Upload File</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Part Intros (1..3) */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                      Giới thiệu từng phần (Part Intros · P1 - P3)
                    </h5>
                    <span className="text-[10px] font-semibold text-slate-400">
                      part_intro (1..3)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[1, 2, 3].map((p) => {
                      const partVar = partVariantMap.get(`${p}_vi`)
                      const isPartApproved = partVar && partVar.approval_status === 'approved'
                      const partScript =
                        p === 1
                          ? 'Phần 1 - Khởi động nhận thức. Lắng nghe cẩn thận và sẵn sàng phản hồi.'
                          : p === 2
                            ? 'Phần 2 - Tăng tốc phản xạ. Giữ vững nhịp điệu và độ chính xác.'
                            : 'Phần 3 - Về đích và giải phóng áp lực nhận thức.'
                      return (
                        <div key={p} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-800">Part {p} Intro</span>
                            <div className="flex items-center gap-1.5">
                              {isPartApproved ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                  Đã lưu audio
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                  Chưa lưu audio
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                P{p}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2 italic">
                            "{partScript}"
                          </p>
                          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60">
                            <button
                              type="button"
                              onClick={() =>
                                void handlePlayItemAudio(`part_${p}`, partScript, 'vi', {
                                  variantId: partVar?.id,
                                  target: 'part_intro',
                                })
                              }
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1 transition-colors"
                              title={playingAudioKey === `part_${p}` ? 'Dừng phát' : 'Nghe thử'}
                            >
                              {playingAudioKey === `part_${p}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3 fill-current" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRegenerateAudio('part_intro', partScript, 'vi', undefined, undefined, p)
                              }
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                              title="Sinh lại bằng GCP TTS"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleTriggerUpload('part_intro', partScript, 'vi', undefined, undefined, p)
                              }
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
                              title="Upload file ghi đè"
                            >
                              <Upload className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Session Intros (1..N) */}
                {selectedPackage.sections.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                        Giới thiệu từng phiên (Session Intros · {selectedPackage.sections.length} sessions)
                      </h5>
                      <span className="text-[10px] font-semibold text-slate-400">
                        section_intro
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
                      {selectedPackage.sections.map((sec) => {
                        const secLang: 'vi' | 'en' = getSectionLanguage(sec)
                        const secVar = sectionVariantMap.get(`${sec.id}_${secLang}`)
                        const isSecApproved = secVar && secVar.approval_status === 'approved'
                        const secScript =
                          secLang === 'vi'
                            ? sec.introTextVi ||
                              `Phiên ${sec.sectionOrder} - ${sec.title}. CVR ${sec.targetCvrOhm} ohms, CCI ${perSessionAmple[sec.sectionOrder - 1] ?? 6} Ampe. Bắt đầu.`
                            : sec.introTextEn ||
                              `Session ${sec.sectionOrder} - ${sec.title}. CVR ${sec.targetCvrOhm} ohms, CCI ${perSessionAmple[sec.sectionOrder - 1] ?? 6} Amps. Start.`
                        return (
                          <div key={sec.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-slate-800">
                                Session {sec.sectionOrder}: {sec.title}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isSecApproved ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                    Đã lưu audio
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                    Chưa lưu audio
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                  secLang === 'en' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {secLang} · S{sec.sectionOrder}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSectionLanguage(sec.id, secLang)}
                                  className="text-[10px] text-slate-400 hover:text-indigo-600 underline font-semibold transition-colors"
                                  title="Đổi ngôn ngữ cho session này"
                                >
                                  {secLang === 'en' ? 'Đổi VI' : 'Đổi EN'}
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-600 line-clamp-1 italic">
                              "{secScript}"
                            </p>
                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={() =>
                                  void handlePlayItemAudio(`sec_${sec.id}`, secScript, secLang, {
                                    variantId: secVar?.id,
                                    target: 'section_intro',
                                  })
                                }
                                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1 transition-colors"
                                title={playingAudioKey === `sec_${sec.id}` ? 'Dừng phát' : 'Nghe thử'}
                              >
                                {playingAudioKey === `sec_${sec.id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3 fill-current" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRegenerateAudio('section_intro', secScript, secLang, sec.id)
                                }
                                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                                title="Sinh lại bằng GCP TTS"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTriggerUpload('section_intro', secScript, secLang, sec.id)
                                }
                                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
                                title="Upload file ghi đè"
                              >
                                <Upload className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Test Items Audio Review List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">2. Audio Từng Câu Hỏi ({selectedPackage.items.length} câu)</h4>
                    <p className="text-[11px] text-slate-500">
                      Nghe thử trực tiếp giọng GCP Neural2, tạo lại (regenerate) hoặc tải lên file audio ghi âm thực tế.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto pr-2">
                  {selectedPackage.items.map((item) => {
                    const sec = selectedPackage.sections.find((s) => s.id === item.sectionId)
                    const lang: 'vi' | 'en' = getSectionLanguage(sec)
                    const itemVar = itemVariantMap.get(`${item.id}_${lang}`)
                    const isItemApproved = itemVar && itemVar.approval_status === 'approved'
                    const script =
                      lang === 'vi'
                        ? item.spokenScriptVi || item.promptVi || ''
                        : item.spokenScriptEn || item.promptEn || ''

                    return (
                      <div key={item.id} className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-xl transition-colors">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              #{item.itemOrder}
                            </span>
                            <span className="font-bold text-xs text-slate-800">
                              {item.termVi || 'Core Term'}
                            </span>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                              {lang}
                            </span>
                            {isItemApproved ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                Đã lưu audio
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                Chưa lưu audio
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-700 line-clamp-1 font-medium">
                            {script}
                          </div>
                        </div>

                        {/* Audio Item Controls */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void handlePlayItemAudio(`item_${item.id}`, script, lang, {
                                itemOrder: item.itemOrder,
                                variantId: itemVar?.id,
                                target: 'test_item',
                              })
                            }
                            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title={playingAudioKey === `item_${item.id}` ? 'Dừng phát' : 'Nghe thử'}
                          >
                            {playingAudioKey === `item_${item.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5 fill-current" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditItem(item)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 transition-colors"
                            title="Chỉnh sửa câu hỏi & kịch bản"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleRegenerateAudio('test_item', script, lang, item.sectionId, item.id)
                            }
                            className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                            title="Sinh lại bằng GCP TTS"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerUpload('test_item', script, lang, item.sectionId, item.id)
                            }
                            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                            title="Upload audio thay thế"
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* AUDIO VIEW MODE 2: TABLE VIEW */}
          {audioViewMode === 'table' && (() => {
            type FlatAudioRow = {
              key: string
              target: NarrationGenerationTarget
              label: string
              orderRef: string
              lang: 'vi' | 'en'
              text: string
              part?: number
              sectionId?: string
              itemId?: string
              itemOrder?: number
              variantId?: string | null
              isApproved?: boolean
            }

            const rows: FlatAudioRow[] = []

            // Package Start
            const startVar = packageStartVariant('vi')
            rows.push({
              key: 'pkg_start',
              target: 'package_start',
              label: 'Lời chào đầu bài',
              orderRef: 'START',
              lang: 'vi',
              text: 'Chào mừng em đến với bài kiểm tra Chunks LMS. Lắng nghe cẩn thận và phát âm chính xác.',
              variantId: startVar?.id,
              isApproved: startVar?.approval_status === 'approved',
            })

            // Part Intros (P1..P3)
            ;[1, 2, 3].forEach((p) => {
              const partVar = partVariantMap.get(`${p}_vi`)
              const partScript =
                p === 1
                  ? 'Phần 1 - Khởi động nhận thức. Lắng nghe cẩn thận và sẵn sàng phản hồi.'
                  : p === 2
                    ? 'Phần 2 - Tăng tốc phản xạ. Giữ vững nhịp điệu và độ chính xác.'
                    : 'Phần 3 - Về đích và giải phóng áp lực nhận thức.'
              rows.push({
                key: `part_${p}`,
                target: 'part_intro',
                label: `Part ${p} Intro`,
                orderRef: `P${p}`,
                lang: 'vi',
                text: partScript,
                part: p,
                variantId: partVar?.id,
                isApproved: partVar?.approval_status === 'approved',
              })
            })

            // Session Intros (1..N)
            selectedPackage.sections.forEach((sec) => {
              const secLang: 'vi' | 'en' =
                selectedPackage.testType === 'green'
                  ? sec.sectionOrder <= 3
                    ? 'en'
                    : 'vi'
                  : sec.sectionOrder <= 3
                    ? 'vi'
                    : 'en'
              const secVar = sectionVariantMap.get(`${sec.id}_${secLang}`)
              const secScript =
                secLang === 'vi'
                  ? sec.introTextVi ||
                    `Phiên ${sec.sectionOrder} - ${sec.title}. CVR ${sec.targetCvrOhm} ohms, CCI ${perSessionAmple[sec.sectionOrder - 1] ?? 6} Ampe. Bắt đầu.`
                  : sec.introTextEn ||
                    `Session ${sec.sectionOrder} - ${sec.title}. CVR ${sec.targetCvrOhm} ohms, CCI ${perSessionAmple[sec.sectionOrder - 1] ?? 6} Amps. Start.`
              rows.push({
                key: `sec_${sec.id}`,
                target: 'section_intro',
                label: `Session ${sec.sectionOrder}: ${sec.title || 'Session'}`,
                orderRef: `S${sec.sectionOrder}`,
                lang: secLang,
                text: secScript,
                sectionId: sec.id,
                variantId: secVar?.id,
                isApproved: secVar?.approval_status === 'approved',
              })
            })

            // Items (1..N)
            selectedPackage.items.forEach((item) => {
              const sec = selectedPackage.sections.find((s) => s.id === item.sectionId)
              const lang: 'vi' | 'en' =
                selectedPackage.testType === 'green'
                  ? sec && sec.sectionOrder <= 3
                    ? 'en'
                    : 'vi'
                  : sec && sec.sectionOrder <= 3
                    ? 'vi'
                    : 'en'
              const itemVar = itemVariantMap.get(`${item.id}_${lang}`)
              const script =
                lang === 'vi'
                  ? item.spokenScriptVi || item.promptVi || ''
                  : item.spokenScriptEn || item.promptEn || ''
              rows.push({
                key: `item_${item.id}`,
                target: 'test_item',
                label: `Câu #${item.itemOrder} (${item.termVi || 'Core Term'})`,
                orderRef: `#${item.itemOrder}`,
                lang,
                text: script,
                sectionId: item.sectionId,
                itemId: item.id,
                itemOrder: item.itemOrder,
                variantId: itemVar?.id,
                isApproved: itemVar?.approval_status === 'approved',
              })
            })

            // Package End
            const endVar = packageEndVariant('vi')
            rows.push({
              key: 'pkg_end',
              target: 'package_end',
              label: 'Lời kết thúc bài',
              orderRef: 'END',
              lang: 'vi',
              text: 'Chúc mừng em đã hoàn thành toàn bộ bài kiểm tra. Em đã thể hiện sự tập trung và lưu loát rất xuất sắc!',
              variantId: endVar?.id,
              isApproved: endVar?.approval_status === 'approved',
            })

            return (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800">
                    Bảng tổng hợp toàn bộ tài sản âm thanh ({rows.length} files)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    GCP Text-to-Speech Neural2
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-3 px-4 w-16">Ref</th>
                        <th className="py-3 px-4">Mục tiêu (Target)</th>
                        <th className="py-3 px-4">Tên tài sản</th>
                        <th className="py-3 px-4">Trạng thái</th>
                        <th className="py-3 px-4 w-16">Ngôn ngữ</th>
                        <th className="py-3 px-4">Kịch bản phát âm (Script)</th>
                        <th className="py-3 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <tr key={row.key} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-400 text-[11px]">
                            {row.orderRef}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
                              {row.target}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {row.label}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {row.isApproved ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                Đã lưu audio
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                Chưa lưu audio
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                              {row.lang}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-sm line-clamp-1">
                            {row.text}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  void handlePlayItemAudio(row.key, row.text, row.lang, {
                                    itemOrder: row.itemOrder,
                                    variantId: row.variantId,
                                    target: row.target,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                title={playingAudioKey === row.key ? 'Dừng phát' : 'Nghe thử'}
                              >
                                {playingAudioKey === row.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 fill-current" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRegenerateAudio(
                                    row.target,
                                    row.text,
                                    row.lang,
                                    row.sectionId,
                                    row.itemId,
                                    row.part,
                                  )
                                }
                                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                title="Sinh lại bằng GCP TTS"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTriggerUpload(
                                    row.target,
                                    row.text,
                                    row.lang,
                                    row.sectionId,
                                    row.itemId,
                                    row.part,
                                  )
                                }
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                title="Upload file ghi đè"
                              >
                                <Upload className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: FORMULAS & GENERATOR PHYSICS SPECS                */}
      {/* ======================================================== */}
      {activeTab === 'formulas' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-xs font-bold tracking-wide uppercase">
                <Calculator className="h-3.5 w-3.5 text-violet-300" />
                <span>Cognitive Physics & Math Matrix</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Vật Lý Nhận Thức & Công Thức Sinh Đề Chunks
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Định nghĩa toán học cho toàn bộ quá trình tự động sinh bài test: từ kháng trở từ vựng (CVR), hiệu điện thế nhận thức (CPD), đến phân phối cường độ dòng chú ý Ample (CCI) qua các phiên học.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const formulaText = `CHUNKS LMS GENERATOR PHYSICS:\n1. CVR = TC × TL × LC (Ohm)\n2. CPD = CVR × CCI (Volt)\n3. CCI = round(CPD / CVR) (Ample)\n\nGREEN TEST:\n- 12V CPD\n- 8-22 words complete sentence\n- Continuous phonological flow, 0 trap pauses\n\nRED TEST:\n- 56V CPD\n- Collocations >= 2 words (Zero single words)\n- Anchor in Chunks resource\n- 650ms SSML pauses between chunks`
                    void navigator.clipboard.writeText(formulaText)
                    setCopiedFormula(true)
                    setTimeout(() => setCopiedFormula(false), 2500)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center gap-2 transition-all"
                >
                  {copiedFormula ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedFormula ? 'Đã sao chép đặc tả!' : 'Sao chép đặc tả công thức'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-500 hover:bg-violet-400 text-white shadow-sm flex items-center gap-2 transition-all"
                >
                  <WandSparkles className="h-4 w-4" />
                  <span>Mở AI Package Generator</span>
                </button>
              </div>
            </div>
            {/* Background Accent Grid */}
            <div className="absolute -right-10 -bottom-10 w-80 h-80 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />
          </div>

          {/* Section 1: The Three Fundamental Formulas */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                1. Ba Định Luật Vật Lý Nhận Thức Nền Tảng
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Formula 1: CVR */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-violet-50 text-violet-700 border border-violet-200">
                      Kháng trở (Resistance)
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-400">Đơn vị: Ohm (Ω)</span>
                  </div>

                  <div className="p-3 bg-violet-50/50 rounded-xl border border-violet-100 text-center">
                    <div className="font-mono font-black text-lg text-violet-900 tracking-wide">
                      CVR = TC × TL × LC
                    </div>
                    <div className="text-[10px] text-violet-700 mt-0.5">
                      Cognitive Vocabulary Resistance
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">TC (Term Complexity):</strong> Kháng trở cơ sở của cụm từ vựng (mặc định <strong>3.0Ω</strong> từ ngân hàng Chunks).
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">TL (Topic Level):</strong> Mức độ trừu tượng ngữ nghĩa & áp lực phản xạ (<strong>1.0 – 2.0</strong>, A1=1.0, B1=1.25, B2=1.5, C1=1.75, C2=2.0).
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">LC (Length Complexity):</strong> Hệ số độ dài từ: ≤8 từ (1.0), 9-14 từ (1.0-1.4), 15-17 từ (1.4-1.7), 18-22 từ (1.7-2.0), &gt;22 từ (2.0-2.5).
                    </div>
                  </div>
                </div>
              </div>

              {/* Formula 2: CPD */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Hiệu điện thế (Voltage)
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-400">Đơn vị: Volt (V)</span>
                  </div>

                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-center">
                    <div className="font-mono font-black text-lg text-indigo-900 tracking-wide">
                      CPD = CVR × CCI
                    </div>
                    <div className="text-[10px] text-indigo-700 mt-0.5">
                      Cognitive Potential Difference
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">Tải Nhận Thức Mục Tiêu:</strong> Điện thế nhận thức cần tác động lên não bộ để kích hoạt trạng thái chú ý sâu.
                    </div>
                    <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                      <strong>Green Focus Test (12V):</strong> Tải điện thế êm ái, câu hoàn chỉnh liền mạch, đo sự bền bỉ của dòng chú ý (Focus).
                    </div>
                    <div className="p-2 bg-rose-50 text-rose-800 rounded-lg border border-rose-100">
                      <strong>Red Awareness Test (56V):</strong> Tải điện thế cao, chuỗi collocations rời rạc, đo khả năng ức chế phản xạ sai lầm (Awareness).
                    </div>
                  </div>
                </div>
              </div>

              {/* Formula 3: CCI */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                      Cường độ dòng (Current)
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-400">Đơn vị: Ample (A)</span>
                  </div>

                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-center">
                    <div className="font-mono font-black text-lg text-amber-900 tracking-wide">
                      CCI = round(CPD / CVR)
                    </div>
                    <div className="text-[10px] text-amber-700 mt-0.5">
                      Cognitive Current Intensity
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">Cường Độ Ample:</strong> Mức độ năng lượng kích hoạt cần duy trì qua từng session (Session 1 đến 7).
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">Đường cong 7 Sessions:</strong> Phản ánh chu kỳ mỏi nhận thức (Cognitive Fatigue Curve): [12, 7, 5, 10, 6, 4, 4]A cho Red test.
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <strong className="text-slate-900">Quản lý linh hoạt:</strong> Có thể điều chỉnh và lưu trữ qua tab <strong>Hồ sơ CCI & Ample CRUD</strong>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Green vs Red Archetype Matrix */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                2. Ma Trận Đối Chiếu Archetype: Green Test vs Red Test
              </h3>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4 w-40">Thuộc tính</th>
                      <th className="py-3 px-4 bg-emerald-50/50 text-emerald-800">
                        GREEN TEST (Focus)
                      </th>
                      <th className="py-3 px-4 bg-rose-50/50 text-rose-800">
                        RED TEST (Awareness)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Mục tiêu đo lường</td>
                      <td className="py-3 px-4 text-emerald-700 font-medium">
                        Focus: Khả năng duy trì sự tập trung liền mạch và độ trôi chảy ngữ âm.
                      </td>
                      <td className="py-3 px-4 text-rose-700 font-medium">
                        Awareness: Khả năng nhận thức bẫy, ức chế phản xạ thói quen và phản xạ nhanh.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Cấu trúc ngữ pháp</td>
                      <td className="py-3 px-4">
                        1 câu hoàn chỉnh có cấu trúc đầy đủ, ngữ nghĩa tự nhiên, dài từ <strong>8 đến 22 từ</strong>.
                      </td>
                      <td className="py-3 px-4">
                        Chuỗi collocations rời rạc (tương tự Improv), tuyệt đối <strong>không chứa từ đơn lẻ (≥ 2 từ/cụm)</strong>.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Neo từ vựng nguồn</td>
                      <td className="py-3 px-4">
                        Lấy từ vựng từ ngân hàng Chunks Firestore, sau đó xây dựng câu hoàn chỉnh theo yêu cầu.
                      </td>
                      <td className="py-3 px-4">
                        <strong>Cụm từ đầu tiên luôn neo trong Chunks</strong>, các cụm sau mở rộng theo độ khó và tần suất xuất hiện.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Rào cản cấm (Gate)</td>
                      <td className="py-3 px-4 text-rose-600 font-semibold">
                        Cấm dùng dấu gạch chéo (/), cấm bẫy ngắt quãng nhân tạo.
                      </td>
                      <td className="py-3 px-4 text-rose-600 font-semibold">
                        Cấm từ đơn lẻ (Zero single words). Mọi thành phần đều phải là cụm từ có nghĩa.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Nhịp điệu âm thanh TTS</td>
                      <td className="py-3 px-4">
                        Dòng chảy ngữ âm liền mạch (Continuous phonological flow), nhịp đọc tự nhiên không ngắt quãng.
                      </td>
                      <td className="py-3 px-4">
                        Chèn khoảng lặng <strong>650ms SSML (&lt;break time="650ms"/&gt;)</strong> giữa các cụm để buộc não bộ giải phóng áp lực.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Điện thế mục tiêu (CPD)</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                        12V – 24V (Tiêu chuẩn: 12V)
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-rose-600">
                        48V – 72V (Tiêu chuẩn: 56V)
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">Dải Kháng trở CVR</td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        3.0Ω – 6.0Ω (Kháng trở êm dịu)
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        6.0Ω – 16.0Ω (Kháng trở xung áp cao)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: Interactive Cognitive Physics Sandbox & Calculator */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                3. Interactive Physics Sandbox & Bộ Tính Toán Trực Quan
              </h3>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              {/* Presets Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">Cấu hình mẫu định sẵn (Presets):</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applySandboxPreset('green_12v')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200/60"
                  >
                    Green Focus 12V
                  </button>
                  <button
                    type="button"
                    onClick={() => applySandboxPreset('green_18v')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200/60"
                  >
                    Green Sprint 18V
                  </button>
                  <button
                    type="button"
                    onClick={() => applySandboxPreset('red_56v')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200/60"
                  >
                    Red Awareness 56V
                  </button>
                  <button
                    type="button"
                    onClick={() => applySandboxPreset('red_72v')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200/60"
                  >
                    Red Extreme 72V
                  </button>
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* TC Slider */}
                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>TC (Term Complexity)</span>
                    <span className="font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {calcTc.toFixed(1)}Ω
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.5"
                    value={calcTc}
                    onChange={(e) => setCalcTc(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>1.0 (Dễ)</span>
                    <span>3.0 (Chuẩn)</span>
                    <span>6.0 (Cao cấp)</span>
                  </div>
                </div>

                {/* TL Slider */}
                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>TL (Topic Level / Latency)</span>
                    <span className="font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {calcTl.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.05"
                    value={calcTl}
                    onChange={(e) => setCalcTl(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>1.0 (A1-A2)</span>
                    <span>1.5 (B2)</span>
                    <span>2.0 (C2)</span>
                  </div>
                </div>

                {/* Word Count -> LC */}
                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>Số từ (Word count → LC)</span>
                    <span className="font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {calcWordCount}w (LC:{derivedSandboxLc})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="30"
                    step="1"
                    value={calcWordCount}
                    onChange={(e) => setCalcWordCount(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>8w (1.0)</span>
                    <span>15w (1.5)</span>
                    <span>22w (2.0)</span>
                  </div>
                </div>

                {/* CPD Target Slider */}
                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>Target CPD (Voltage)</span>
                    <span className="font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {calcCpd}V
                    </span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="96"
                    step="2"
                    value={calcCpd}
                    onChange={(e) => setCalcCpd(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>12V (Green)</span>
                    <span>56V (Red)</span>
                    <span>96V (Max)</span>
                  </div>
                </div>
              </div>

              {/* Realtime Output Meters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl">
                {/* Meter 1: CVR */}
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 font-medium">Kháng trở CVR tính toán</span>
                  <div className="text-3xl font-black font-mono text-emerald-400">
                    {derivedSandboxCvr.toFixed(2)}Ω
                  </div>
                  <p className="text-[10px] text-slate-300">
                    = {calcTc.toFixed(1)}Ω × {calcTl.toFixed(2)} × {derivedSandboxLc}
                  </p>
                </div>

                {/* Meter 2: Derived CCI */}
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 font-medium">Cường độ dòng CCI (Ample)</span>
                  <div className="text-3xl font-black font-mono text-amber-400">
                    {derivedSandboxCci}A
                  </div>
                  <p className="text-[10px] text-slate-300">
                    = round({calcCpd}V / {derivedSandboxCvr.toFixed(2)}Ω)
                  </p>
                </div>

                {/* Meter 3: Tension Status & Generator Trigger */}
                <div className="flex flex-col justify-between space-y-2">
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium">Tải nhận thức (Cognitive Tension)</span>
                    <div className="text-sm font-bold mt-1">
                      {calcCpd <= 24 ? (
                        <span className="text-emerald-400">Low Tension • Sustained Focus Flow</span>
                      ) : calcCpd <= 60 ? (
                        <span className="text-amber-400">High Tension • Awareness & Inhibition</span>
                      ) : (
                        <span className="text-rose-400">Extreme Surge • Severe Trap Challenge</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={applySandboxToGenerator}
                    className="w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    <span>Áp dụng vào Generator & Tạo Đề</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: CCI & AMPLE PROFILES CRUD                         */}
      {/* ======================================================== */}
      {activeTab === 'cci' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Quản lý Hệ Số CCI & Cường Độ Ample (A)
              </h3>
              <p className="text-xs text-slate-500">
                Thiết lập mức cường độ nhận thức cho từng session (Session 1 đến 7) để phục vụ công thức CPD = CVR × CCI.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedCciProfileId}
                onChange={(e) => setSelectedCciProfileId(e.target.value)}
                className="text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-slate-800 focus:outline-hidden font-bold"
              >
                {cciProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.versionLabel})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowNewProfileModal(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Hồ sơ mới</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveCciCategories()}
                disabled={savingCci || selectedCategories.length === 0}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {savingCci ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Lưu Thay Đổi Ample</span>
              </button>
            </div>
          </div>

          {/* Categories Ample Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-xs">
                Danh mục Session & Giá trị Ample (A)
              </h4>
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                {loadingCci && <Loader2 className="h-3 w-3 animate-spin text-amber-600" />}
                <span>{selectedCategories.length} sessions được cấu hình</span>
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {selectedCategories.map((cat, idx) => (
                <div key={cat.id || idx} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 font-bold text-xs text-amber-800 flex items-center justify-center">
                      S{cat.categoryOrder}
                    </span>
                    <div>
                      <div className="font-bold text-xs text-slate-800">{cat.label}</div>
                      <div className="text-[11px] text-slate-400">
                        {cat.description || 'Mức độ tiêu hao nhận thức theo phiên'}
                      </div>
                    </div>
                  </div>

                  {/* Ample Value Input */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-500">Ample:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="24"
                        value={cat.value}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setSelectedCategories((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, value: val } : c)),
                          )
                        }}
                        className="w-16 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center focus:outline-hidden"
                      />
                      <span className="text-xs font-bold text-amber-600">A</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategories((prev) => prev.filter((_, i) => i !== idx))
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Xóa session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const nextOrder = selectedCategories.length + 1
                  setSelectedCategories((prev) => [
                    ...prev,
                    {
                      id: `temp_${Date.now()}`,
                      profileId: selectedCciProfileId,
                      categoryOrder: nextOrder,
                      label: `Session ${nextOrder} Ample`,
                      value: 4.0,
                      description: `Session ${nextOrder} cognitive rate`,
                      metadata: {},
                    },
                  ])
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Thêm Session Ample</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveCciCategories()}
                className="primary text-xs"
                disabled={savingCci}
              >
                {savingCci ? 'Đang lưu...' : 'Lưu Thay Đổi Ample'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ACTIVE PACKAGE CREATOR MODAL                             */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Create Test Package
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tạo bài test chủ động: nhập CPD, số session, số câu, và tùy chỉnh tham số CVR (TC x TL x LC).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Mode Selector */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2">
              <button
                type="button"
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  createTab === 'ai'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setCreateTab('ai')}
              >
                <span className="flex items-center gap-1.5">
                  <WandSparkles className="h-3.5 w-3.5" />
                  <span>AI Generator (Firestore Vocab)</span>
                </span>
              </button>
              <button
                type="button"
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  createTab === 'manual'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setCreateTab('manual')}
              >
                Manual Blank Draft
              </button>
            </div>

            {/* Modal Body */}
            {createTab === 'ai' ? (
              <form onSubmit={(e) => void handleGenerateAiPackage(e)} className="p-6 space-y-6 text-xs">
                {/* Dynamic Test Type */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-800">Dynamic Test Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAiTestType('green')}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        aiTestType === 'green'
                          ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span>Green Focus Test</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        1 câu hoàn chỉnh tự nhiên, đếm từ lũy tiến 9-10w đến 22w max. Continuous rhythm ($TL=1.0$).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAiTestType('red')}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        aiTestType === 'red'
                          ? 'border-rose-600 bg-rose-50/60 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-rose-800 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span>Red Awareness Test</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Chuỗi collocations (Zero single words, $\ge 2$ từ), anchor từ Chunks, khoảng lặng SSML 650ms.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Firestore Lesson Picker */}
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-800">
                    Bài học nguồn (Firestore Lessons)
                  </label>
                  <select
                    value={selectedLessonId}
                    onChange={(e) => setSelectedLessonId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:outline-hidden"
                  >
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        [{l.levelCode}] {l.lessonTitle} (Day {l.dayNumber} • {l.totalChunks} chunks)
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span>
                      {loadingChunks
                        ? 'Đang nạp chunks...'
                        : `Đã nạp ${lessonChunks.length} chunks từ bài học`}
                    </span>
                    <span>Từ vựng chuẩn giáo trình Chunks LMS</span>
                  </div>
                </div>

                {/* Structure: Sessions & Questions */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Số Session</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={aiSessionCount}
                      onChange={(e) => setAiSessionCount(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-center font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block text-center">Mặc định: 7 sessions</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Số câu / session</label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={aiQuestionsPerSession}
                      onChange={(e) => setAiQuestionsPerSession(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-center font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block text-center">Mặc định: 3 câu (7x3=21Q)</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target CPD (Volt)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={aiTargetVoltage}
                      onChange={(e) => setAiTargetVoltage(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-center font-bold text-indigo-600"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block text-center">
                      Green: 12V | Red: 56V
                    </span>
                  </div>
                </div>

                {/* Physics CVR Controls: TC, TL, LC */}
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5" />
                      <span>Tham số CVR = TC × TL × LC</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-700">
                      CVR = {computedCvr}Ω • Suy diễn CCI: {computedDerivedCci}A
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-semibold text-slate-700">
                        <span>TC (Term)</span>
                        <span className="font-mono text-indigo-600">{uiTc}Ω</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="6.0"
                        step="0.5"
                        value={uiTc}
                        onChange={(e) => setUiTc(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                      <span className="text-[9px] text-slate-400">Resource chunks (def 3Ω)</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-semibold text-slate-700">
                        <span>TL (Topic Level)</span>
                        <span className="font-mono text-indigo-600">{uiTl}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="2.0"
                        step="0.1"
                        value={uiTl}
                        onChange={(e) => setUiTl(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                      <span className="text-[9px] text-slate-400">Level & latency (1.0 - 2.0)</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-semibold text-slate-700">
                        <span>LC (Length)</span>
                        <span className="font-mono text-indigo-600">{uiLc}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="2.5"
                        step="0.05"
                        value={uiLc}
                        onChange={(e) => setUiLc(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                      <span className="text-[9px] text-slate-400">8w=1.0, 15w=1.5, 22w=2.0</span>
                    </div>
                  </div>
                </div>

                {/* Optional Custom Naming */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Tùy biến tên & mã gói (tùy chọn)</label>
                    <button
                      type="button"
                      onClick={() => setAllowCustomCode(!allowCustomCode)}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold"
                    >
                      {allowCustomCode ? 'Sử dụng tự động' : 'Tùy chỉnh thủ công'}
                    </button>
                  </div>
                  {allowCustomCode && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Tên gói bài test</label>
                        <input
                          type="text"
                          value={customTitle}
                          onChange={(e) => setCustomTitle(e.target.value)}
                          placeholder="Nhập tên tùy chỉnh..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Mã gói (Package Code)</label>
                        <input
                          type="text"
                          value={customPackageCode}
                          onChange={(e) => setCustomPackageCode(e.target.value)}
                          placeholder="e.g. GREEN-12V-7X3"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    className="ghost text-xs"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creatingPackage}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="primary text-xs flex items-center gap-1.5"
                    disabled={creatingPackage}
                  >
                    {creatingPackage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Đang tạo bài test...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Tạo Gói Bài Test ({totalQuestions}Q)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => void handleCreateManualPackage(e)} className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-semibold mb-1">Package Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Custom Diagnostic Test"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Version</label>
                    <input
                      type="text"
                      placeholder="v1"
                      value={manualVersionLabel}
                      onChange={(e) => setManualVersionLabel(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-1">Session Count</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={manualSessionCount}
                      onChange={(e) => setManualSessionCount(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Questions / Session</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={manualItemsPerSession}
                      onChange={(e) => setManualItemsPerSession(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-4">
                  <button
                    type="button"
                    className="ghost text-xs"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="primary text-xs" disabled={creatingPackage}>
                    {creatingPackage ? 'Đang tạo...' : 'Tạo Bản Thảo Thủ Công'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* NEW CCI PROFILE MODAL */}
      {showNewProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Tạo Hồ Sơ CCI Mới</h3>
            <form onSubmit={(e) => void handleCreateProfileSubmit(e)} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Tên hồ sơ</label>
                <input
                  type="text"
                  placeholder="e.g. Ecommerce 7-Session Ample"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mô tả</label>
                <textarea
                  placeholder="Mô tả mục tiêu cường độ nhận thức..."
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="ghost text-xs"
                  onClick={() => setShowNewProfileModal(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="primary text-xs">
                  Tạo Hồ Sơ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-8 max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {previewPackage.pkg.title.replace(/ · LIVE$/i, '')}
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  {previewPackage.sections.length} Sessions • {previewPackage.items.length} Questions • Target {previewPackage.targetVoltage}V CPD
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPackage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs divide-y divide-slate-100">
              {previewPackage.sections.map((sec) => {
                const sItems = previewPackage.items.filter((i) => i.sectionId === sec.id)
                return (
                  <div key={sec.id} className="pt-4 first:pt-0 space-y-2">
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      <span>{sec.title || `Session ${sec.sectionOrder}`}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Target CVR: {sec.targetCvrOhm}Ω
                      </span>
                    </div>
                    <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                      {sItems.map((item) => (
                        <div key={item.id} className="space-y-0.5">
                          <div className="font-bold text-slate-800">
                            #{item.itemOrder}. {item.promptVi}
                          </div>
                          <div className="text-slate-500 text-[11px]">{item.promptEn}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end flex-shrink-0">
              <button
                type="button"
                className="primary text-xs"
                onClick={() => setPreviewPackage(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT METADATA MODAL */}
      {editingPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Sửa Thông Tin Gói</h3>
            <form onSubmit={(e) => void handleSaveMetadata(e)} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Tiêu đề</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mã định danh (Slug)</label>
                <input
                  type="text"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mô tả</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="ghost text-xs"
                  onClick={() => setEditingPackage(null)}
                  disabled={savingMetadata}
                >
                  Hủy
                </button>
                <button type="submit" className="primary text-xs" disabled={savingMetadata}>
                  {savingMetadata ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TEST ITEM MODAL */}
      {editingItem && (() => {
        const sec = selectedPackage?.sections.find((s) => s.id === editingItem.sectionId)
        const secIndex = selectedPackage?.sections.findIndex((s) => s.id === editingItem.sectionId) ?? -1
        const activeLang = getSectionLanguage(sec)
        const isGreen = selectedPackage?.testType === 'green'
        const activeText = activeLang === 'vi' ? editPromptVi : editPromptEn
        const words = countWords(activeText)
        const greenValidation = isGreen ? validateGreenSentence(activeText, { minWords: 8, maxWords: 22 }) : null
        const redValidation = !isGreen ? validateRedCollocations([activeText]) : null

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 my-8 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 font-bold text-sm">
                    Q{editingItem.itemOrder}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      Chỉnh sửa nội dung câu hỏi
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
                        {sec ? `Session ${sec.sectionOrder || (secIndex + 1)}: ${sec.title}` : `Item #${editingItem.itemOrder}`}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sửa nội dung văn bản câu hỏi, kịch bản đọc và tạo lại âm thanh Google Cloud TTS chất lượng cao.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Validation Status Banner */}
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                isGreen
                  ? greenValidation?.valid
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50/80 border-amber-200 text-amber-800'
                  : redValidation?.valid
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50/80 border-amber-200 text-amber-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    {isGreen ? (
                      <>
                        <strong>Green Archetype (8-22 từ):</strong> Hiện tại <strong>{words}</strong> từ theo ngữ cảnh{' '}
                        <strong className="uppercase">{activeLang}</strong>. {greenValidation?.reason || 'Đạt chuẩn câu đơn hoàn chỉnh.'}
                      </>
                    ) : (
                      <>
                        <strong>Red Collocation:</strong> Hiện tại <strong>{words}</strong> từ. {redValidation?.reason || 'Đạt chuẩn cụm từ ghép.'}
                      </>
                    )}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-white border border-slate-200 shrink-0">
                  Audio: {activeLang.toUpperCase()}
                </span>
              </div>

              {/* Form inputs */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
                {/* Vietnamese Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Nội dung câu hỏi Tiếng Việt (promptVi) *
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {countWords(editPromptVi)} từ
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={editPromptVi}
                    onChange={(e) => setEditPromptVi(e.target.value)}
                    placeholder="Nhập câu tiếng Việt hoàn chỉnh..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                  />
                </div>

                {/* English Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      Nội dung câu hỏi Tiếng Anh (promptEn) *
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {countWords(editPromptEn)} từ
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={editPromptEn}
                    onChange={(e) => setEditPromptEn(e.target.value)}
                    placeholder="Enter complete English sentence..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                  />
                </div>

                {/* Terms / Vocabulary Targets */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Từ vựng mục tiêu VN (termVi)
                    </label>
                    <input
                      type="text"
                      value={editTermVi}
                      onChange={(e) => setEditTermVi(e.target.value)}
                      placeholder="VD: sở thích, thể thao..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Từ vựng mục tiêu EN (termEn)
                    </label>
                    <input
                      type="text"
                      value={editTermEn}
                      onChange={(e) => setEditTermEn(e.target.value)}
                      placeholder="e.g. leisure activities..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Spoken Scripts (Optional SSML/Audio Override) */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5" />
                    KỊCH BẢN ĐỌC CHO GOOGLE CLOUD TTS (Tùy chọn ghi đè phát âm)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">
                        Kịch bản phát âm VN (mặc định = promptVi)
                      </label>
                      <textarea
                        rows={2}
                        value={editSpokenVi}
                        onChange={(e) => setEditSpokenVi(e.target.value)}
                        placeholder="Để trống nếu đọc giống promptVi"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-slate-700 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">
                        Kịch bản phát âm EN (mặc định = promptEn)
                      </label>
                      <textarea
                        rows={2}
                        value={editSpokenEn}
                        onChange={(e) => setEditSpokenEn(e.target.value)}
                        placeholder="Để trống nếu đọc giống promptEn"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-slate-700 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  TTS Voice: <code className="font-mono text-slate-700 font-semibold">{activeLang === 'vi' ? 'vi-VN-Neural2-A' : 'en-US-Neural2-F'}</code>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="ghost text-xs"
                    onClick={() => setEditingItem(null)}
                    disabled={savingItem || regeneratingItemAudio}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveItem(false)}
                    disabled={savingItem || regeneratingItemAudio || !editPromptVi.trim() || !editPromptEn.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {savingItem && !regeneratingItemAudio ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Lưu Nội Dung
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveItem(true)}
                    disabled={savingItem || regeneratingItemAudio || !editPromptVi.trim() || !editPromptEn.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    {regeneratingItemAudio ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Lưu & Sinh Lại Audio TTS
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Xác nhận xóa gói?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn gói bài test{' '}
              <strong className="text-slate-900">
                {deletingPackage.title.replace(/ · LIVE$/i, '')}
              </strong>
              ? Toàn bộ các phiên bản, câu hỏi, và file âm thanh liên quan sẽ bị xóa sạch khỏi hệ thống.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="ghost text-xs"
                onClick={() => setDeletingPackage(null)}
                disabled={deleting}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePackage()}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors"
              >
                {deleting ? 'Đang xóa...' : 'Đồng Ý Xóa Vĩnh Viễn'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MINI-TEST VARIANT GENERATOR MODAL */}
      {miniModalSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-base font-bold text-slate-900">Tạo Biến Thể Mini-Test (21 câu)</h3>
              </div>
              <button
                type="button"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                onClick={() => setMiniModalSummary(null)}
                disabled={creatingMini}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚡ Zero-Waste Audio & Data Reuse</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Tạo bài test thu gọn 21 câu (3 câu/session × 7 sessions) từ gói gốc{' '}
                <strong>{miniModalSummary.pkg.title.replace(/\s*·\s*LIVE\s*$/i, '')}</strong>. Tự động liên kết các file audio đã lưu trong Supabase Storage, 100% sẵn sàng kiểm tra 1-1 mà không tốn chi phí gọi Google Cloud TTS.
              </p>
            </div>

            <form onSubmit={handleCreateMiniTest} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Mã gói Mini-Test (Slug)</label>
                <input
                  type="text"
                  required
                  value={miniCode}
                  onChange={(e) => setMiniCode(e.target.value)}
                  placeholder="e.g. mini-g1-56v"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Tiêu đề bài test</label>
                <input
                  type="text"
                  required
                  value={miniTitle}
                  onChange={(e) => setMiniTitle(e.target.value)}
                  placeholder="e.g. [Mini] G1-56V Focus Test"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Chiến lược lấy mẫu câu hỏi (3 câu / session)</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    miniSamplingStrategy === 'random'
                      ? 'border-amber-400 bg-amber-50/50 text-amber-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="samplingStrategy"
                      checked={miniSamplingStrategy === 'random'}
                      onChange={() => setMiniSamplingStrategy('random')}
                      className="text-amber-600"
                    />
                    <span>3 câu ngẫu nhiên</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    miniSamplingStrategy === 'first'
                      ? 'border-amber-400 bg-amber-50/50 text-amber-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="samplingStrategy"
                      checked={miniSamplingStrategy === 'first'}
                      onChange={() => setMiniSamplingStrategy('first')}
                      className="text-amber-600"
                    />
                    <span>3 câu đầu mỗi session</span>
                  </label>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={miniCopyAudio}
                    onChange={(e) => setMiniCopyAudio(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Tự động liên kết toàn bộ audio đã lưu (Zero-waste audio)</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-1 pl-5">
                  Tất cả audio câu hỏi và intro có sẵn sẽ được ánh xạ trực tiếp sang gói Mini-test. Bạn có thể thay đổi hoặc tải lên audio intro riêng sau.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="ghost text-xs"
                  onClick={() => setMiniModalSummary(null)}
                  disabled={creatingMini}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingMini || !miniCode.trim() || !miniTitle.trim()}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {creatingMini ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang tạo Mini-Test...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Tạo Mini-Test Ngay</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
