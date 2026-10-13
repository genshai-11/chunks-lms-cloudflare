import { BookOpen, ChartColumn, Gauge, GraduationCap, LayoutDashboard, Link2, RotateCcw, Trash2, Users } from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { NavTile, Panel, StatCard } from '../../components/ui'
import { listLearners, listTeachers } from '../../modules/roster/service'
import { useAppState } from '../../state/useAppState'

export function AdminOverviewPage() {
  const { roster, ledger, resetAll, deleteAllLearningData, metricSettings, backendStatus } = useAppState()
  const teachers = listTeachers(roster)
  const learners = listLearners(roster)
  const activeTeachers = teachers.filter((u) => (u.accountStatus ?? 'active') === 'active').length
  const activeLearners = learners.filter((u) => (u.accountStatus ?? 'active') === 'active').length
  const inviteReady = learners.filter(
    (u) => u.email && (u.accountStatus ?? 'active') === 'active',
  ).length
  const metricsOn = metricSettings.metrics.filter((m) => m.enabled).length

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        kicker="Admin"
        title="Admin workspace"
        subtitle="Manage accounts, courses, classes, and the metric catalog. Teachers only assign class labels and run live sessions."
        actions={
          <div className="page-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (!window.confirm('Clear local cache only? Cloud data may reload later.')) return
                resetAll()
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span>Clear local</span>
            </button>
            <button
              type="button"
              className="danger"
              disabled={backendStatus === 'syncing'}
              onClick={async () => {
                const phrase = window.prompt(
                  'This permanently deletes ALL old learning data, learners, classes, courses, sessions, attendance, and assessment history from cloud + this browser. Staff accounts are kept. Type DELETE to confirm.',
                )
                if (phrase !== 'DELETE') return
                await deleteAllLearningData()
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              <span>{backendStatus === 'syncing' ? 'Deleting…' : 'Delete ALL old data'}</span>
            </button>
          </div>
        }
      />

      <div className="stat-grid">
        <StatCard
          icon={Users}
          label="Teachers"
          value={`${activeTeachers}/${teachers.length}`}
          hint="Active / total"
        />
        <StatCard
          icon={Users}
          label="Learners"
          value={`${activeLearners}/${learners.length}`}
          hint="Active / total"
        />
        <StatCard
          icon={Link2}
          label="Invites ready"
          value={inviteReady}
          hint="Active learners with email"
        />
        <StatCard
          icon={Gauge}
          label="Metrics on"
          value={metricsOn}
          hint="Shown on learner/teacher charts"
        />
        <StatCard
          icon={ChartColumn}
          label="Results"
          value={ledger.length}
          hint="Finalized observations (real ledger)"
        />
      </div>

      <Panel
        icon={LayoutDashboard}
        title="Do next"
        description="Admin owns Programs/Courses and Classes; Teacher only uses assigned class labels."
      >
        <div className="list-cards">
          <NavTile
            to="/admin/people"
            step="1"
            title="Accounts"
            description="Add teacher/learner accounts and manage active/inactive status."
            icon={Users}
          />
          <NavTile
            to="/admin/courses"
            step="2"
            title="Courses"
            description="Create and edit program/course templates."
            icon={BookOpen}
          />
          <NavTile
            to="/admin/classes"
            step="3"
            title="Classes"
            description="Create class labels, assign teacher, start date, capacity, and session plan."
            icon={GraduationCap}
          />
          <NavTile
            to="/admin/metrics"
            step="4"
            title="Metrics"
            description="Enable RFC, %c, chunks count / max chunks number / avg chunks number for charts."
            icon={Gauge}
          />
          <NavTile
            to="/admin/analysis"
            title="Analysis"
            description="Org-wide progress from finalized ledger (no mock data)."
            icon={ChartColumn}
            cta="Open"
          />
        </div>
      </Panel>
    </>
  )
}
