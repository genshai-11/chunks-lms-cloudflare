import { useMemo, useState } from 'react'
import { CalendarRange, ChartColumn, Filter } from 'lucide-react'
import {
  buildCourseProgressReport,
  buildLearnerProgressReport,
  formatDelta,
  formatMetricValue,
  type ResultRecord,
} from '../modules/reporting/progress'
import {
  resolveReportWindow,
  type ReportWindow,
  type ReportWindowKind,
} from '../modules/reporting/report-window'
import type { DomainUser } from '../modules/roster/types'
import { Panel } from './ui'
import { UserAvatar } from './UserAvatar'

type Props = {
  title: string
  courseId: string
  courseStart: string
  courseEnd?: string | null
  ledger: ResultRecord[]
  users: DomainUser[]
  learnerUserId?: string
  learningSessions?: Array<{
    id: string
    startedAt: string
    completedAt: string | null
    sessionNumber?: number | null
  }>
}

function tryResolveWindow(input: {
  kind: ReportWindowKind
  courseStart: string
  courseEnd?: string | null
  customStart: string
  customEnd: string
  sessionId: string
  learningSessions: Props['learningSessions']
}): { window: ReportWindow | null; error: string | null } {
  try {
    const { kind, courseStart, courseEnd, customStart, customEnd, sessionId, learningSessions } =
      input
    if (kind === 'course') {
      return {
        window: resolveReportWindow({
          kind: 'course',
          courseStart,
          courseEnd: courseEnd ?? '2026-12-31',
        }),
        error: null,
      }
    }
    if (kind === 'week') {
      return {
        window: resolveReportWindow({ kind: 'week', anchor: `${customStart}T12:00:00.000Z` }),
        error: null,
      }
    }
    if (kind === 'month') {
      return {
        window: resolveReportWindow({ kind: 'month', anchor: `${customStart}T12:00:00.000Z` }),
        error: null,
      }
    }
    if (kind === 'session') {
      const sessions = learningSessions ?? []
      const session = sessions.find((s) => s.id === sessionId) ?? sessions[0]
      if (!session) {
        return {
          window: resolveReportWindow({
            kind: 'course',
            courseStart,
            courseEnd: courseEnd ?? '2026-12-31',
          }),
          error: null,
        }
      }
      return {
        window: resolveReportWindow({
          kind: 'session',
          learningSessionId: session.id,
          sessionStartedAt: session.startedAt,
          sessionEndedAt: session.completedAt,
        }),
        error: null,
      }
    }
    return {
      window: resolveReportWindow({
        kind: 'custom',
        start: `${customStart}T00:00:00.000Z`,
        end: `${customEnd}T23:59:59.999Z`,
      }),
      error: null,
    }
  } catch (e) {
    return { window: null, error: e instanceof Error ? e.message : 'Invalid window' }
  }
}

export function ProgressReportPanel({
  title,
  courseId,
  courseStart,
  courseEnd,
  ledger,
  users,
  learnerUserId,
  learningSessions = [],
}: Props) {
  const [kind, setKind] = useState<ReportWindowKind>('course')
  const [customStart, setCustomStart] = useState('2026-07-01')
  const [customEnd, setCustomEnd] = useState('2026-07-31')
  const [sessionId, setSessionId] = useState(learningSessions[0]?.id ?? '')

  const { window, error } = useMemo(
    () =>
      tryResolveWindow({
        kind,
        courseStart,
        courseEnd,
        customStart,
        customEnd,
        sessionId,
        learningSessions,
      }),
    [kind, customStart, customEnd, sessionId, courseStart, courseEnd, learningSessions],
  )

  const courseReport = useMemo(() => {
    if (!window || learnerUserId) return null
    return buildCourseProgressReport(ledger, courseId, window, {
      learnerIds: users.filter((u) => u.roles.includes('learner')).map((u) => u.id),
    })
  }, [window, ledger, courseId, learnerUserId, users])

  const learnerReport = useMemo(() => {
    if (!window || !learnerUserId) return null
    return buildLearnerProgressReport(ledger, learnerUserId, window, { courseId })
  }, [window, ledger, courseId, learnerUserId])

  const metrics = learnerReport?.comparison ?? courseReport?.overall ?? null

  return (
    <Panel
      icon={ChartColumn}
      title={title}
      description="Operational indicators · sample sizes always shown"
      defaultOpen
    >
      <div className="window-controls" role="group" aria-label="Report window">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="font-display text-xs font-bold text-slate-500">Report window</span>
        </div>
        <div className="btn-row my-0" role="group" aria-label="Window kind">
          {(['course', 'session', 'week', 'month', 'custom'] as ReportWindowKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={kind === k ? 'active' : undefined}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
        {(kind === 'week' || kind === 'month' || kind === 'custom') && (
          <div className="form-grid">
            <label>
              {kind === 'custom' ? 'Start date' : 'Anchor date'}
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            {kind === 'custom' && (
              <label>
                End date
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            )}
          </div>
        )}
        {kind === 'session' && learningSessions.length > 0 && (
          <label className="field mt-3">
            Learning session
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              aria-label="Select learning session"
            >
              {learningSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionNumber != null ? `Buổi ${s.sessionNumber}` : s.id.slice(0, 8)}
                  {' · '}
                  {new Date(s.startedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p className="banner err" role="alert">
          {error}
        </p>
      )}

      {window && (
        <p className="meta inline-flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          <span>
            Window: <strong className="text-slate-800">{window.label}</strong> ·{' '}
            {window.start.slice(0, 10)} → {window.end.slice(0, 10)}
          </span>
        </p>
      )}

      {metrics && (
        <div className="table-wrap mt-3">
          <table aria-label="Metric observations">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Value</th>
                <th scope="col">n</th>
                <th scope="col">vs prior</th>
                <th scope="col">Status</th>
                <th scope="col">Definition</th>
              </tr>
            </thead>
            <tbody>
              {metrics.current.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="font-mono text-xs font-bold uppercase text-slate-700">
                    {m.key}
                  </th>
                  <td className="font-mono font-semibold text-slate-900">{formatMetricValue(m)}</td>
                  <td className="font-mono text-slate-600">{m.sampleSize}</td>
                  <td className="font-mono text-slate-600">
                    {formatDelta(m.key, metrics.deltas[m.key])}
                  </td>
                  <td>
                    {m.status === 'experimental' ? (
                      <span className="badge experimental">experimental</span>
                    ) : (
                      <span className="badge">{m.status}</span>
                    )}
                  </td>
                  <td className="def">{m.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {courseReport && (
        <>
          <div className="mt-6 border-b border-slate-100 pb-3">
            <h3 className="panel-title">By learner</h3>
          </div>
          <div className="table-wrap mt-3">
            <table aria-label="Learner progress">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">%c</th>
                  <th scope="col">RFC</th>
                </tr>
              </thead>
              <tbody>
                {courseReport.byLearner.map((row) => {
                  const user = users.find((u) => u.id === row.learnerUserId)
                  const rac = row.comparison.current.find((m) => m.key === 'rac')
                  const rfc = row.comparison.current.find((m) => m.key === 'rfc')
                  return (
                    <tr key={row.learnerUserId}>
                      <td className="font-medium text-slate-800">
                        <span className="cell-with-avatar">
                          <UserAvatar
                            name={user?.displayName ?? row.learnerUserId}
                            avatarUrl={user?.avatarUrl}
                            size="sm"
                          />
                          <span>{user?.displayName ?? row.learnerUserId}</span>
                        </span>
                      </td>
                      <td className="font-mono">{row.attemptCount}</td>
                      <td className="font-mono font-semibold">
                        {rac ? formatMetricValue(rac) : '—'}
                      </td>
                      <td className="font-mono font-semibold">
                        {rfc ? formatMetricValue(rfc) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}
