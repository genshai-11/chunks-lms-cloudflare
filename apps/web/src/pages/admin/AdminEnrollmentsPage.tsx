import { useMemo, useState } from 'react'
import { Ban, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { UserAvatar } from '../../components/UserAvatar'
import { EmptyState, Panel } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import {
  deleteEnrollment,
  endEnrollment,
  enrollLearner,
  listLearners,
} from '../../modules/roster/service'
import { useAppState } from '../../state/useAppState'

export function AdminEnrollmentsPage() {
  const { roster, setRoster } = useAppState()
  const { message, error, ok, err } = useFlash()
  const learners = useMemo(() => listLearners(roster), [roster])
  const activeClasses = roster.classes.filter((c) => c.status === 'active')
  const [enrollClassId, setEnrollClassId] = useState(activeClasses[0]?.id ?? '')
  const [enrollLearnerId, setEnrollLearnerId] = useState('')

  return (
    <>
      <PageHeader
        icon={UserPlus}
        kicker="Admin"
        title="Enrollments"
        subtitle="Seat learners, end memberships, or purge ended history."
      />
      <Flash message={message} error={error} />

      <Panel
        icon={UserPlus}
        title="Enrollment list"
        description="Ending keeps history. Delete only after ending."
      >
        {roster.enrollments.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No enrollments yet"
            description="Enroll a learner into a class below."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Learner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.enrollments.map((e) => {
                  const cl = roster.classes.find((c) => c.id === e.classId)
                  const learner = roster.users.find((u) => u.id === e.learnerUserId)
                  return (
                    <tr key={e.id}>
                      <td className="font-medium text-slate-800">{cl?.name ?? e.classId}</td>
                      <td>
                        <span className="cell-with-avatar">
                          <UserAvatar
                            name={learner?.displayName ?? e.learnerUserId}
                            avatarUrl={learner?.avatarUrl}
                            size="sm"
                          />
                          <span>{learner?.displayName ?? e.learnerUserId}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`badge${e.status === 'active' ? ' success' : ''}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{e.startedAt.slice(0, 10)}</td>
                      <td className="font-mono text-xs">{e.endedAt?.slice(0, 10) ?? '—'}</td>
                      <td>
                        <div className="row-actions">
                          {e.status === 'active' ? (
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                const r = endEnrollment(roster, e.id)
                                if (!r.ok) return err(r.error)
                                setRoster(r.state)
                                ok('Enrollment ended (history preserved)')
                              }}
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden />
                              <span>End</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  const r = enrollLearner(roster, e.classId, e.learnerUserId)
                                  if (!r.ok) return err(r.error)
                                  setRoster(r.state)
                                  ok('Enrollment reactivated')
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                <span>Re-enroll</span>
                              </button>
                              <button
                                type="button"
                                className="ghost danger"
                                onClick={() => {
                                  if (!window.confirm('Permanently delete this enrollment row?')) {
                                    return
                                  }
                                  const r = deleteEnrollment(roster, e.id)
                                  if (!r.ok) return err(r.error)
                                  setRoster(r.state)
                                  ok('Enrollment history deleted')
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="panel-footer-form">
          <p className="panel-title mb-3">Enroll learner</p>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              const r = enrollLearner(roster, enrollClassId, enrollLearnerId)
              if (!r.ok) return err(r.error)
              setRoster(r.state)
              ok('Learner enrolled')
              setEnrollLearnerId('')
            }}
          >
            <label>
              Class
              <select value={enrollClassId} onChange={(e) => setEnrollClassId(e.target.value)}>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Learner
              <select
                value={enrollLearnerId}
                onChange={(e) => setEnrollLearnerId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary">
              <UserPlus className="h-4 w-4" aria-hidden />
              <span>Enroll</span>
            </button>
          </form>
        </div>
      </Panel>
    </>
  )
}
