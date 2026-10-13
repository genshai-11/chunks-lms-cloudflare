import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterState } from './types'
import { createTeacherLearnerAndEnroll, resolveTeacherClassScope } from './teacher-workspace'

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ getSupabase: mocks.getSupabase }))

const roster: RosterState = {
  organization: { id: 'org-1', name: 'School' },
  users: [
    {
      id: 'admin-1',
      displayName: 'Admin Teacher Surface',
      email: 'admin@example.com',
      avatarUrl: null,
      roles: ['admin', 'teacher'],
      accountStatus: 'active',
    },
    {
      id: 'teacher-1',
      displayName: 'Assigned Teacher',
      email: 'teacher@example.com',
      avatarUrl: null,
      roles: ['teacher'],
      accountStatus: 'active',
    },
    {
      id: 'teacher-2',
      displayName: 'Other Teacher',
      email: 'other@example.com',
      avatarUrl: null,
      roles: ['teacher'],
      accountStatus: 'active',
    },
  ],
  courses: [
    { id: 'course-1', organizationId: 'org-1', code: 'C1', name: 'Course', status: 'active' },
  ],
  classes: [
    {
      id: 'class-1',
      courseId: 'course-1',
      name: 'Assigned class',
      capacity: 10,
      teacherUserId: 'teacher-1',
      status: 'active',
      startsOn: null,
      endsOn: null,
      schedule: null,
    },
    {
      id: 'class-2',
      courseId: 'course-1',
      name: 'Other class',
      capacity: 10,
      teacherUserId: 'teacher-2',
      status: 'active',
      startsOn: null,
      endsOn: null,
      schedule: null,
    },
  ],
  enrollments: [],
}

describe('resolveTeacherClassScope', () => {
  it('lets an Admin using the Teacher surface operate every visible class', () => {
    const scope = resolveTeacherClassScope(roster, 'ADMIN@example.com', true)
    expect(scope.teacher?.id).toBe('admin-1')
    expect(scope.classes.map((row) => row.id)).toEqual(['class-1', 'class-2'])
  })

  it('limits a Teacher-only account to its assigned classes', () => {
    const scope = resolveTeacherClassScope(roster, ' teacher@example.com ', false)
    expect(scope.teacher?.id).toBe('teacher-1')
    expect(scope.classes.map((row) => row.id)).toEqual(['class-1'])
  })

  it('fails closed when a Teacher session has no matching domain profile', () => {
    const scope = resolveTeacherClassScope(roster, 'missing@example.com', false)
    expect(scope.teacher).toBeUndefined()
    expect(scope.classes).toEqual([])
  })
})

describe('createTeacherLearnerAndEnroll', () => {
  beforeEach(() => mocks.getSupabase.mockReset())

  it('calls the narrow RPC with normalized form input', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        learnerId: 'learner-1',
        enrollmentId: 'enrollment-1',
        classId: 'class-1',
        displayName: 'Learner One',
        email: 'learner@example.com',
      },
      error: null,
    })
    mocks.getSupabase.mockReturnValue({ rpc })

    await expect(
      createTeacherLearnerAndEnroll({
        classId: 'class-1',
        displayName: ' Learner One ',
        email: ' learner@example.com ',
        avatarUrl: null,
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        learnerId: 'learner-1',
        enrollmentId: 'enrollment-1',
        classId: 'class-1',
        displayName: 'Learner One',
        email: 'learner@example.com',
      },
    })
    expect(rpc).toHaveBeenCalledWith('create_teacher_learner_and_enroll', {
      p_class_id: 'class-1',
      p_display_name: 'Learner One',
      p_email: 'learner@example.com',
      p_avatar_url: null,
    })
  })

  it('returns the safe database error without mutating local roster state', async () => {
    mocks.getSupabase.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'Teacher does not own this class' } }),
    })

    await expect(
      createTeacherLearnerAndEnroll({
        classId: 'other-class',
        displayName: 'Learner',
        email: 'learner@example.com',
        avatarUrl: null,
      }),
    ).resolves.toEqual({ ok: false, error: 'Teacher does not own this class' })
  })
})
