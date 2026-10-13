import { describe, expect, it } from 'vitest'
import { rolesForWorkspaceUser, userIdsForWorkspace } from './workspace-graph'

describe('workspace user graph', () => {
  it('loads learners referenced by enrollments even without organization membership rows', () => {
    const ids = userIdsForWorkspace(
      {
        classes: [
          {
            id: 'class-1',
            courseId: 'course-1',
            name: 'Class 1',
            capacity: 3,
            teacherUserId: 'teacher-1',
            status: 'active',
            startsOn: null,
            endsOn: null,
            schedule: null,
          },
        ],
        enrollments: [
          {
            id: 'enr-1',
            classId: 'class-1',
            learnerUserId: 'learner-1',
            status: 'active',
            startedAt: '2026-07-12T13:30:00.000Z',
            endedAt: null,
          },
        ],
      },
      ['admin-1'],
    )

    expect(Array.from(ids).sort()).toEqual(['admin-1', 'learner-1', 'teacher-1'])
  })

  it('derives learner and teacher roles from class/enrollment references', () => {
    expect(
      rolesForWorkspaceUser({
        userId: 'learner-1',
        membershipRoles: [],
        teacherUserIds: new Set(['teacher-1']),
        learnerUserIds: new Set(['learner-1']),
      }),
    ).toEqual(['learner'])
  })

  it('never returns an empty role list for loaded workspace users', () => {
    expect(
      rolesForWorkspaceUser({
        userId: 'legacy-user',
        membershipRoles: [],
        teacherUserIds: new Set(),
        learnerUserIds: new Set(),
      }),
    ).toEqual(['learner'])
  })
})
