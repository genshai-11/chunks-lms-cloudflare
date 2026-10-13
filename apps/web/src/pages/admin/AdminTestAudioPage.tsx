import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Headphones,
  Play,
  RefreshCw,
  Save,
  Volume2,
  WandSparkles,
  XCircle,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import {
  getSectionSnapshot,
  listCciCategories,
  listSectionNarrationReview,
  listTestItems,
  listTestPackages,
  listTestPackageVersions,
  listTestSections,
  setNarrationReviewStatus,
  updateDraftTestItem,
  updateDraftTestSection,
  type NarrationReviewRecord,
} from '../../lib/test-packages'
import {
  approveGeneratedAsset,
  generateNarration,
  getLiveTestGenerationCapabilities,
  getNarrationPlaybackUrl,
  listTtsModels,
  uploadNarrationAudio,
} from '../../modules/catalog/live-test-generation'
import {
  audioReadiness,
  audioTargetStatus,
  buildIntroSpokenScript,
  latestNarrationByTarget,
  resolveItemSpokenScript,
  narrationSourceHash,
  resolveNarrationRecord,
  type AudioLanguage,
  type AudioTargetStatus,
} from '../../modules/catalog/spoken-scripts'
import type {
  CciCategory,
  SectionMeasurementSnapshot,
  TestItem,
  TestPackageVersion,
  TestSection,
} from '../../modules/catalog/test-package-catalog'

type Scope = { packageTitle: string; version: TestPackageVersion }
type PreparedRow = {
  key: string
  label: string
  spokenScript: string
  target: 'package_start' | 'package_end' | 'section_intro' | 'test_item'
  sectionId?: string
  item?: TestItem
  record?: NarrationReviewRecord
  status: AudioTargetStatus
  bundleStatus: AudioTargetStatus
}

export function AdminTestAudioPage() {
  const [params, setParams] = useSearchParams()
  const [scopes, setScopes] = useState<Scope[]>([])
  const [scopesLoaded, setScopesLoaded] = useState(false)
  const [versionId, setVersionId] = useState(params.get('version') ?? '')
  const [sections, setSections] = useState<TestSection[]>([])
  const [sectionId, setSectionId] = useState(params.get('section') ?? '')
  const [language, setLanguage] = useState<AudioLanguage>(
    params.get('language') === 'en' ? 'en' : 'vi',
  )
  const [voiceId, setVoiceId] = useState(params.get('voice') ?? '')
  const [ttsModels, setTtsModels] = useState<
    Array<{ id: string; provider: string; label: string }>
  >([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [items, setItems] = useState<TestItem[]>([])
  const [snapshot, setSnapshot] = useState<SectionMeasurementSnapshot | null>(null)
  const [cciCategory, setCciCategory] = useState<CciCategory | null>(null)
  const [packageStartDraft, setPackageStartDraft] = useState('')
  const [packageEndDraft, setPackageEndDraft] = useState('')
  const [introDraft, setIntroDraft] = useState('')
  const [savedIntro, setSavedIntro] = useState('')
  const [scriptDrafts, setScriptDrafts] = useState<Record<string, string>>({})
  const [savedScripts, setSavedScripts] = useState<Record<string, string>>({})
  const [records, setRecords] = useState<NarrationReviewRecord[]>([])
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({})
  const [edgeReady, setEdgeReady] = useState<boolean | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedScope = scopes.find((scope) => scope.version.id === versionId) ?? null
  const selectedSection = sections.find((section) => section.id === sectionId) ?? null

  useEffect(() => {
    void getLiveTestGenerationCapabilities()
      .then((capabilities) =>
        setEdgeReady(
          capabilities.version >= 4 &&
            capabilities.exactSpokenScripts &&
            capabilities.signedNarrationPlayback &&
            capabilities.ttsModelDiscovery,
        ),
      )
      .catch(() => setEdgeReady(false))
  }, [])

  useEffect(() => {
    if (!edgeReady) return
    setModelsLoading(true)
    void listTtsModels(language)
      .then((result) => {
        setTtsModels(result.models)
        setVoiceId((current) => {
          if (result.models.some((model) => model.id === current)) return current
          const languageNeedle = language === 'vi' ? 'vi-' : 'en-'
          return (
            result.models.find((model) => model.id.toLowerCase().includes(languageNeedle))?.id ??
            result.models.find((model) => model.id.toLowerCase().includes('multilingual'))?.id ??
            result.models[0]?.id ??
            ''
          )
        })
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'TTS model discovery failed'),
      )
      .finally(() => setModelsLoading(false))
  }, [edgeReady, language])

  useEffect(() => {
    setSelectedKeys([])
  }, [language, sectionId, voiceId])

  useEffect(() => {
    void (async () => {
      const packages = await listTestPackages()
      if (!packages.ok) return setError(packages.error)
      const next: Scope[] = []
      for (const pkg of packages.data) {
        const versions = await listTestPackageVersions(pkg.id)
        if (!versions.ok) return setError(versions.error)
        for (const version of versions.data.filter((candidate) => candidate.status !== 'archived'))
          next.push({ packageTitle: pkg.title, version })
      }
      setScopes(next)
      setScopesLoaded(true)
      setVersionId((current) =>
        next.some((scope) => scope.version.id === current) ? current : (next[0]?.version.id ?? ''),
      )
    })()
  }, [])

  useEffect(() => {
    if (!versionId) return
    void listTestSections(versionId).then((result) => {
      if (!result.ok) return setError(result.error)
      setSections(result.data)
      setSectionId((current) =>
        result.data.some((section) => section.id === current)
          ? current
          : (result.data[0]?.id ?? ''),
      )
    })
  }, [versionId])

  const loadSection = useCallback(async () => {
    if (!sectionId || !selectedSection) return
    setError(null)
    const [itemResult, snapshotResult] = await Promise.all([
      listTestItems(sectionId),
      getSectionSnapshot(sectionId),
    ])
    if (!itemResult.ok) return setError(itemResult.error)
    if (!snapshotResult.ok) return setError(snapshotResult.error)
    setItems(itemResult.data)
    setSnapshot(snapshotResult.data)
    let category: CciCategory | null = null
    if (snapshotResult.data) {
      const categoryResult = await listCciCategories(snapshotResult.data.cciProfileId)
      if (categoryResult.ok)
        category =
          categoryResult.data.find(
            (candidate) => candidate.id === snapshotResult.data?.cciCategoryId,
          ) ?? null
    }
    setCciCategory(category)
    const packageTitle = selectedScope?.packageTitle ?? 'Live Test'
    setPackageStartDraft(language === 'vi'
      ? `Bắt đầu bài kiểm tra ${packageTitle}. Hãy lắng nghe và trả lời từng câu.`
      : `Start the ${packageTitle} test. Listen carefully and answer each item.`)
    setPackageEndDraft(language === 'vi'
      ? `Kết thúc bài kiểm tra ${packageTitle}. Cảm ơn em đã hoàn thành phần kiểm tra.`
      : `End of the ${packageTitle} test. Thank you for completing the test.`)
    const persisted =
      (language === 'vi' ? selectedSection.introTextVi : selectedSection.introTextEn) ?? ''
    const suggested = snapshotResult.data
      ? buildIntroSpokenScript({
          sectionOrder: selectedSection.sectionOrder,
          cvr: snapshotResult.data.targetCvrOhm,
          cciAmpe: snapshotResult.data.cciValue,
          cciName: snapshotResult.data.cciCategoryLabel,
          cciDescription: category?.description,
          language,
        })
      : persisted
    setSavedIntro(persisted)
    setIntroDraft(persisted === suggested ? persisted : suggested)
    const nextScripts = Object.fromEntries(
      itemResult.data.map((item) => {
        const prompt = (language === 'vi' ? item.promptVi : item.promptEn) ?? ''
        const override = language === 'vi' ? item.spokenScriptVi : item.spokenScriptEn
        return [
          item.id,
          resolveItemSpokenScript({
            itemOrder: item.itemOrder,
            prompt,
            language,
            override,
          }),
        ]
      }),
    )
    setSavedScripts(nextScripts)
    setScriptDrafts(nextScripts)
  }, [language, sectionId, selectedScope?.packageTitle, selectedSection])
  useEffect(() => {
    void loadSection()
  }, [loadSection])

  const loadReview = useCallback(async () => {
    if (!selectedScope || !selectedSection) return
    const review = await listSectionNarrationReview({
      packageVersionId: selectedScope.version.id,
      sectionId: selectedSection.id,
      itemIds: items.map((item) => item.id),
      language,
      voiceId,
    })
    if (!review.ok) return setError(review.error)
    setRecords(review.data)
  }, [items, language, selectedScope, selectedSection, voiceId])
  useEffect(() => {
    void loadReview()
  }, [loadReview])

  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {}
      if (packageStartDraft) next['package:start'] = await narrationSourceHash(packageStartDraft, language, voiceId)
      if (packageEndDraft) next['package:end'] = await narrationSourceHash(packageEndDraft, language, voiceId)
      if (selectedSection && introDraft)
        next[`section:${selectedSection.id}`] = await narrationSourceHash(
          introDraft,
          language,
          voiceId,
        )
      for (const item of items) {
        const script = scriptDrafts[item.id] ?? ''
        if (script) next[`item:${item.id}`] = await narrationSourceHash(script, language, voiceId)
      }
      setHashes(next)
    })()
  }, [introDraft, items, language, packageEndDraft, packageStartDraft, scriptDrafts, selectedSection, voiceId])

  useEffect(() => {
    setParams(
      { version: versionId, section: sectionId, language, voice: voiceId },
      { replace: true },
    )
  }, [language, sectionId, setParams, versionId, voiceId])

  const rows = useMemo<PreparedRow[]>(() => {
    if (!selectedSection) return []
    const newest = latestNarrationByTarget(records)
    const startKey = 'package:start'
    const endKey = 'package:end'
    const startRecord = newest.get(startKey)
    const endRecord = newest.get(endKey)
    const startBundleRecord = resolveNarrationRecord(records, startKey, hashes[startKey])
    const endBundleRecord = resolveNarrationRecord(records, endKey, hashes[endKey])
    const introKey = `section:${selectedSection.id}`
    const introRecord = newest.get(introKey)
    const introBundleRecord = resolveNarrationRecord(records, introKey, hashes[introKey])
    const result: PreparedRow[] = [
      {
        key: startKey,
        label: 'Test Start',
        spokenScript: packageStartDraft,
        target: 'package_start',
        record: startRecord,
        status: audioTargetStatus(startRecord, hashes[startKey]),
        bundleStatus: audioTargetStatus(startBundleRecord, hashes[startKey]),
      },
      {
        key: endKey,
        label: 'Test End',
        spokenScript: packageEndDraft,
        target: 'package_end',
        record: endRecord,
        status: audioTargetStatus(endRecord, hashes[endKey]),
        bundleStatus: audioTargetStatus(endBundleRecord, hashes[endKey]),
      },
      {
        key: introKey,
        label: 'Session Intro',
        spokenScript: introDraft,
        target: 'section_intro',
        sectionId: selectedSection.id,
        record: introRecord,
        status: audioTargetStatus(introRecord, hashes[introKey]),
        bundleStatus: audioTargetStatus(introBundleRecord, hashes[introKey]),
      },
    ]
    for (const item of items) {
      const key = `item:${item.id}`
      const script = scriptDrafts[item.id] ?? ''
      const itemRecord = newest.get(key)
      const itemBundleRecord = resolveNarrationRecord(records, key, hashes[key])
      result.push({
        key,
        label: String(item.itemOrder),
        target: 'test_item',
        item,
        spokenScript: script,
        record: itemRecord,
        status: audioTargetStatus(itemRecord, hashes[key]),
        bundleStatus: audioTargetStatus(itemBundleRecord, hashes[key]),
      })
    }
    return result
  }, [hashes, introDraft, items, packageEndDraft, packageStartDraft, scriptDrafts, records, selectedSection])
  const bundleRows = rows.filter((row) => row.target === 'section_intro' || row.target === 'test_item')
  const readiness = audioReadiness(bundleRows.map((row) => row.bundleStatus))
  const generationTargets = rows.filter((row) =>
    ['missing', 'stale', 'failed', 'rejected'].includes(row.bundleStatus),
  )
  const dirty =
    introDraft !== savedIntro ||
    items.some((item) => (scriptDrafts[item.id] ?? '') !== (savedScripts[item.id] ?? ''))
  const invalid =
    !packageStartDraft.trim() ||
    !packageEndDraft.trim() ||
    !introDraft.trim() ||
    items.length === 0 ||
    items.some((item) => !(scriptDrafts[item.id] ?? '').trim())

  async function saveScripts() {
    if (!selectedScope || !selectedSection) return
    setBusyKey('save')
    setError(null)
    const sectionResult = await updateDraftTestSection({
      sectionId: selectedSection.id,
      packageVersionId: selectedScope.version.id,
      title: selectedSection.title,
      sectionOrder: selectedSection.sectionOrder,
      ...(language === 'vi' ? { introTextVi: introDraft } : { introTextEn: introDraft }),
    })
    if (!sectionResult.ok) {
      setBusyKey(null)
      return setError(sectionResult.error)
    }
    for (const item of items) {
      const nextScript = scriptDrafts[item.id] ?? ''
      if (nextScript === (savedScripts[item.id] ?? '')) continue
      const result = await updateDraftTestItem({
        itemId: item.id,
        packageVersionId: selectedScope.version.id,
        promptVi: item.promptVi,
        promptEn: item.promptEn,
        tc: item.tc,
        lc: item.lc,
        tl: item.tl,
        ...(language === 'vi' ? { spokenScriptVi: nextScript } : { spokenScriptEn: nextScript }),
      })
      if (!result.ok) {
        setBusyKey(null)
        return setError(result.error)
      }
    }
    setSavedIntro(introDraft)
    setSavedScripts(scriptDrafts)
    setSections((current) =>
      current.map((section) =>
        section.id === selectedSection.id
          ? {
              ...section,
              ...(language === 'vi' ? { introTextVi: introDraft } : { introTextEn: introDraft }),
            }
          : section,
      ),
    )
    setItems((current) =>
      current.map((item) => ({
        ...item,
        ...(language === 'vi'
          ? { spokenScriptVi: scriptDrafts[item.id] ?? item.spokenScriptVi }
          : { spokenScriptEn: scriptDrafts[item.id] ?? item.spokenScriptEn }),
      })),
    )
    setBusyKey(null)
    setMessage('Scripts saved. Mismatched prior audio is now stale.')
    await loadReview()
  }

  async function generateRows(targets: PreparedRow[]) {
    if (!edgeReady) {
      setError(
        'Paid generation is disabled until live-test-generation v4 is deployed and verified.',
      )
      return
    }
    if (!selectedScope || invalid || !voiceId || targets.length === 0) return
    setBatchProgress({ done: 0, total: targets.length })
    setError(null)
    let completed = 0
    try {
      for (const row of targets) {
        setBusyKey(row.key)

        // Auto-save if dirty
        if (row.target === 'section_intro' && selectedScope.version.status === 'draft') {
          if (introDraft !== savedIntro && selectedSection) {
            const sectionResult = await updateDraftTestSection({
              sectionId: selectedSection.id,
              packageVersionId: selectedScope.version.id,
              title: selectedSection.title,
              sectionOrder: selectedSection.sectionOrder,
              ...(language === 'vi' ? { introTextVi: introDraft } : { introTextEn: introDraft }),
            })
            if (!sectionResult.ok) throw new Error(sectionResult.error)
            setSavedIntro(introDraft)
            setSections((current) =>
              current.map((section) =>
                section.id === selectedSection.id
                  ? {
                      ...section,
                      ...(language === 'vi' ? { introTextVi: introDraft } : { introTextEn: introDraft }),
                    }
                  : section,
              ),
            )
          }
        } else if (row.target === 'test_item' && row.item && selectedScope.version.status === 'draft') {
          const nextScript = scriptDrafts[row.item.id] ?? ''
          if (nextScript !== (savedScripts[row.item.id] ?? '')) {
            const result = await updateDraftTestItem({
              itemId: row.item.id,
              packageVersionId: selectedScope.version.id,
              promptVi: row.item.promptVi,
              promptEn: row.item.promptEn,
              tc: row.item.tc,
              lc: row.item.lc,
              tl: row.item.tl,
              ...(language === 'vi' ? { spokenScriptVi: nextScript } : { spokenScriptEn: nextScript }),
            })
            if (!result.ok) throw new Error(result.error)
            setSavedScripts((current) => ({
              ...current,
              [row.item!.id]: nextScript,
            }))
            setItems((current) =>
              current.map((item) =>
                item.id === row.item!.id
                  ? {
                      ...item,
                      ...(language === 'vi'
                        ? { spokenScriptVi: nextScript }
                        : { spokenScriptEn: nextScript }),
                    }
                  : item,
              ),
            )
          }
        }

        const receipt = await generateNarration({
          packageVersionId: selectedScope.version.id,
          target: row.target,
          testSectionId: row.target === 'section_intro' ? row.sectionId : undefined,
          testItemId: row.target === 'test_item' ? row.item?.id : undefined,
          textOverride: row.target === 'package_start' || row.target === 'package_end' ? row.spokenScript : undefined,
          language,
          voiceId,
        })
        if (receipt.status === 'failed') {
          throw new Error(receipt.errorMessage ?? `Generation failed for ${row.label}`)
        }
        completed += 1
        setBatchProgress({ done: completed, total: targets.length })
      }
      setMessage(
        `Generated ${completed} audio asset${completed === 1 ? '' : 's'} with ${voiceId}. Listen before approval.`,
      )
      setSelectedKeys([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation failed')
    } finally {
      setBusyKey(null)
      setBatchProgress(null)
      await loadReview()
    }
  }

  const generateRow = (row: PreparedRow) => generateRows([row])
  const generateMissing = () => generateRows(generationTargets)
  const generateSelected = () => generateRows(rows.filter((row) => selectedKeys.includes(row.key)))

  async function approveRows(targets: PreparedRow[]) {
    setBusyKey('approve_batch')
    setError(null)
    let completed = 0
    try {
      for (const row of targets) {
        const jobId = row.record?.variant.generationJobId
        if (!jobId) continue
        setBusyKey(`approve:${row.key}`)
        await approveGeneratedAsset(jobId, 'Listened and approved in Audio Preparation')
        completed += 1
      }
      setMessage(`Approved ${completed} audio asset${completed === 1 ? '' : 's'}.`)
      setSelectedKeys([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval failed')
    } finally {
      setBusyKey(null)
      await loadReview()
    }
  }
  const approveSelected = () => approveRows(rows.filter((row) => selectedKeys.includes(row.key) && row.record && row.status !== 'stale' && row.record.variant.approvalStatus !== 'approved'))

  async function upload(row: PreparedRow, file: File | null | undefined) {
    if (!file || !selectedScope) return
    if (row.target !== 'package_start' && row.target !== 'package_end') return
    setBusyKey(`upload:${row.key}`)
    setError(null)
    try {
      await uploadNarrationAudio({
        packageVersionId: selectedScope.version.id,
        target: row.target,
        language,
        voiceId,
        sourceTextHash: hashes[row.key] ?? await narrationSourceHash(row.spokenScript, language, voiceId),
        file,
      })
      setMessage(`Uploaded and approved ${row.label} audio.`)
      await loadReview()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function play(row: PreparedRow) {
    if (!row.record) return
    setBusyKey(`play:${row.key}`)
    try {
      const playback = await getNarrationPlaybackUrl(row.record.variant.id)
      setPlaybackUrls((current) => ({ ...current, [row.key]: playback.signedUrl }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Playback failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function approve(row: PreparedRow) {
    const jobId = row.record?.variant.generationJobId
    if (!jobId) return
    setBusyKey(`approve:${row.key}`)
    try {
      await approveGeneratedAsset(jobId, 'Listened and approved in Audio Preparation')
      await loadReview()
      setMessage(`Approved ${row.label}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function reject(row: PreparedRow) {
    if (!row.record) return
    const result = await setNarrationReviewStatus(row.record.variant.id, 'rejected')
    if (!result.ok) return setError(result.error)
    await loadReview()
    setMessage(`Rejected ${row.label}; regenerate when ready.`)
  }

  if (scopesLoaded && !selectedScope && scopes.length === 0) {
    return (
      <EmptyState
        icon={Volume2}
        title="No draft package available"
        description="Create or supersede a draft package before preparing audio."
      />
    )
  }

  return (
    <>
      <PageHeader
        icon={Volume2}
        kicker="Admin · Resources"
        title="Test Audio Preparation"
        subtitle="Prepare exact scripts → save → generate → listen → approve → 11/11 Ready for Test."
        actions={
          <Link className="btn ghost" to="/admin/resources">
            Back to Resources
          </Link>
        }
      />
      <Flash message={message} error={error} />

      <Panel
        icon={Headphones}
        title="1. Scope and readiness"
        description="Each Session has one intro and ten item assets per language/voice."
        collapsible={false}
      >
        <div className="audio-prep-scope">
          <label className="field">
            Package
            <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
              {scopes.map((scope) => (
                <option key={scope.version.id} value={scope.version.id}>
                  {scope.packageTitle} · {scope.version.versionLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Session
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  Session {section.sectionOrder} · {section.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as AudioLanguage)}
            >
              <option value="vi">Vietnamese Complete</option>
              <option value="en">English Complete</option>
            </select>
          </label>
          <label className="field">
            9Router TTS model / voice
            <input
              list="tts-model-options"
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              placeholder={modelsLoading ? 'Loading 9Router models…' : 'Select or enter model ID'}
            />
            <datalist id="tts-model-options">
              {ttsModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
            <span className="meta">
              {ttsModels.length} live model/voice options · model ID is part of readiness
            </span>
          </label>
        </div>
        <div className="audio-prep-metrics">
          <span className="badge metric-cvr">CVR {snapshot?.targetCvrOhm == null ? '—' : `${snapshot.targetCvrOhm} Ω`}</span>
          <span className="badge metric-cci">CCI {snapshot?.cciValue == null ? '—' : `${snapshot.cciValue}A`}</span>
          <span className="badge">{snapshot?.cciCategoryLabel ?? 'CCI unmapped'}</span>
          <span className="badge metric-cpd">
            CPD {snapshot ? `${Math.round(snapshot.targetCvrOhm * snapshot.cciValue * 100) / 100}V` : '—'}
          </span>
          <span className={`badge ${readiness.ready ? 'success' : 'experimental'}`}>
            {readiness.approved}/11 approved
          </span>
          {readiness.stale ? (
            <span className="badge experimental">{readiness.stale} stale</span>
          ) : null}
        </div>
      </Panel>

      <Panel
        icon={WandSparkles}
        title="2. Prepare reading scripts"
        description="Generation stays disabled until the exact persisted scripts are saved. Paid TTS runs only after an explicit Generate action."
        collapsible={false}
        actions={
          <div className="btn-row">
            <button className="ghost" onClick={() => void loadSection()}>
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
            <button
              className="primary"
              disabled={selectedScope?.version.status !== 'draft' || !dirty || invalid || busyKey === 'save'}
              onClick={() => void saveScripts()}
            >
              <Save className="h-4 w-4" />
              Save scripts
            </button>
          </div>
        }
      >
        {edgeReady === false ? (
          <p className="banner-inline warning">
            <AlertTriangle className="h-4 w-4" />
            Script preparation is available, but model discovery, Generate, and Play are disabled
            until the separately gated live-test-generation v4 deployment.
          </p>
        ) : null}
        {dirty ? (
          <p className="banner-inline warning">
            <AlertTriangle className="h-4 w-4" />
            Unsaved spoken-script changes. Save before generating audio.
          </p>
        ) : null}
        <div className="audio-script-intro">
          <label className="field">
            <strong>Intro · Session {selectedSection?.sectionOrder}</strong>
            <textarea
              rows={3}
              value={introDraft}
              onChange={(event) => setIntroDraft(event.target.value)}
            />
          </label>
          <div className="meta">
            Must include Session number, CVR, CCI Ampe, CCI Name, optional CCI Description, and{' '}
            {language === 'vi' ? 'Bắt đầu' : 'Start'}.{' '}
            {cciCategory?.description ? `Description: ${cciCategory.description}` : ''}
          </div>
        </div>
        <div className="audio-batch-toolbar">
          <div className="btn-row">
            <button
              className="ghost"
              onClick={() => setSelectedKeys(generationTargets.map((row) => row.key))}
            >
              Select missing / stale
            </button>
            <button className="ghost" onClick={() => setSelectedKeys(rows.map((row) => row.key))}>
              Select all 11
            </button>
            <button
              className="ghost"
              onClick={() => setSelectedKeys([])}
              disabled={selectedKeys.length === 0}
            >
              Clear
            </button>
          </div>
          <div className="btn-row">
            <button
              className="primary"
              disabled={
                !edgeReady ||
                invalid ||
                !voiceId ||
                selectedKeys.length === 0 ||
                batchProgress !== null
              }
              onClick={() => void generateSelected()}
            >
              <WandSparkles className="h-4 w-4" />
              Generate selected ({selectedKeys.length})
            </button>
            <button
              className="primary"
              disabled={
                selectedKeys.length === 0 ||
                !rows.some(
                  (row) =>
                    selectedKeys.includes(row.key) &&
                    row.record &&
                    row.status !== 'stale' &&
                    row.record.variant.approvalStatus !== 'approved'
                ) ||
                busyKey !== null
              }
              onClick={() => void approveSelected()}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve selected
            </button>
          </div>
        </div>
        <div className="table-wrap audio-prep-table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all audio scripts"
                    checked={rows.length > 0 && selectedKeys.length === rows.length}
                    onChange={(event) =>
                      setSelectedKeys(event.target.checked ? rows.map((row) => row.key) : [])
                    }
                  />
                </th>
                <th>#</th>
                <th>Exact spoken script</th>
                <th>Status</th>
                <th>Audio review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.label}`}
                      checked={selectedKeys.includes(row.key)}
                      onChange={(event) =>
                        setSelectedKeys((current) =>
                          event.target.checked
                            ? [...new Set([...current, row.key])]
                            : current.filter((key) => key !== row.key),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>
                    {row.target === 'package_start' ? (
                      <textarea
                        rows={2}
                        aria-label="Exact spoken script Test Start"
                        value={packageStartDraft}
                        onChange={(event) => setPackageStartDraft(event.target.value)}
                      />
                    ) : row.target === 'package_end' ? (
                      <textarea
                        rows={2}
                        aria-label="Exact spoken script Test End"
                        value={packageEndDraft}
                        onChange={(event) => setPackageEndDraft(event.target.value)}
                      />
                    ) : row.target === 'section_intro' ? (
                      <textarea
                        rows={3}
                        aria-label="Exact spoken script Intro"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                      />
                    ) : (
                      <>
                        <textarea
                          rows={2}
                          aria-label={`Exact spoken script ${row.label}`}
                          value={scriptDrafts[row.item!.id] ?? ''}
                          onChange={(event) =>
                            setScriptDrafts((current) => ({
                              ...current,
                              [row.item!.id]: event.target.value,
                            }))
                          }
                        />
                        <div className="meta">
                          Source sentence:{' '}
                          {language === 'vi' ? row.item?.promptVi : row.item?.promptEn}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${row.status === 'approved' ? 'success' : row.status === 'stale' || row.status === 'failed' ? 'experimental' : ''}`}
                    >
                      {row.status}
                    </span>
                    {row.bundleStatus === 'approved' && row.status !== 'approved' ? (
                      <span className="badge success">bundle ready</span>
                    ) : null}
                    {row.record?.job?.errorMessage ? (
                      <div className="meta error-text">{row.record.job.errorMessage}</div>
                    ) : null}
                  </td>
                  <td>
                    <div className="audio-row-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 'auto' }}>
                      <button
                        className="ghost compact-action-btn"
                        style={{ padding: '0.25rem', height: '1.75rem', width: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={!edgeReady || invalid || busyKey === row.key}
                        onClick={() => void generateRow(row)}
                        title={row.record ? 'Regenerate audio' : 'Generate audio'}
                      >
                        <WandSparkles className="h-3.5 w-3.5" />
                      </button>
                      {(row.target === 'package_start' || row.target === 'package_end') ? (
                        <label
                          className="ghost compact-action-btn"
                          style={{ padding: '0.25rem', height: '1.75rem', width: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          title="Upload audio file"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <input
                            hidden
                            type="file"
                            accept="audio/*"
                            disabled={busyKey === `upload:${row.key}`}
                            onChange={(event) => void upload(row, event.target.files?.[0])}
                          />
                        </label>
                      ) : null}
                      <button
                        className="ghost compact-action-btn"
                        style={{ padding: '0.25rem', height: '1.75rem', width: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={!edgeReady || !row.record?.audio || busyKey === `play:${row.key}`}
                        onClick={() => void play(row)}
                        title="Play audio"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="ghost compact-action-btn"
                        style={{ padding: '0.25rem', height: '1.75rem', width: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={
                          !row.record ||
                          row.status === 'stale' ||
                          row.record?.variant.approvalStatus === 'approved' ||
                          busyKey === `approve:${row.key}`
                        }
                        onClick={() => void approve(row)}
                        title="Approve audio"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="ghost compact-action-btn"
                        style={{ padding: '0.25rem', height: '1.75rem', width: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={!row.record}
                        onClick={() => void reject(row)}
                        title="Reject audio"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {playbackUrls[row.key] ? (
                      <audio
                        className="audio-review-player"
                        controls
                        autoPlay
                        src={playbackUrls[row.key]}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        icon={CheckCircle2}
        title="3. Bundle gate"
        description="The Teacher runner unlocks when the current language has one approved session intro and every current item asset. Test Start/End audio is optional and plays when available."
        collapsible={false}
      >
        <div className="audio-bundle-gate">
          <div>
            <strong>
              {readiness.ready ? 'Ready for Test' : `${readiness.approved}/${bundleRows.length} approved`}
            </strong>
            <div className="meta">
              {language.toUpperCase()} · {voiceId} · {readiness.stale} stale · {readiness.failed}{' '}
              failed
            </div>
          </div>
          <button
            className="primary"
            disabled={
              !edgeReady ||
              invalid ||
              generationTargets.length === 0 ||
              batchProgress !== null
            }
            onClick={() => void generateMissing()}
          >
            <WandSparkles className="h-4 w-4" />
            {batchProgress
              ? `Generating ${batchProgress.done}/${batchProgress.total}`
              : 'Generate missing / stale'}
          </button>
        </div>
      </Panel>
    </>
  )
}
