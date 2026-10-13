import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, Panel } from '../../components/ui'
import { getLearnerStandaloneResults } from '../../lib/standalone-tests'
import { useAppState } from '../../state/useAppState'
import { useTeacherClassContext } from '../../hooks/useTeacherClassContext'
import { useStaffSession } from '../../auth/useStaffSession'

export function TeacherLearnerTestResultsPage() {
  const { learnerId } = useParams()
  const { roster } = useAppState()
  const staffSession = useStaffSession()
  const { options } = useTeacherClassContext()
  const [data, setData] = useState<{
    runCount: number
    averageLearnerCpdScore: number | null
    runs: Array<any>
  } | null>(null)
  const [error, setError] = useState('')

  const isDenied = useMemo(() => {
    if (!learnerId) return true
    if (staffSession.canAccess('admin')) return false
    const operableClassIds = new Set(options.map((o) => o.classRow.id))
    if (operableClassIds.size === 0) return true
    const activeEnrolls = roster.enrollments.filter(
      (e) => e.learnerUserId === learnerId && e.status === 'active',
    )
    return !activeEnrolls.some((e) => operableClassIds.has(e.classId))
  }, [learnerId, staffSession, options, roster.enrollments])

  useEffect(() => {
    if (!learnerId || isDenied) return
    void getLearnerStandaloneResults(learnerId).then((r) =>
      r.ok ? setData(r.data) : setError(r.error),
    )
  }, [learnerId, isDenied])

  if (isDenied) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Không có quyền truy cập"
        description="Học viên này không thuộc lớp học do bạn phụ trách. Bạn chỉ có thể xem kết quả bài test của học viên trong lớp của bạn."
        action={
          <Link to="/teacher" className="btn ghost">
            Quay lại Roster
          </Link>
        }
      />
    )
  }

  if (error) {
    return <EmptyState icon={BarChart3} title="Could not load Test Results" description={error} />
  }

  if (!data?.runs.length) {
    return (
      <>
        <div className="btn-row" role="tablist">
          <Link className="btn ghost" to={`/teacher/learner/${learnerId}`}>
            Profile & Session Results
          </Link>
          <Link className="btn primary" to={`/teacher/learner/${learnerId}/tests`}>
            Test Results
          </Link>
        </div>
        <EmptyState
          icon={BarChart3}
          title="No standalone Test Results"
          description="Class and Live Session results are intentionally not shown here."
        />
      </>
    )
  }

  return (
    <>
      <div className="btn-row" role="tablist">
        <Link className="btn ghost" to={`/teacher/learner/${learnerId}`}>
          Profile & Session Results
        </Link>
        <Link className="btn primary" to={`/teacher/learner/${learnerId}/tests`}>
          Test Results
        </Link>
      </div>
      <Panel
        icon={BarChart3}
        title="Standalone Test Results"
        description={`${data.runCount} run(s) · average Learner CPD ${data.averageLearnerCpdScore ?? '—'}`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Session</th>
                <th>CVR</th>
                <th>CCI / Ampe</th>
                <th>CPD</th>
                <th>Language</th>
                <th>Finalized</th>
                <th>Result colors</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.run_id}>
                  <td>
                    {run.package_title} · {run.version_label}
                  </td>
                  <td>{run.session_number}</td>
                  <td>{run.target_cvr_ohm}</td>
                  <td>
                    {run.cci_name} · {run.cci_value}
                  </td>
                  <td>{run.item_cpd}</td>
                  <td>{String(run.prompt_language).toUpperCase()}</td>
                  <td>{run.finalized_count}/10</td>
                  <td>
                    R {run.red_count} · Y {run.yellow_count} · G {run.green_count} · P{' '}
                    {run.purple_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
