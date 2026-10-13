/**
 * Seeded end-to-end domain flow (no browser):
 * login context → schedule → attendance → assessment → probes → correction → reporting
 *
 * Capture rule: one Assessment Attempt per Session Question (round-robin learners).
 */
import {
  addSessionQuestion,
  createCaptureSession,
  markSessionCompleted,
  recordColorForCurrent,
  resolveProbeForCurrent,
  type CaptureSessionState,
} from '../assessment/session-capture'
import { applyLifecycleCommand } from '../result-lifecycle/state-machine'
import { createSeedRoster } from '../roster/seed'
import { activeEnrollmentsForClass } from '../roster/service'
import type { RosterState } from '../roster/types'
import {
  appendResult,
  buildCourseProgressReport,
  type ResultRecord,
} from '../reporting/progress'
import { resolveReportWindow } from '../reporting/report-window'
import {
  completeLearningSession,
  createScheduledSession,
  emptySchedulingState,
  recordAttendance,
  startLearningSession,
} from '../scheduling/session-lifecycle'
import type { SchedulingState } from '../scheduling/types'

export type SeededFlowResult = {
  ok: true
  roster: RosterState
  scheduling: SchedulingState
  capture: CaptureSessionState
  ledger: ResultRecord[]
  reportSampleSize: number
}

export function runSeededEndToEndFlow(now = '2026-07-11T10:00:00.000Z'): SeededFlowResult {
  const roster = createSeedRoster()
  const classRow = roster.classes[0]!
  const course = roster.courses[0]!
  const teacher = roster.users.find((u) => u.id === classRow.teacherUserId)!
  const learners = activeEnrollmentsForClass(roster, classRow.id).map((e) => e.learnerUserId)

  let scheduling = emptySchedulingState()
  const scheduled = createScheduledSession(scheduling, {
    classId: classRow.id,
    plannedStart: now,
    durationMinutes: 60,
  })
  if (!scheduled.ok) throw new Error(scheduled.error)
  scheduling = scheduled.state

  const started = startLearningSession(scheduling, {
    classId: classRow.id,
    scheduledSessionId: scheduled.value.id,
    at: now,
  })
  if (!started.ok) throw new Error(started.error)
  scheduling = started.state

  for (const learnerId of learners) {
    const att = recordAttendance(scheduling, {
      learningSessionId: started.value.id,
      learnerUserId: learnerId,
      status: 'present',
      at: now,
    })
    if (!att.ok) throw new Error(att.error)
    scheduling = att.state
  }

  let capture = createCaptureSession({
    learningSessionId: started.value.id,
    teacherUserId: teacher.id,
    learnerIds: learners,
    mode: 'question_first',
  })

  // Q1 → learner 0: Green → Done
  let q = addSessionQuestion(capture)
  if (!q.ok) throw new Error(q.error)
  capture = q.state
  let r = recordColorForCurrent(capture, 'green', now)
  if (!r.ok) throw new Error(r.error)
  capture = r.state
  r = resolveProbeForCurrent(capture, 'done', now)
  if (!r.ok) throw new Error(r.error)
  capture = r.state

  // Q2 → learner 1: Red
  q = addSessionQuestion(capture)
  if (!q.ok) throw new Error(q.error)
  capture = q.state
  r = recordColorForCurrent(capture, 'red', now)
  if (!r.ok) throw new Error(r.error)
  capture = r.state

  // Q3 → learner 2: Orange then correct to Purple
  q = addSessionQuestion(capture)
  if (!q.ok) throw new Error(q.error)
  capture = q.state
  r = recordColorForCurrent(capture, 'orange', now)
  if (!r.ok) throw new Error(r.error)
  capture = r.state

  const attempt2 = capture.attempts.find((a) => a.learnerUserId === learners[2])!
  const corrected = applyLifecycleCommand(attempt2.snapshot, {
    type: 'correct',
    color: 'purple',
    reason: 'Mis-tap during demo',
    at: now,
    actorId: teacher.id,
  })
  if (!corrected.ok) throw new Error(corrected.error)
  capture = {
    ...capture,
    attempts: capture.attempts.map((a) =>
      a.id === attempt2.id ? { ...a, snapshot: corrected.snapshot } : a,
    ),
  }

  const completed = completeLearningSession(scheduling, started.value.id, learners, now)
  if (!completed.ok) throw new Error(completed.error)
  scheduling = completed.state
  capture = markSessionCompleted(capture)

  let ledger: ResultRecord[] = []
  for (const a of capture.attempts) {
    if (!a.snapshot.effectiveColor) continue
    ledger = appendResult(ledger, {
      organizationId: roster.organization.id,
      courseId: course.id,
      classId: classRow.id,
      learningSessionId: started.value.id,
      learnerUserId: a.learnerUserId,
      teacherUserId: teacher.id,
      sessionQuestionId: a.sessionQuestionId,
      effectiveColor: a.snapshot.effectiveColor,
      enteredProbeFlow: a.snapshot.enteredProbeFlow,
      probeEventCount: a.snapshot.probeCount,
      finalizedAt: a.snapshot.finalizedAt ?? now,
    })
  }

  const window = resolveReportWindow({
    kind: 'course',
    courseStart: classRow.startsOn ?? '2026-07-01',
    courseEnd: '2026-12-31',
  })
  const report = buildCourseProgressReport(ledger, course.id, window, {
    learnerIds: learners,
  })
  const sample =
    report.overall.current.find((m) => m.key === 'rac')?.sampleSize ?? 0

  if (sample !== 4) {
    throw new Error(`Expected 4 measured steps in report, got ${sample}`)
  }

  return {
    ok: true,
    roster,
    scheduling,
    capture,
    ledger,
    reportSampleSize: sample,
  }
}
