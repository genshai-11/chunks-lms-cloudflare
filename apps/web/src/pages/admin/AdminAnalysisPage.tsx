import { useMemo, useState } from 'react'
import { ChartColumn } from 'lucide-react'
import { ClassContextSelect } from '../../components/ClassContextSelect'
import { PageHeader } from '../../components/PageHeader'
import { ProgressAnalysisView } from '../../components/ProgressAnalysisView'
import { EmptyState } from '../../components/ui'
import {
  listAdminClassOptions,
  resolveActiveClassId,
} from '../../modules/roster/class-context'
import { activeEnrollmentsForClass } from '../../modules/roster/service'
import { useAppState } from '../../state/useAppState'

/**
 * Org-wide progress: pick any class, reuse teacher analysis stack.
 */
export function AdminAnalysisPage() {
  const { roster, scheduling, ledger, metricSettings } = useAppState()
  const options = useMemo(() => listAdminClassOptions(roster), [roster])
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    resolveActiveClassId(
      options.map((o) => o.classRow),
      null,
    ),
  )

  const activeId = resolveActiveClassId(
    options.map((o) => o.classRow),
    selectedId,
  )
  const selected = options.find((o) => o.classRow.id === activeId) ?? null
  const classRow = selected?.classRow ?? null
  const course = selected?.course ?? null

  const learners = classRow
    ? activeEnrollmentsForClass(roster, classRow.id)
        .map((e) => roster.users.find((u) => u.id === e.learnerUserId))
        .filter(Boolean)
    : []

  if (!classRow || !course) {
    return (
      <>
        <PageHeader
          icon={ChartColumn}
          kicker="Admin"
          title="Analysis"
          subtitle="Pick a class after courses and enrollments exist."
        />
        <EmptyState
          icon={ChartColumn}
          title="No class to analyze"
          description="Create a course, class, and seat learners first."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        kicker="Admin"
        title="Analysis"
        subtitle={`${course.code} · ${classRow.name} · any class in the organization`}
        actions={
          <ClassContextSelect
            variant="admin"
            options={options}
            value={activeId}
            onChange={setSelectedId}
          />
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
        emptyHint="No finalized results for this class yet."
        metricSettings={metricSettings}
      />
    </>
  )
}
