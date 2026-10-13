import { useMemo } from 'react'
import { Activity, CalendarClock, LayoutDashboard, Radio, TriangleAlert } from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel, StatCard } from '../../components/ui'
import { buildScheduledToday, buildSessionOpsBoard } from '../../modules/ops/board'
import { useAppState } from '../../state/useAppState'

export function AdminOpsPage() {
  const { roster, scheduling, ledger, capture } = useAppState()
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const todayBoard = useMemo(
    () => buildSessionOpsBoard(roster, scheduling, ledger, { day: today, capture }),
    [roster, scheduling, ledger, today, capture],
  )
  const allOpen = useMemo(
    () =>
      buildSessionOpsBoard(roster, scheduling, ledger, { capture }).filter(
        (r) => r.status === 'open',
      ),
    [roster, scheduling, ledger, capture],
  )
  const scheduled = useMemo(
    () => buildScheduledToday(roster, scheduling, today),
    [roster, scheduling, today],
  )

  const openProbes = allOpen.reduce((n, r) => n + r.openProbes, 0)
  const unfinished = allOpen.reduce((n, r) => n + r.unfinishedDrafts, 0)

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        kicker="Admin"
        title="Ops board"
        subtitle="Today’s sessions and open capture risk."
      />

      <div className="stat-grid">
        <StatCard
          icon={Radio}
          label="Live now"
          value={allOpen.length}
          hint={openProbes ? `${openProbes} open probe(s)` : 'No open probes'}
        />
        <StatCard
          icon={CalendarClock}
          label="Scheduled today"
          value={scheduled.length}
          hint="Not yet started"
        />
        <StatCard
          icon={Activity}
          label="Learning today"
          value={todayBoard.length}
          hint="Started sessions"
        />
        <StatCard
          icon={TriangleAlert}
          label="Unfinished drafts"
          value={unfinished}
          hint="In open capture"
        />
      </div>

      <Panel icon={Radio} title="Open learning sessions" description="Capture still in progress.">
        {allOpen.length === 0 ? (
          <EmptyState icon={Radio} title="No live sessions" description="Teachers start from Schedule." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Day</th>
                  <th>Class learners</th>
                  <th>Results</th>
                  <th>Risk</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {allOpen.map((row) => (
                  <tr key={row.learningSessionId}>
                    <td>
                      <strong>{row.className}</strong>
                      <div className="meta">{row.courseCode}</div>
                    </td>
                    <td className="font-mono text-xs">
                      {row.sessionNumber != null ? `Day ${row.sessionNumber}` : '—'}
                    </td>
                    <td>{row.seats}</td>
                    <td>{row.resultCount}</td>
                    <td>
                      {row.openProbes > 0 || row.unfinishedDrafts > 0 ? (
                        <span className="badge">
                          {row.openProbes} probe · {row.unfinishedDrafts} draft
                        </span>
                      ) : (
                        <span className="meta">ok</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {new Date(row.startedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        icon={CalendarClock}
        title="Scheduled today"
        description="Planned sessions that have not started."
      >
        {scheduled.length === 0 ? (
          <p className="meta">No remaining scheduled slots today.</p>
        ) : (
          <ul className="person-list">
            {scheduled.map((s) => (
              <li key={s.scheduledId} className="person-row">
                <div className="person-body">
                  <strong>
                    {s.className} · {s.courseCode}
                  </strong>
                  <span>
                    {new Date(s.plannedStart).toLocaleTimeString()}
                    {s.sessionNumber != null ? ` · Day ${s.sessionNumber}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
