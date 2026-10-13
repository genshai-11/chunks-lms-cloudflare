import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ProgressReportPanel } from './ProgressReportPanel'
import type { ResultRecord } from '../modules/reporting/progress'

const users = [
  {
    id: 'l1',
    displayName: 'Learner One',
    email: null,
    avatarUrl: null,
    roles: ['learner' as const],
    accountStatus: 'active' as const,
  },
]

const ledger: ResultRecord[] = [
  {
    id: '1',
    organizationId: 'org',
    courseId: 'course-1',
    classId: 'class-1',
    learningSessionId: 's1',
    learnerUserId: 'l1',
    teacherUserId: 't1',
    sessionQuestionId: 'q1',
    effectiveColor: 'green',
    enteredProbeFlow: true,
    probeEventCount: 1,
    finalizedAt: '2026-07-10T10:00:00.000Z',
  },
]

describe('ProgressReportPanel accessibility', () => {
  it('exposes heading, window controls, and metric table semantics', async () => {
    const user = userEvent.setup()
    render(
      <ProgressReportPanel
        title="Course progress"
        courseId="course-1"
        courseStart="2026-07-01"
        courseEnd="2026-12-31"
        ledger={ledger}
        users={users}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Course progress' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Window kind' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Metric observations' })).toBeInTheDocument()
    expect(screen.getByText(/operational indicators/i)).toBeInTheDocument()
    expect(screen.getAllByText('experimental').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'custom' }))
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByLabelText('End date')).toBeInTheDocument()
  }, 15000)

  it('renders learner-scoped report without by-learner table', () => {
    const { container } = render(
      <ProgressReportPanel
        title="My progress"
        courseId="course-1"
        courseStart="2026-07-01"
        ledger={ledger}
        users={users}
        learnerUserId="l1"
      />,
    )
    expect(screen.getByRole('heading', { name: 'My progress' })).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Learner progress"]')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'By learner' })).not.toBeInTheDocument()
  })
})
