import type { CaptureSessionState } from '../modules/assessment/session-capture'
import {
  createDefaultMetricSettings,
  mergeMetricSettings,
  type MetricSettingsState,
} from '../modules/metrics/settings'
import type { OpsAuditEvent } from '../modules/ops/types'
import type { ResultRecord } from '../modules/reporting/progress'
import { createEmptyRoster, LOCAL_ORG_ID } from '../modules/roster/seed'
import { normalizeCourseSchedule } from '../modules/roster/schedule'
import type { Class, DomainUser, RosterState } from '../modules/roster/types'
import { emptySchedulingState } from '../modules/scheduling/session-lifecycle'
import type { SchedulingState } from '../modules/scheduling/types'

const STORAGE_KEY = 'chunks-lms:app-state:v1'

export type PersistedAppState = {
  version: 1
  roster: RosterState
  scheduling: SchedulingState
  capture: CaptureSessionState | null
  ledger: ResultRecord[]
  metricSettings: MetricSettingsState
  auditLog?: OpsAuditEvent[]
  savedAt: string
}

function normalizeUser(u: DomainUser): DomainUser {
  return {
    ...u,
    avatarUrl: u.avatarUrl ?? null,
    accountStatus: u.accountStatus === 'inactive' ? 'inactive' : 'active',
  }
}

function normalizeScheduling(s: SchedulingState): SchedulingState {
  return {
    scheduledSessions: s.scheduledSessions ?? [],
    attendance: s.attendance ?? [],
    learningSessions: (s.learningSessions ?? []).map((ls) => ({
      ...ls,
      sessionKind: ls.sessionKind ?? 'regular',
      sessionFormat: ls.sessionFormat ?? 'lesson',
      promptLanguage: ls.sessionFormat === 'test' ? (ls.promptLanguage ?? 'vi') : null,
      liveTestResourceId: ls.sessionFormat === 'test' ? (ls.liveTestResourceId ?? null) : null,
      liveTestBlockId: ls.sessionFormat === 'test' ? (ls.liveTestBlockId ?? null) : null,
      participantLearnerIds: ls.participantLearnerIds ?? null,
    })),
  }
}

function normalizeClass(c: Class): Class {
  return {
    ...c,
    schedule: normalizeCourseSchedule(c.schedule) ?? c.schedule ?? null,
  }
}

/** Load last local workspace. Returns null if none / invalid. */
export function loadPersistedAppState(): PersistedAppState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<PersistedAppState>
    if (!data || data.version !== 1 || !data.roster) return null

    const rawOrg = data.roster.organization ?? createEmptyRoster().organization
    const orgId =
      rawOrg.id === 'org-local' || String(rawOrg.id).startsWith('org-local')
        ? LOCAL_ORG_ID
        : rawOrg.id
    const roster: RosterState = {
      organization: { ...rawOrg, id: orgId },
      users: (data.roster.users ?? []).map(normalizeUser),
      courses: (data.roster.courses ?? []).map((c) => ({
        ...c,
        organizationId:
          c.organizationId === 'org-local' || c.organizationId === rawOrg.id
            ? orgId
            : c.organizationId,
      })),
      classes: (data.roster.classes ?? []).map(normalizeClass),
      enrollments: data.roster.enrollments ?? [],
    }

    return {
      version: 1,
      roster,
      scheduling: normalizeScheduling(data.scheduling ?? emptySchedulingState()),
      capture: data.capture ?? null,
      ledger: data.ledger ?? [],
      metricSettings: mergeMetricSettings(data.metricSettings),
      auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
      savedAt: data.savedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function savePersistedAppState(state: {
  roster: RosterState
  scheduling: SchedulingState
  capture: CaptureSessionState | null
  ledger: ResultRecord[]
  metricSettings: MetricSettingsState
  auditLog?: OpsAuditEvent[]
}): void {
  if (typeof window === 'undefined') return
  try {
    const payload: PersistedAppState = {
      version: 1,
      roster: state.roster,
      scheduling: state.scheduling,
      capture: state.capture,
      ledger: state.ledger,
      metricSettings: state.metricSettings,
      auditLog: state.auditLog ?? [],
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearPersistedAppState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function initialAppState(): Omit<PersistedAppState, 'version' | 'savedAt'> {
  const saved = loadPersistedAppState()
  if (saved) {
    return {
      roster: saved.roster,
      scheduling: saved.scheduling,
      capture: saved.capture,
      ledger: saved.ledger,
      metricSettings: saved.metricSettings,
      auditLog: saved.auditLog ?? [],
    }
  }
  return {
    roster: createEmptyRoster(),
    scheduling: emptySchedulingState(),
    capture: null,
    ledger: [],
    metricSettings: createDefaultMetricSettings(),
    auditLog: [],
  }
}
