import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CaptureSessionState } from '../modules/assessment/session-capture'
import { createDefaultMetricSettings, type MetricSettingsState } from '../modules/metrics/settings'
import { appendResult, type ResultRecord } from '../modules/reporting/progress'
import { createEmptyRoster, LOCAL_ORG_ID } from '../modules/roster/seed'
import type { RosterState } from '../modules/roster/types'
import { emptySchedulingState } from '../modules/scheduling/session-lifecycle'
import type { SchedulingState } from '../modules/scheduling/types'
import {
  deleteWorkspaceLearningDataFromSupabase,
  ensureSupabaseStaffWorkspace,
  isSupabaseConfigured,
  loadWorkspaceFromSupabase,
  normalizeIdsForDb,
  saveWorkspaceToSupabase,
  verifyWorkspacePersistence,
} from '../lib/supabase-sync'
import { mergeScheduling } from '../modules/sync/entity-sync'
import { chooseBootstrapSource } from '../modules/sync/bootstrap-policy'
import { rebuildLedgerFromCloud } from '../lib/reconciliation-fetch'
import { AppStateContext, type BackendStatus } from './app-state-context'
import { clearPersistedAppState, loadPersistedAppState, savePersistedAppState } from './persist'
import { loadActiveLearnerId, saveActiveLearnerId } from './active-learner'
import { loadActiveClassId, saveActiveClassId } from './workspace-prefs'
import { loadLiveLedger } from '../lib/live-assessment'
import { useStaffSession } from '../auth/useStaffSession'
import {
  auditFromNewResults,
  correctFinalizedResult,
  type CorrectResultInput,
} from '../modules/ops/audit'
import type { OpsAuditEvent } from '../modules/ops/types'
import { loadOrgMetricSettings, saveOrgMetricSettings } from '../lib/org-settings-sync'

function ledgerFromCapture(
  capture: CaptureSessionState,
  roster: RosterState,
  existing: ResultRecord[],
  scheduling: SchedulingState,
): ResultRecord[] {
  const session = scheduling.learningSessions.find((s) => s.id === capture.learningSessionId)
  const classId = session?.classId
  const klass =
    roster.classes.find((c) => c.id === classId) ??
    roster.classes.find((c) => c.teacherUserId === capture.teacherUserId) ??
    roster.classes[0]
  const course = roster.courses.find((c) => c.id === klass?.courseId) ?? roster.courses[0]
  if (!klass || !course) return existing

  let next = existing
  for (const a of capture.attempts) {
    if (!a.snapshot.effectiveColor || !a.snapshot.finalizedAt) continue
    const already = next.some(
      (r) =>
        r.sessionQuestionId === a.sessionQuestionId &&
        r.learnerUserId === a.learnerUserId &&
        r.learningSessionId === a.learningSessionId &&
        r.effectiveColor === a.snapshot.effectiveColor,
    )
    if (already) continue
    next = appendResult(next, {
      organizationId: roster.organization.id,
      courseId: course.id,
      classId: klass.id,
      learningSessionId: a.learningSessionId,
      learnerUserId: a.learnerUserId,
      teacherUserId: a.teacherUserId,
      sessionQuestionId: a.sessionQuestionId,
      effectiveColor: a.snapshot.effectiveColor,
      enteredProbeFlow: a.snapshot.enteredProbeFlow,
      probeEventCount: a.snapshot.probeCount,
      finalizedAt: a.snapshot.finalizedAt,
    })
  }
  return next
}

function rosterWeight(r: RosterState, s: SchedulingState): number {
  return (
    r.users.length * 4 +
    r.courses.length * 3 +
    r.classes.length * 3 +
    r.enrollments.length * 2 +
    s.scheduledSessions.length +
    s.learningSessions.length
  )
}

function rebaseRosterOrganization(
  r: RosterState,
  organizationId: string,
  name: string,
): RosterState {
  return {
    ...r,
    organization: { id: organizationId, name },
    courses: r.courses.map((course) => ({ ...course, organizationId })),
  }
}

function syncPhaseError(
  phase: 'auth' | 'provision' | 'load' | 'write' | 'reload' | 'verify',
  message: string,
): string {
  return `[${phase}] ${message}`
}

function ensureStableOrg(r: RosterState): RosterState {
  if (r.organization.id === 'org-local' || r.organization.id.startsWith('org-local')) {
    return {
      ...r,
      organization: { ...r.organization, id: LOCAL_ORG_ID },
      courses: r.courses.map((c) =>
        c.organizationId === r.organization.id || c.organizationId === 'org-local'
          ? { ...c, organizationId: LOCAL_ORG_ID }
          : c,
      ),
    }
  }
  return r
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const staffSession = useStaffSession()
  const staffRolesKey = staffSession.staffRoles.join('|')
  const stableStaffRoles = useMemo(
    () => (staffRolesKey ? staffRolesKey.split('|') : []) as typeof staffSession.staffRoles,
    [staffRolesKey],
  )
  const persistedRef = useRef(loadPersistedAppState())
  const [roster, setRoster] = useState<RosterState>(() =>
    staffSession.authEnabled
      ? createEmptyRoster()
      : ensureStableOrg(persistedRef.current?.roster ?? createEmptyRoster()),
  )
  const [scheduling, setScheduling] = useState<SchedulingState>(() =>
    staffSession.authEnabled
      ? emptySchedulingState()
      : (persistedRef.current?.scheduling ?? emptySchedulingState()),
  )
  const [capture, setCapture] = useState<CaptureSessionState | null>(null)
  const [ledger, setLedger] = useState<ResultRecord[]>(() => persistedRef.current?.ledger ?? [])
  const [auditLog, setAuditLog] = useState<OpsAuditEvent[]>(
    () => persistedRef.current?.auditLog ?? [],
  )
  const [metricSettings, setMetricSettingsState] = useState<MetricSettingsState>(
    () => persistedRef.current?.metricSettings ?? createDefaultMetricSettings(),
  )
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('booting')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [activeLearnerUserId, setActiveLearnerUserIdState] = useState<string | null>(() =>
    loadActiveLearnerId(),
  )
  const [activeClassId, setActiveClassIdState] = useState<string | null>(() => loadActiveClassId())
  const [workspaceRevision, setWorkspaceRevision] = useState<number | null>(null)

  const setActiveLearnerUserId = useCallback((id: string | null) => {
    saveActiveLearnerId(id)
    setActiveLearnerUserIdState(id)
  }, [])

  const setActiveClassId = useCallback((id: string | null) => {
    saveActiveClassId(id)
    setActiveClassIdState(id)
  }, [])

  const bootDone = useRef(false)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSync = useRef(false)
  /** After intentional Clear data, allow empty cloud wipe once */
  const allowEmptyWipeOnce = useRef(false)
  /** Latest in-memory workspace for boot merge (avoid clobbering mid-edit) */
  const liveRef = useRef({ roster, scheduling })
  liveRef.current = { roster, scheduling }

  // Boot: staff (signed-in) cloud is authoritative for writes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      bootDone.current = false
      if (staffSession.authEnabled && !staffSession.ready) return

      const staffAuthed =
        staffSession.authBypass || (staffSession.authEnabled && staffSession.signedIn)
      const canProvisionStaff =
        Boolean(staffSession.userId) &&
        (staffSession.authBypass || stableStaffRoles.length > 0)

      if (!isSupabaseConfigured()) {
        // Offline: restore local cache so learner invite still works on this browser.
        const cached = persistedRef.current
        if (cached && staffSession.authEnabled && !staffAuthed) {
          skipNextSync.current = true
          setRoster(ensureStableOrg(cached.roster))
          setScheduling(cached.scheduling)
          if (cached.ledger) setLedger(cached.ledger)
        }
        setBackendStatus('offline')
        setBackendError(null)
        bootDone.current = true
        return
      }

      // Signed-in Supabase user with no database staff role must not create a
      // workspace or clobber roster; StaffGate explains the missing grant.
      if (
        staffSession.authEnabled &&
        staffSession.signedIn &&
        !staffSession.authBypass &&
        stableStaffRoles.length === 0
      ) {
        setBackendStatus('offline')
        setBackendError(syncPhaseError('auth', 'Signed in but no active database staff role'))
        bootDone.current = true
        return
      }

      let organizationId: string | undefined
      if (canProvisionStaff && staffSession.userId) {
        const provisioned = await ensureSupabaseStaffWorkspace({
          authUserId: staffSession.userId,
          email: staffSession.email,
          displayName: staffSession.displayName ?? staffSession.email ?? 'Chunks Staff',
          roles: stableStaffRoles.length ? stableStaffRoles : ['admin', 'teacher'],
        })
        if (!provisioned.ok) {
          setBackendStatus('error')
          setBackendError(syncPhaseError('provision', provisioned.error))
          return
        }
        organizationId = provisioned.organizationId
      }

      // Learners (signed out): load richest workspace without org filter (V1 demo RLS).
      // Staff: scoped to their provisioned organization.
      const loaded = await loadWorkspaceFromSupabase(
        organizationId ? { organizationId } : undefined,
      )
      if (cancelled) return
      if (!loaded.ok) {
        setBackendStatus('error')
        setBackendError(syncPhaseError('load', loaded.error))
        bootDone.current = true
        return
      }

      const remote = {
        roster: ensureStableOrg(loaded.data.roster),
        scheduling: loaded.data.scheduling,
      }
      const localRoster = ensureStableOrg(persistedRef.current?.roster ?? liveRef.current.roster)
      const live = {
        roster: organizationId
          ? rebaseRosterOrganization(localRoster, organizationId, remote.roster.organization.name)
          : localRoster,
        scheduling: persistedRef.current?.scheduling ?? liveRef.current.scheduling,
      }
      const wRemote = rosterWeight(remote.roster, remote.scheduling)
      const wLive = rosterWeight(live.roster, live.scheduling)

      skipNextSync.current = true
      if (typeof loaded.revision === 'number') {
        setWorkspaceRevision(loaded.revision)
      }

      let authoritativeRoster = remote.roster
      const source = chooseBootstrapSource(wRemote, wLive)

      if (!staffAuthed) {
        // Signed-out path: prefer cloud; fall back to this browser's cache.
        // Never push local → cloud while signed out.
        if (source === 'cloud' || (source === 'empty' && wRemote === 0 && wLive === 0)) {
          setRoster(remote.roster)
          setScheduling(
            wRemote > 0 ? mergeScheduling(live.scheduling, remote.scheduling) : remote.scheduling,
          )
          authoritativeRoster = remote.roster
        } else if (source === 'local') {
          authoritativeRoster = live.roster
          setRoster(live.roster)
          setScheduling(live.scheduling)
        } else {
          setRoster(remote.roster)
          setScheduling(remote.scheduling)
        }
      } else if (source === 'cloud' || wRemote > 0) {
        // Cloud roster authoritative; merge scheduling so open remote sessions survive.
        setRoster(remote.roster)
        setScheduling(mergeScheduling(live.scheduling, remote.scheduling))
      } else if (source === 'local') {
        // One-time migration from this browser into the empty Supabase Auth workspace.
        authoritativeRoster = live.roster
        setRoster(live.roster)
        setScheduling(live.scheduling)
        skipNextSync.current = false
      } else {
        setRoster(remote.roster)
        setScheduling(remote.scheduling)
      }

      // Prefer snapshot projection for ledger (not capture-only append).
      const liveLedger = await rebuildLedgerFromCloud(authoritativeRoster)
      if (!cancelled && liveLedger.ok) setLedger(liveLedger.data)
      else if (!cancelled) {
        const fallback = await loadLiveLedger(authoritativeRoster)
        if (fallback.ok) setLedger(fallback.data)
      }

      setBackendStatus('online')
      // Learners load cloud read-only; do not surface a sticky "error" banner.
      setBackendError(null)
      setLastSyncedAt(new Date().toISOString())
      bootDone.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [
    staffSession.authBypass,
    staffSession.authEnabled,
    staffSession.displayName,
    staffSession.email,
    staffSession.ready,
    staffSession.signedIn,
    staffSession.userId,
    stableStaffRoles,
  ])

  // Local cache always
  useEffect(() => {
    savePersistedAppState({
      roster,
      scheduling,
      capture: null,
      ledger,
      metricSettings,
      auditLog,
    })
  }, [roster, scheduling, metricSettings, ledger, auditLog])

  // Persist metric settings to Supabase org_settings when available (staff only)
  useEffect(() => {
    if (!bootDone.current) return
    if (!isSupabaseConfigured()) return
    if (!staffSession.authBypass && !staffSession.signedIn) return
    if (!staffSession.authBypass && staffSession.staffRoles.length === 0) return
    const orgId = ensureStableOrg(roster).organization.id
    const t = setTimeout(() => {
      void saveOrgMetricSettings(orgId, metricSettings)
    }, 800)
    return () => clearTimeout(t)
  }, [
    metricSettings,
    roster,
    staffSession.authBypass,
    staffSession.signedIn,
    staffSession.staffRoles.length,
  ])

  // Debounced Supabase save — staff only (learners must never write the workspace)
  useEffect(() => {
    if (!bootDone.current) return
    if (!isSupabaseConfigured()) return
    if (!staffSession.authBypass && !staffSession.signedIn) return
    if (!staffSession.authBypass && staffSession.staffRoles.length === 0) return
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }

    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      setBackendStatus('syncing')
      const stable = {
        roster: ensureStableOrg(roster),
        scheduling,
      }
      const normalized = normalizeIdsForDb(stable)
      if (
        normalized.roster.organization.id !== roster.organization.id ||
        normalized.roster.users.some((u, i) => u.id !== roster.users[i]?.id) ||
        normalized.roster.courses.some((c, i) => c.id !== roster.courses[i]?.id)
      ) {
        skipNextSync.current = true
        setRoster(normalized.roster)
        setScheduling(normalized.scheduling)
      }
      const wipe = allowEmptyWipeOnce.current
      allowEmptyWipeOnce.current = false
      const result = await saveWorkspaceToSupabase(normalized, {
        allowEmptyWipe: wipe,
        expectedRevision: workspaceRevision ?? undefined,
        canProvision: staffSession.canAccess('admin'),
      })
      if (result.ok) {
        if (typeof result.newRevision === 'number') {
          setWorkspaceRevision(result.newRevision)
        }
        setBackendStatus('online')
        setBackendError(null)
        setLastSyncedAt(new Date().toISOString())
      } else if (result.conflict) {
        setBackendStatus('error')
        setBackendError('Conflict: workspace updated by another session. Please reload to refresh.')
      } else {
        setBackendStatus('error')
        setBackendError(syncPhaseError('write', result.error))
      }
    }, 700)

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [
    roster,
    scheduling,
    staffSession.authBypass,
    staffSession.signedIn,
    staffSession.staffRoles.length,
    workspaceRevision,
  ])

  const resetAll = useCallback(() => {
    clearPersistedAppState()
    saveActiveLearnerId(null)
    setActiveLearnerUserIdState(null)
    allowEmptyWipeOnce.current = false
    skipNextSync.current = true
    setRoster(createEmptyRoster())
    setScheduling(emptySchedulingState())
    setCapture(null)
    setLedger([])
    setAuditLog([])
    setMetricSettingsState(createDefaultMetricSettings())
  }, [])

  const deleteAllLearningData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setBackendStatus('offline')
      setBackendError('Supabase not configured')
      return false
    }
    if (!staffSession.authBypass && !staffSession.signedIn) {
      setBackendError('Sign in as staff to delete workspace data')
      return false
    }
    if (!staffSession.authBypass && !staffSession.staffRoles.includes('admin')) {
      setBackendError('Admin role required to delete workspace data')
      return false
    }

    setBackendStatus('syncing')
    const stableRoster = ensureStableOrg(roster)
    const orgId = stableRoster.organization.id
    const result = await deleteWorkspaceLearningDataFromSupabase(orgId)
    if (!result.ok) {
      setBackendStatus('error')
      setBackendError(syncPhaseError('write', result.error))
      return false
    }

    clearPersistedAppState()
    saveActiveLearnerId(null)
    saveActiveClassId(null)
    setActiveLearnerUserIdState(null)
    setActiveClassIdState(null)
    skipNextSync.current = false
    allowEmptyWipeOnce.current = false

    const staffUsers = stableRoster.users.filter((user) =>
      user.roles.some((role) => role === 'admin' || role === 'teacher'),
    )
    setRoster({
      ...createEmptyRoster(),
      organization: stableRoster.organization,
      users: staffUsers,
    })
    setScheduling(emptySchedulingState())
    setCapture(null)
    setLedger([])
    setAuditLog([])
    setMetricSettingsState(createDefaultMetricSettings())
    setBackendStatus('online')
    setBackendError(null)
    setLastSyncedAt(new Date().toISOString())
    return true
  }, [roster, staffSession.authBypass, staffSession.signedIn, staffSession.staffRoles])

  const syncNow = useCallback(
    async (override?: {
      roster?: RosterState
      scheduling?: SchedulingState
      pruneMissing?: boolean
    }) => {
      if (!isSupabaseConfigured()) {
        setBackendStatus('offline')
        return false
      }
      if (!staffSession.authBypass && !staffSession.signedIn) {
        setBackendError('Sign in as staff to sync changes')
        return false
      }
      if (!staffSession.authBypass && staffSession.staffRoles.length === 0) {
        setBackendError('No staff role — cannot sync')
        return false
      }
      setBackendStatus('syncing')
      // Prefer explicit snapshot (caller just mutated scheduling/roster) over stale React state.
      const snapshot = {
        roster: ensureStableOrg(override?.roster ?? roster),
        scheduling: override?.scheduling ?? scheduling,
      }
      const normalized = normalizeIdsForDb(snapshot)
      if (
        normalized.roster.organization.id !== snapshot.roster.organization.id ||
        normalized.roster.users.some((u, i) => u.id !== snapshot.roster.users[i]?.id)
      ) {
        skipNextSync.current = true
        setRoster(normalized.roster)
        setScheduling(normalized.scheduling)
      }
      const result = await saveWorkspaceToSupabase(normalized, {
        allowEmptyWipe: allowEmptyWipeOnce.current,
        pruneMissing: override?.pruneMissing,
        expectedRevision: workspaceRevision ?? undefined,
        canProvision: staffSession.canAccess('admin'),
      })
      if (result.ok && typeof result.newRevision === 'number') {
        setWorkspaceRevision(result.newRevision)
      }
      allowEmptyWipeOnce.current = false
      if (result.ok) {
        const currentTeacherUser = roster.users.find(
          (u) => Boolean(staffSession.email) && u.email?.toLowerCase() === staffSession.email?.toLowerCase(),
        )
        const verified = await verifyWorkspacePersistence(normalized, {
          teacherUserId: staffSession.canAccess('admin') ? null : (currentTeacherUser?.id ?? null),
        })
        if (!verified.ok) {
          setBackendStatus('error')
          setBackendError(syncPhaseError('verify', verified.error))
          return false
        }
        setBackendStatus('online')
        setBackendError(null)
        setLastSyncedAt(new Date().toISOString())
        return true
      }
      setBackendStatus('error')
      setBackendError(syncPhaseError('write', result.error))
      return false
    },
    [
      roster,
      scheduling,
      staffSession.authBypass,
      staffSession.signedIn,
      staffSession.staffRoles.length,
      workspaceRevision,
    ],
  )

  const reloadFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured() || !staffSession.userId) return
    setBackendStatus('syncing')
    const provisioned = await ensureSupabaseStaffWorkspace({
      authUserId: staffSession.userId,
      email: staffSession.email,
      displayName: staffSession.displayName ?? staffSession.email ?? 'Chunks Staff',
      roles: stableStaffRoles,
    })
    if (!provisioned.ok) {
      setBackendStatus('error')
      setBackendError(syncPhaseError('reload', provisioned.error))
      return
    }
    const loaded = await loadWorkspaceFromSupabase({
      organizationId: provisioned.organizationId,
    })
    if (!loaded.ok) {
      setBackendStatus('error')
      setBackendError(syncPhaseError('reload', loaded.error))
      return
    }
    skipNextSync.current = true
    const remoteRoster = ensureStableOrg(loaded.data.roster)
    setRoster(remoteRoster)
    setScheduling(mergeScheduling(liveRef.current.scheduling, loaded.data.scheduling))
    setCapture(null)
    const liveLedger = await rebuildLedgerFromCloud(remoteRoster)
    if (liveLedger.ok) setLedger(liveLedger.data)
    else {
      const fallback = await loadLiveLedger(remoteRoster)
      if (fallback.ok) setLedger(fallback.data)
    }
    setBackendStatus('online')
    setBackendError(null)
    setLastSyncedAt(new Date().toISOString())
    if (typeof loaded.revision === 'number') {
      setWorkspaceRevision(loaded.revision)
    }
  }, [
    staffSession.displayName,
    staffSession.email,
    staffSession.userId,
    stableStaffRoles,
  ])

  const setMetricSettings = useCallback((next: MetricSettingsState) => {
    setMetricSettingsState(next)
  }, [])

  const appendFinalizedFromCapture = useCallback(
    (nextCapture: CaptureSessionState) => {
      setLedger((prev) => {
        const next = ledgerFromCapture(nextCapture, roster, prev, scheduling)
        const events = auditFromNewResults(
          roster.organization.id,
          prev,
          next,
          nextCapture.teacherUserId,
        )
        if (events.length > 0) {
          setAuditLog((a) => [...a, ...events])
        }
        return next
      })
    },
    [roster, scheduling],
  )

  const correctResult = useCallback(
    (input: CorrectResultInput) => {
      const result = correctFinalizedResult(ledger, auditLog, input)
      if (!result.ok) return { ok: false as const, error: result.error }
      setLedger(result.ledger)
      setAuditLog(result.audit)
      return { ok: true as const }
    },
    [ledger, auditLog],
  )

  // Load org metric settings once when online
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const orgId = ensureStableOrg(roster).organization.id
    void loadOrgMetricSettings(orgId).then((loaded) => {
      if (loaded.ok && loaded.data) setMetricSettingsState(loaded.data)
    })
    // only on org change / boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.organization.id])

  const value = useMemo(
    () => ({
      roster,
      setRoster,
      scheduling,
      setScheduling,
      capture,
      setCapture,
      ledger,
      setLedger,
      metricSettings,
      setMetricSettings,
      auditLog,
      appendFinalizedFromCapture,
      correctResult,
      resetAll,
      deleteAllLearningData,
      backendStatus,
      backendError,
      lastSyncedAt,
      syncNow,
      reloadFromSupabase,
      supabaseEnabled: isSupabaseConfigured(),
      activeLearnerUserId,
      setActiveLearnerUserId,
      activeClassId,
      setActiveClassId,
    }),
    [
      roster,
      scheduling,
      capture,
      ledger,
      metricSettings,
      setMetricSettings,
      auditLog,
      appendFinalizedFromCapture,
      correctResult,
      resetAll,
      deleteAllLearningData,
      backendStatus,
      backendError,
      lastSyncedAt,
      syncNow,
      reloadFromSupabase,
      activeLearnerUserId,
      setActiveLearnerUserId,
      activeClassId,
      setActiveClassId,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
