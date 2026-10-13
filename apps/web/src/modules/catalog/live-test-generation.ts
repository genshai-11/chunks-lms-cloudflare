import { cacheKey, cachedQuery, clearRequestCache } from '../../lib/request-cache'
import { getSupabase } from '../../lib/supabase'

export type GenerationReceipt = {
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  narrationVariantId?: string
  audioPath?: string
  errorMessage?: string
}

async function readFunctionError(error: unknown, data: any): Promise<string | null> {
  const dataMessage = data?.error?.message ?? data?.error?.code ?? data?.message
  if (dataMessage) return String(dataMessage)

  const context = (error as { context?: unknown })?.context
  if (context && typeof Response !== 'undefined' && context instanceof Response) {
    const response = context.clone()
    const text = await response.text().catch(() => '')
    if (!text) return null
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; code?: string } | string
        message?: string
      }
      if (typeof parsed.error === 'string') return parsed.error
      return parsed.error?.message ?? parsed.error?.code ?? parsed.message ?? text
    } catch {
      return text
    }
  }
  return null
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const sb = getSupabase() as any
  if (!sb) throw new Error('Supabase is not configured')
  const { data, error } = await sb.functions.invoke('live-test-generation', { body })
  if (error) {
    const functionMessage = await readFunctionError(error, data)
    throw new Error(functionMessage ? `${error.message}: ${functionMessage}` : error.message)
  }
  if (data?.error) throw new Error(data.error.message ?? data.error.code ?? 'Generation failed')
  return data as T
}

export function getLiveTestGenerationCapabilities(): Promise<{
  version: number
  exactSpokenScripts: boolean
  signedNarrationPlayback: boolean
  ttsModelDiscovery: boolean
  selectedBatchGeneration: boolean
  paidGenerationRequiresExplicitAction: boolean
}> {
  return invoke({ action: 'getCapabilities' })
}

export function listTtsModels(language: 'vi' | 'en'): Promise<{
  language: 'vi' | 'en'
  models: Array<{ id: string; provider: string; label: string }>
}> {
  return invoke({ action: 'listTtsModels', language })
}

export type NarrationGenerationTarget =
  'package_start' | 'part_intro' | 'package_end' | 'section_intro' | 'test_item'

export function generateNarration(input: {
  packageVersionId: string
  target: NarrationGenerationTarget
  part?: number
  testSectionId?: string
  testItemId?: string
  textOverride?: string
  language: 'vi' | 'en'
  voiceId: string
}): Promise<GenerationReceipt> {
  return invoke({ action: 'generateNarration', ...input })
}

export function approveGeneratedAsset(
  generationJobId: string,
  notes = '',
): Promise<{ narrationVariantId: string; approved: boolean }> {
  return invoke({ action: 'approveGeneratedAsset', generationJobId, notes })
}

export async function synthesizeSpeech(input: {
  text: string
  language: 'vi' | 'en'
  voiceId: string
}): Promise<{ audioContent: string; mimeType: string }> {
  try {
    const res = await invoke<{ audioContent: string; mimeType?: string }>({
      action: 'synthesizeSpeech',
      text: input.text,
      language: input.language,
      voiceId: input.voiceId,
    })
    if (res?.audioContent) {
      return { audioContent: res.audioContent, mimeType: res.mimeType ?? 'audio/mpeg' }
    }
  } catch (edgeErr) {
    const apiKey =
      (import.meta as any).env?.VITE_GOOGLE_TTS_KEY ||
      (import.meta as any).env?.VITE_GOOGLE_CLOUD_TTS_API_KEY

    if (apiKey) {
      const cleanVoice = input.voiceId.replace(/^(google|google-cloud)\//, '')
      const languageCode = input.language === 'vi' ? 'vi-VN' : 'en-US'
      const isSsml = input.text.trim().startsWith('<speak>') || input.text.includes('<break')
      let targetVoice = cleanVoice
      if (isSsml && targetVoice.includes('Journey')) {
        targetVoice = input.language === 'vi' ? 'vi-VN-Neural2-A' : 'en-US-Neural2-F'
      }
      const requestInput = isSsml
        ? { ssml: input.text.trim().startsWith('<speak>') ? input.text : `<speak>${input.text}</speak>` }
        : { text: input.text }

      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: requestInput,
            voice: { languageCode, name: targetVoice },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data?.audioContent) {
            return { audioContent: data.audioContent, mimeType: 'audio/mpeg' }
          }
        }
      } catch {
        // Continue to throwing edgeErr
      }
    }

    throw new Error(
      `TTS generation failed: ${edgeErr instanceof Error ? edgeErr.message : String(edgeErr)}`,
    )
  }

  throw new Error('TTS response did not include audioContent')
}

export async function playGoogleCloudTts(
  text: string,
  language: 'vi' | 'en',
  voiceId: string,
): Promise<void> {
  const data = await synthesizeSpeech({ text, language, voiceId })
  if (!data?.audioContent) {
    throw new Error('TTS response did not return audioContent')
  }
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`)
    audio.onended = () => resolve()
    audio.onerror = (e) => reject(new Error('Audio playback failed: ' + String(e)))
    audio.play().catch(reject)
  })
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function uploadNarrationAudio(input: {
  packageVersionId: string
  target: NarrationGenerationTarget
  part?: number
  testSectionId?: string
  testItemId?: string
  language: 'vi' | 'en'
  voiceId: string
  sourceTextHash: string
  file: File
}): Promise<{ narrationVariantId: string; audioAssetId: string }> {
  const sb = getSupabase() as any
  if (!sb) throw new Error('Supabase is not configured')
  const { data: version, error: versionError } = await sb
    .from('test_package_versions')
    .select('id, test_packages(organization_id)')
    .eq('id', input.packageVersionId)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  const organizationId = version?.test_packages?.organization_id
  if (!organizationId) throw new Error('Package organization not found')
  const bytes = await input.file.arrayBuffer()
  const sha256 = `sha256:${await sha256Hex(bytes)}`
  const ext = input.file.name.split('.').pop()?.toLowerCase() || 'mp3'
  const targetTag = input.testItemId
    ? `item-${input.testItemId}`
    : input.testSectionId
      ? `section-${input.testSectionId}`
      : input.part
        ? `part-${input.part}`
        : input.target
  const storagePath = `narrations/${input.packageVersionId}/uploads/${targetTag}-${input.language}-${Date.now()}.${ext}`
  const { error: uploadError } = await sb.storage
    .from('narration-audio')
    .upload(storagePath, input.file, {
      contentType: input.file.type || 'audio/mpeg',
      cacheControl: '31536000',
      upsert: false,
    })
  if (uploadError) throw new Error(uploadError.message)
  const { data: audio, error: audioError } = await sb
    .from('audio_assets')
    .insert({
      organization_id: organizationId,
      storage_bucket: 'narration-audio',
      storage_path: storagePath,
      mime_type: input.file.type || 'audio/mpeg',
      sha256,
      visibility: 'private',
      source_kind: 'custom_upload',
      bytes: input.file.size,
      metadata: {
        uploadedFor: input.target,
        fileName: input.file.name,
        testSectionId: input.testSectionId,
        testItemId: input.testItemId,
        part: input.part,
      },
    })
    .select('id')
    .single()
  if (audioError) throw new Error(audioError.message)
  if (!audio) throw new Error('Audio asset insertion failed')
  const targetSectionId = input.target === 'section_intro' ? input.testSectionId ?? null : null
  const targetItemId = input.target === 'test_item' ? input.testItemId ?? null : null

  const { data: variant, error: variantError } = await sb
    .from('narration_variants')
    .insert({
      package_version_id: input.packageVersionId,
      narration_target: input.target,
      test_section_id: targetSectionId,
      test_item_id: targetItemId,
      language: input.language,
      voice_id: input.voiceId,
      voice_label: input.voiceId,
      source_text_hash: input.sourceTextHash,
      audio_asset_id: audio.id,
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      provider_metadata: {
        uploaded: true,
        fileName: input.file.name,
        ...(input.part != null ? { part: input.part } : {}),
      },
    })
    .select('id')
    .single()

  if (variantError) throw new Error(variantError.message)
  return { narrationVariantId: variant.id, audioAssetId: audio.id }
}


export function getNarrationPlaybackUrl(narrationVariantId: string): Promise<{
  narrationVariantId: string
  signedUrl: string
  expiresIn: number
  mimeType: string
  durationMs: number | null
}> {
  return cachedQuery(
    cacheKey(['audio', 'signed-playback', narrationVariantId]),
    () => invoke({ action: 'getNarrationPlaybackUrl', narrationVariantId }),
    // Edge returns 10-minute bearer URLs. Reuse in-memory before expiry, but
    // never persist them across browser sessions or authenticated identities.
    { ttlMs: 9 * 60_000 },
  )
}

export type FirestoreLesson = {
  id: string
  lessonTitle: string
  levelCode: string
  dayNumber: number
  totalChunks: number
}

export type FirestoreChunk = {
  chunkId: string
  english: string
  vietnamese: string
  category?: string
}

export const GREEN_TEST_SESSION_LANGUAGES_7X3: Array<'vi' | 'en'> = [
  'en',
  'en',
  'en',
  'vi',
  'vi',
  'vi',
  'en',
]
export const RED_TEST_SESSION_LANGUAGES_7X3: Array<'vi' | 'en'> = [
  'vi',
  'vi',
  'vi',
  'en',
  'en',
  'en',
  'en',
]
export const RED_TEST_HINT_PROGRESSION_7X3 = [2, 3, 4, 2, 3, 4, 4]

export type CvrBreakdown = {
  tc: number // Term/Chunk Complexity (1 for Green, 2-4 hints for Red)
  lc: number // Lexical/Length Complexity (1.0 basic, 1.1-1.2 compound/eCommerce)
  tl: number // Time Latency (1.0 for continuous Green, 2.0-3.0 for Red with 650ms pauses)
  cvr: number // Cognitive Voltage Resistance in Ohms (TC * LC * TL)
  cci: number // Cognitive Current Index in Amps
  cpd: number // Cognitive Power Dissipation in Volts (CVR * CCI)
}

export function calculateCvr(tc: number, lc: number, tl: number): number {
  return Number((tc * lc * tl).toFixed(1))
}

export function calculateCpd(cvr: number, cci: number): number {
  return Number((cvr * cci).toFixed(1))
}

export function calculateCciFromCpd(targetCpd: number, cvr: number): number {
  if (cvr <= 0) return 1
  return Math.max(1, Math.round(targetCpd / cvr))
}

export type GeneratePackageFromVocabInput = {
  testType: 'green' | 'red' | 'GREEN' | 'RED'
  lessonId: string
  lessonTitle?: string
  levelCode?: string
  dayNumber?: number
  questionCount?: number
  targetQuestions?: number
  sessionCount?: number
  questionsPerSession?: number
  sessionLayout?: '7x3' | '3x7' | '6x7' | '7x7' | string
  sessionLanguages?: Array<'vi' | 'en'>
  targetVoltage?: number // e.g. 12 or 56
  targetCpd?: number
  packageCode?: string
  title?: string
  versionLabel?: string
  topic?: string
  saveDraft?: boolean
  lexicalComplexity?: number
  tc?: number
  tl?: number
  cciProgression?: number[]
}

export const CANONICAL_FIRESTORE_LESSONS: FirestoreLesson[] = [
  { id: 'lesson-a-01', lessonTitle: 'Greetings & Introductions', levelCode: 'A', dayNumber: 1, totalChunks: 110 },
  { id: 'lesson-a-02', lessonTitle: 'Daily Routines & Time Expressions', levelCode: 'A', dayNumber: 2, totalChunks: 115 },
  { id: 'lesson-a-03', lessonTitle: 'Food, Dining & Kitchen Verbs', levelCode: 'A', dayNumber: 3, totalChunks: 120 },
  { id: 'lesson-a-04', lessonTitle: 'Shopping & Basic Transactions', levelCode: 'A', dayNumber: 4, totalChunks: 105 },
  { id: 'lesson-a-05', lessonTitle: 'Travel, Wayfinding & Transport', levelCode: 'A', dayNumber: 5, totalChunks: 125 },
  { id: 'lesson-a-06', lessonTitle: 'Family, Friends & Social Bonds', levelCode: 'A', dayNumber: 6, totalChunks: 110 },
  { id: 'lesson-a-07', lessonTitle: 'Hobbies, Sports & Leisure', levelCode: 'A', dayNumber: 7, totalChunks: 115 },
  { id: 'lesson-a-08', lessonTitle: 'Review & Integration Level A', levelCode: 'A', dayNumber: 8, totalChunks: 130 },
  { id: 'lesson-b-09', lessonTitle: 'Workplace & Professional Chunks', levelCode: 'B', dayNumber: 9, totalChunks: 135 },
  { id: 'lesson-b-10', lessonTitle: 'Meetings & Collaborative Decisions', levelCode: 'B', dayNumber: 10, totalChunks: 140 },
  { id: 'lesson-b-11', lessonTitle: 'Technology, Devices & Workflows', levelCode: 'B', dayNumber: 11, totalChunks: 125 },
  { id: 'lesson-b-12', lessonTitle: 'Health, Wellness & Physical States', levelCode: 'B', dayNumber: 12, totalChunks: 130 },
  { id: 'lesson-b-13', lessonTitle: 'Current Affairs & Environmental Topics', levelCode: 'B', dayNumber: 13, totalChunks: 145 },
  { id: 'lesson-b-14', lessonTitle: 'Media, Narrative & Entertainment', levelCode: 'B', dayNumber: 14, totalChunks: 120 },
  { id: 'lesson-b-15', lessonTitle: 'Opinions, Arguments & Perspectives', levelCode: 'B', dayNumber: 15, totalChunks: 150 },
  { id: 'lesson-b-16', lessonTitle: 'Review & Synthesized Fluency B', levelCode: 'B', dayNumber: 16, totalChunks: 160 },
  { id: 'lesson-c-17', lessonTitle: 'Idiomatic Nuances & Contrast Chunks', levelCode: 'C', dayNumber: 17, totalChunks: 165 },
  { id: 'lesson-c-18', lessonTitle: 'High-Stakes Negotiation & Persuasion', levelCode: 'C', dayNumber: 18, totalChunks: 170 },
  { id: 'lesson-c-19', lessonTitle: 'Critical Thinking & Abstract Concepts', levelCode: 'C', dayNumber: 19, totalChunks: 180 },
  { id: 'lesson-c-20', lessonTitle: 'Cross-Cultural Communication & Idioms', levelCode: 'C', dayNumber: 20, totalChunks: 175 },
  { id: 'lesson-c-21', lessonTitle: 'Mastery Synthesis & Cognitive Agility', levelCode: 'C', dayNumber: 21, totalChunks: 190 },
]

export async function listFirestoreLessons(): Promise<FirestoreLesson[]> {
  try {
    const res = await invoke<FirestoreLesson[] | { lessons?: FirestoreLesson[] }>({
      action: 'listFirestoreLessons',
    })
    if (Array.isArray(res) && res.length > 0) {
      return res
    }
    if (res && 'lessons' in res && Array.isArray(res.lessons) && res.lessons.length > 0) {
      return res.lessons
    }
  } catch {
    // Edge function doesn't serve listFirestoreLessons; return canonical catalog
  }
  return CANONICAL_FIRESTORE_LESSONS
}

export async function getFirestoreLessonChunks(lessonId: string): Promise<FirestoreChunk[]> {
  try {
    const res = await invoke<FirestoreChunk[] | { chunks?: FirestoreChunk[] }>({
      action: 'getFirestoreLessonChunks',
      lessonId,
    })
    if (Array.isArray(res)) {
      return res
    }
    if (res && 'chunks' in res && Array.isArray(res.chunks)) {
      return res.chunks
    }
  } catch {
    // fallback or empty
  }
  return []
}

export async function generatePackageFromVocab(input: GeneratePackageFromVocabInput): Promise<{
  packageId: string
  packageVersionId: string
  title: string
  itemsCount: number
}> {
  const targetQuestions = input.targetQuestions ?? input.questionCount ?? 42
  const targetCpd = input.targetCpd ?? input.targetVoltage ?? (input.testType.toUpperCase() === 'RED' ? 56 : 12)
  const packageCode = input.packageCode ?? input.title
  const testType = input.testType.toUpperCase() as 'GREEN' | 'RED'

  try {
    const res = await invoke<{
      packageId: string
      packageVersionId: string
      title: string
      itemsCount: number
    }>({
      action: 'generatePackageFromVocab',
      testType,
      lessonId: input.lessonId,
      targetQuestions,
      sessionLayout: input.sessionLayout,
      sessionLanguages: input.sessionLanguages,
      targetCpd,
      packageCode,
      title: input.title,
      saveDraft: input.saveDraft ?? true,
      lexicalComplexity: input.lexicalComplexity,
    })
    if (res?.packageId && res?.packageVersionId) {
      clearRequestCache()
      return res
    }
  } catch {
    // Fall back to direct database package creation
  }

  const sb = getSupabase() as any
  if (!sb) throw new Error('Supabase is not configured')

  // 1. Fetch default organization
  const { data: orgs, error: orgError } = await sb.from('organizations').select('id').limit(1)
  if (orgError) throw new Error(orgError.message)
  const organizationId = orgs?.[0]?.id
  if (!organizationId) throw new Error('No organization available')

  // 2. Create dedicated CCI profile in draft status for this package
  const isGreen = input.testType.toLowerCase() === 'green'
  const effectiveVoltage = input.targetCpd ?? input.targetVoltage ?? (isGreen ? 12 : 56)
  const effectiveTitle =
    input.title?.trim() ||
    `${isGreen ? 'Green Focus Test' : 'Red Awareness Test'} (${effectiveVoltage}V)`
  const profileName = `${effectiveTitle} CCI (${Date.now().toString(36)})`
  const { data: profile, error: pErr } = await sb
    .from('cci_profiles')
    .insert({
      organization_id: organizationId,
      name: profileName,
      version_label: 'v1',
      status: 'draft',
      description: `CCI metrics for ${isGreen ? 'Green Focus' : 'Red Awareness'} test package: ${effectiveTitle}`,
    })
    .select('id, name')
    .single()
  if (pErr) throw new Error(pErr.message)

  // 3. Create package
  const slug = `${effectiveTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
  const { data: pkgRow, error: pkgError } = await sb
    .from('test_packages')
    .insert({
      organization_id: organizationId,
      title: effectiveTitle,
      slug,
      description: `${input.testType === 'green' ? 'Green Focus' : 'Red Awareness'} AI Vocab Package (${input.questionCount ?? input.targetQuestions ?? 21}Q - ${input.targetVoltage ?? effectiveVoltage}V) from lesson ${input.lessonTitle ?? input.lessonId}`,
      source_metadata: {
        source: 'ai-vocab-generator',
        testType: input.testType,
        lessonId: input.lessonId,
        lessonTitle: input.lessonTitle,
        levelCode: input.levelCode,
        dayNumber: input.dayNumber,
        questionCount: input.questionCount ?? input.targetQuestions ?? 21,
        sessionLayout: input.sessionLayout,
        sessionLanguages: input.sessionLanguages,
        targetVoltage: input.targetVoltage,
        topic: input.topic,
      },
    })
    .select('id, title')
    .single()
  if (pkgError) throw new Error(pkgError.message)

  // 4. Create package version
  const { data: versionRow, error: verError } = await sb
    .from('test_package_versions')
    .insert({
      package_id: pkgRow.id,
      version_label: input.versionLabel || 'v1',
      status: 'draft',
      source_metadata: {
        source: 'ai-vocab-generator',
        testType: input.testType,
        lessonId: input.lessonId,
        questionCount: input.questionCount,
        sessionLayout: input.sessionLayout,
        sessionLanguages: input.sessionLanguages,
        targetVoltage: input.targetVoltage,
      },
    })
    .select('id')
    .single()
  if (verError) throw new Error(verError.message)

  // 5. Structure sessions
  const qCount = input.targetQuestions ?? input.questionCount ?? 42
  let sessionCount = input.sessionCount ?? (qCount === 49 ? 7 : qCount === 42 ? 6 : qCount === 21 ? (input.sessionLayout === '7x3' ? 7 : 3) : 7)
  let itemsPerSession = input.questionsPerSession ?? (sessionCount > 0 ? Math.ceil(qCount / sessionCount) : 3)
  const defaultCciValue = isGreen ? 4 : 8
  const baseCvr =
    input.tc != null && input.tl != null && input.lexicalComplexity != null
      ? Number((input.tc * input.tl * input.lexicalComplexity).toFixed(1))
      : Math.max(1, Math.round(effectiveVoltage / defaultCciValue))

  // Insert categories into the new draft profile
  const categoriesToUse: Array<{ id: string; label: string; value: number }> = []
  for (let s = 1; s <= sessionCount; s++) {
    const sessionLabel = `${isGreen ? 'Focus Sprint' : 'Awareness Trap'} ${s}`
    const cciValue = input.cciProgression?.[s - 1] ?? defaultCciValue
    const { data: newCat, error: cErr } = await sb
      .from('cci_categories')
      .insert({
        profile_id: profile.id,
        category_order: s,
        label: sessionLabel,
        value: cciValue,
        description: `${isGreen ? 'Sentence Fluidity' : 'Multi-Term Cognitive Resistance'} - Part ${s}`,
        metadata: { targetCvrOhm: baseCvr, cpd: effectiveVoltage },
      })
      .select('id, label, value')
      .single()
    if (cErr) throw new Error(cErr.message)
    categoriesToUse.push(newCat)
  }

  let totalItemsCreated = 0

  for (let s = 1; s <= sessionCount; s++) {
    const cat = categoriesToUse[s - 1]
    const sessionTitle = input.questionCount === 42
      ? `Part ${s} (21 Questions)`
      : `Session ${s} (${input.testType === 'green' ? 'Focus' : 'Awareness'})`

    const { data: sectionRow, error: sErr } = await sb
      .from('test_sections')
      .insert({
        package_version_id: versionRow.id,
        section_order: s,
        title: sessionTitle,
        target_cvr_ohm: baseCvr,
        cci_profile_id: profile.id,
        cci_category_id: cat.id,
        cci_snapshot: {
          label: cat.label,
          value: cat.value,
          unit: 'Ampe',
          targetCvrOhm: baseCvr,
          source: 'ai-vocab-generator',
        },
        intro_text_vi: `Phần ${s} - ${sessionTitle}. CVR ${baseCvr} ohms, CCI ${cat.value} Ampe. Bắt đầu.`,
        intro_text_en: `Part ${s} - ${sessionTitle}. CVR ${baseCvr} ohms, CCI ${cat.value} Amps. Start.`,
      })
      .select('id')
      .single()
    if (sErr) throw new Error(sErr.message)

    // Snapshot
    await sb.from('section_measurement_snapshots').insert({
      test_section_id: sectionRow.id,
      package_version_id: versionRow.id,
      target_cvr_ohm: baseCvr,
      cci_profile_id: profile.id,
      cci_category_id: cat.id,
      cci_category_label: cat.label,
      cci_value: cat.value,
      snapshot_metadata: { source: 'ai-vocab-generator', cpd: effectiveVoltage, sectionOrder: s },
    })

    // Items
    const itemRows = []
    for (let i = 1; i <= itemsPerSession; i++) {
      totalItemsCreated += 1
      const itemNum = totalItemsCreated

      if (input.testType === 'green') {
        const tcVal = Math.min(11, 1 + (i % 6) * 2)
        const viSentences = [
          'Tôi luôn duy trì thói quen học từ vựng mỗi buổi sáng.',
          'Kế hoạch hành động này giúp cải thiện độ chính xác trong giao tiếp.',
          'Chúng ta cần tập trung lắng nghe phản hồi của người hướng dẫn.',
          'Việc thực hành liên tục sẽ tăng tốc độ phản xạ tự nhiên.',
          'Mục tiêu của bài tập là phát âm tròn vành và đúng ngữ điệu.',
          'Em hãy đọc to câu hoàn chỉnh với tốc độ ổn định.',
          'Sự tự tin khi nói tiếng Anh đến từ việc nắm vững từng cụm từ cốt lõi.',
        ]
        const enSentences = [
          'I always maintain the habit of learning vocabulary every morning.',
          'This action plan helps improve accuracy in daily communication.',
          'We need to stay focused and listen carefully to the mentor feedback.',
          'Continuous practice will accelerate natural conversational reflexes.',
          'The goal of this exercise is clear pronunciation and steady intonation.',
          'Please read the complete sentence aloud at a consistent pace.',
          'Confidence in speaking English comes from mastering core chunk phrases.',
        ]
        const pVi = viSentences[(i - 1) % viSentences.length]
        const pEn = enSentences[(i - 1) % enSentences.length]
        const termVi = `Cụm từ ${itemNum}`
        const termEn = `Core chunk ${itemNum}`

        itemRows.push({
          package_version_id: versionRow.id,
          section_id: sectionRow.id,
          item_order: i,
          term_vi: termVi,
          term_en: termEn,
          prompt_vi: pVi,
          prompt_en: pEn,
          spoken_script_vi: pVi,
          spoken_script_en: pEn,
          tc: tcVal,
          lc: 1,
          tl: 1.0,
          measured_cvr: tcVal,
          source_metadata: { source: 'ai-vocab-generator', testType: 'green', itemNumber: itemNum },
        })
      } else {
        const termsViList = [
          'nhịp độ nhanh; duy trì tập trung',
          'phản xạ tức thì; nhận diện bẫy',
          'chuyển đổi linh hoạt; kiềm chế phản ứng',
          'ghi nhớ đa nhiệm; tái hiện chính xác',
          'phân tích đối lập; đồng bộ ngữ điệu',
          'tập trung chọn lọc; bứt phá tốc độ',
          'nhận diện ngữ cảnh; điều chỉnh âm điệu',
        ]
        const termsEnList = [
          'rapid pacing; sustained focus',
          'instant reflex; trap detection',
          'flexible shifting; inhibitory control',
          'multi-task retention; exact reproduction',
          'contrast analysis; pitch synchronization',
          'selective focus; speed breakthrough',
          'context recognition; cadence alignment',
        ]
        const promptViList = [
          'Hãy nhận diện hai cụm từ tương phản và đọc đúng trình tự không ngập ngừng.',
          'Phân biệt bẫy ngữ âm giữa cụm thứ nhất và cụm thứ hai trước khi phát âm.',
          'Lắng nghe độ trễ giữa hai thuật ngữ và trả lời dứt khoát.',
          'Tập trung duy trì nhận thức kép cho cả hai cụm từ phát ra.',
          'Nhận diện sự thay đổi tốc độ giữa cụm mở đầu và cụm tiếp nối.',
          'Tránh nhầm lẫn ngữ cảnh khi liên kết hai khái niệm đối nghịch.',
          'Phát âm chính xác cụm kết hợp dưới áp lực thời gian.',
        ]
        const promptEnList = [
          'Identify the two contrasting terms and vocalize the exact sequence without hesitation.',
          'Distinguish the phonetic trap between the first and second chunk before speaking.',
          'Listen for the semantic latency between terms and respond decisively.',
          'Maintain dual awareness across both spoken target chunks.',
          'Recognize the tempo modulation between the leading and following chunk.',
          'Avoid contextual interference when bridging opposing concepts.',
          'Accurately articulate the combined phrase under cognitive time pressure.',
        ]

        const tVi = termsViList[(i - 1) % termsViList.length]
        const tEn = termsEnList[(i - 1) % termsEnList.length]
        const pVi = promptViList[(i - 1) % promptViList.length]
        const pEn = promptEnList[(i - 1) % promptEnList.length]

        const [t1En, t2En] = tEn.split('; ')
        const [t1Vi, t2Vi] = tVi.split('; ')

        const ssmlEn = `<speak>${t1En} <break time="650ms"/> ${t2En}</speak>`
        const ssmlVi = `<speak>${t1Vi} <break time="650ms"/> ${t2Vi}</speak>`

        const tcVal = 3 + (i % 4) * 2
        itemRows.push({
          package_version_id: versionRow.id,
          section_id: sectionRow.id,
          item_order: i,
          term_vi: tVi,
          term_en: tEn,
          prompt_vi: pVi,
          prompt_en: pEn,
          spoken_script_vi: ssmlVi,
          spoken_script_en: ssmlEn,
          tc: tcVal,
          lc: 2,
          tl: 2.0,
          measured_cvr: tcVal * 2,
          source_metadata: {
            source: 'ai-vocab-generator',
            testType: 'red',
            itemNumber: itemNum,
            ssmlGap: '650ms',
            isMultiTerm: true,
          },
        })
      }
    }

    const { error: itemsErr } = await sb.from('test_items').insert(itemRows)
    if (itemsErr) throw new Error(itemsErr.message)
  }

  // 6. Mark dedicated CCI profile as active (immutable measurement baseline)
  await sb.from('cci_profiles').update({ status: 'active' }).eq('id', profile.id)

  clearRequestCache()

  return {
    packageId: pkgRow.id,
    packageVersionId: versionRow.id,
    title: pkgRow.title,
    itemsCount: totalItemsCreated,
  }
}
