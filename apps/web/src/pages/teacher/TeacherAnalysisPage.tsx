import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { ProgressAnalysisView } from '../../components/ProgressAnalysisView'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { activeEnrollmentsForClass } from '../../modules/roster/service'
import { useAppState } from '../../state/useAppState'
import { getSupabase } from '../../lib/supabase'

export function TeacherAnalysisPage() {
  const {
    roster,
    scheduling,
    setScheduling,
    ledger,
    setLedger,
    syncNow,
    metricSettings,
  } = useAppState()
  const { classRow, course } = useTeacherClassContext()

  const deleteSession = async (sessionId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this live session? All question captures and attendance for this session will be permanently deleted.',
      )
    ) {
      return
    }

    const nextScheduling = {
      ...scheduling,
      learningSessions: scheduling.learningSessions.filter((s) => s.id !== sessionId),
      attendance: scheduling.attendance.filter((a) => a.learningSessionId !== sessionId),
    }
    const nextLedger = ledger.filter((r) => r.learningSessionId !== sessionId)

    setScheduling(nextScheduling)
    setLedger(nextLedger)

    try {
      const sb = getSupabase()
      if (sb) {
        await sb.from('learning_sessions').delete().eq('id', sessionId)
      }
      await syncNow({ scheduling: nextScheduling, pruneMissing: true })
    } catch (e) {
      console.warn('Session delete sync failed:', e)
    }
  }

  const editSessionNumber = async (sessionId: string, sessionNumber: number) => {
    const nextScheduling = {
      ...scheduling,
      learningSessions: scheduling.learningSessions.map((s) =>
        s.id === sessionId ? { ...s, sessionNumber } : s
      ),
    }

    setScheduling(nextScheduling)

    try {
      const sb = getSupabase()
      if (sb) {
        await (sb.from('learning_sessions') as any)
          .update({ session_number: sessionNumber })
          .eq('id', sessionId)
      }
      await syncNow({ scheduling: nextScheduling })
    } catch (e) {
      console.warn('Session update sync failed:', e)
    }
  }

  const learners = classRow
    ? activeEnrollmentsForClass(roster, classRow.id)
        .map((e) => roster.users.find((u) => u.id === e.learnerUserId))
        .filter(Boolean)
    : []

  if (!course || !classRow) {
    return (
      <>
        <PageHeader kicker="Teacher" title="Analysis & progress" />
        <div className="empty-state">
          Assign a class and course first (Admin). Use the class switcher when you teach more than
          one.
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle={`${course.code} · ${classRow.name} · focus on RFC/%c by day & learner`}
        actions={
          <Link to="/teacher/session" className="btn ghost">
            Session
          </Link>
        }
      />
      <ProgressAnalysisView
        mode="teacher"
        courseId={course.id}
        courseCode={course.code}
        courseStart={classRow.startsOn ?? '2026-07-01'}
        courseEnd={classRow.endsOn}
        classId={classRow.id}
        className={classRow.name}
        totalDays={classRow.schedule?.sessionCount ?? null}
        ledger={ledger}
        users={[
          ...learners.filter((u): u is NonNullable<typeof u> => Boolean(u)),
          ...roster.users.filter((u) => u.roles.includes('teacher')),
        ]}
        learningSessions={scheduling.learningSessions
          .filter((s) => s.classId === classRow.id)
          .map((s) => ({
            id: s.id,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            sessionNumber: s.sessionNumber,
          }))}
        emptyHint="Start a live session and finalize Focus / Awareness colors to populate this report."
        metricSettings={metricSettings}
        learnerUserId={undefined}
        onDeleteSession={deleteSession}
        onEditSessionNumber={editSessionNumber}
      />
    </>
  )
}
