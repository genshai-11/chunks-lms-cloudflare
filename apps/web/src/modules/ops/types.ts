import type { ResultColor } from '../result-lifecycle/types'

export type OpsAuditEventType =
  | 'result_finalized'
  | 'result_corrected'
  | 'attendance_recorded'
  | 'session_completed'

export type OpsAuditEvent = {
  id: string
  at: string
  type: OpsAuditEventType
  organizationId: string
  classId: string
  learningSessionId: string
  learnerUserId: string | null
  teacherUserId: string | null
  sessionQuestionId: string | null
  /** Result identity for corrections (ledger row / attempt key) */
  resultKey: string | null
  color: ResultColor | null
  previousColor: ResultColor | null
  reason: string | null
  actorId: string | null
}

export type SessionOpsRow = {
  learningSessionId: string
  classId: string
  className: string
  courseCode: string
  sessionNumber: number | null
  status: 'open' | 'completed'
  startedAt: string
  completedAt: string | null
  scheduledStatus: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'none'
  seats: number
  attendanceMarked: number
  attendanceRate: number | null
  resultCount: number
  openProbes: number
  unfinishedDrafts: number
}
