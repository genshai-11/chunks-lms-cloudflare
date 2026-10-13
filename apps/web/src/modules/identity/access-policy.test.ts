import { describe, expect, it } from 'vitest'
import {
  canManageCourse,
  canReadEnrollment,
  canReadLearnerAssessment,
  canReadOrganization,
  filterVisible,
  type PolicyActor,
} from './access-policy'

const orgA = 'org-a'
const orgB = 'org-b'

const adminA: PolicyActor = {
  userId: 'admin-a',
  organizationIds: [orgA],
  rolesByOrg: { [orgA]: ['admin'] },
}

const teacherA: PolicyActor = {
  userId: 'teacher-a',
  organizationIds: [orgA],
  rolesByOrg: { [orgA]: ['teacher'] },
}

const learner1: PolicyActor = {
  userId: 'learner-1',
  organizationIds: [orgA],
  rolesByOrg: { [orgA]: ['learner'] },
}

const learner2: PolicyActor = {
  userId: 'learner-2',
  organizationIds: [orgA],
  rolesByOrg: { [orgA]: ['learner'] },
}

const outsider: PolicyActor = {
  userId: 'outsider',
  organizationIds: [orgB],
  rolesByOrg: { [orgB]: ['admin'] },
}

describe('RLS-equivalent access policy', () => {
  it('denies cross-organization organization reads', () => {
    expect(canReadOrganization(outsider, { organizationId: orgA })).toBe(false)
    expect(canReadOrganization(adminA, { organizationId: orgA })).toBe(true)
  })

  it('denies cross-organization course management', () => {
    expect(canManageCourse(outsider, { organizationId: orgA })).toBe(false)
    expect(canManageCourse(adminA, { organizationId: orgA })).toBe(true)
    expect(canManageCourse(teacherA, { organizationId: orgA })).toBe(false)
  })

  it('denies learner reading another learner enrollment/assessment', () => {
    const row = {
      organizationId: orgA,
      learnerUserId: 'learner-1',
      teacherUserId: 'teacher-a',
    }
    expect(canReadEnrollment(learner1, row)).toBe(true)
    expect(canReadEnrollment(learner2, row)).toBe(false)
    expect(canReadLearnerAssessment(learner2, row)).toBe(false)
    expect(canReadLearnerAssessment(teacherA, row)).toBe(true)
    expect(canReadLearnerAssessment(adminA, row)).toBe(true)
    expect(canReadLearnerAssessment(outsider, row)).toBe(false)
  })

  it('filters collections so only authorized rows remain', () => {
    const rows = [
      {
        organizationId: orgA,
        learnerUserId: 'learner-1',
        teacherUserId: 'teacher-a',
      },
      {
        organizationId: orgA,
        learnerUserId: 'learner-2',
        teacherUserId: 'teacher-a',
      },
      {
        organizationId: orgB,
        learnerUserId: 'learner-x',
        teacherUserId: 'teacher-b',
      },
    ]
    const visible = filterVisible(rows, learner1, canReadLearnerAssessment)
    expect(visible).toHaveLength(1)
    expect(visible[0]?.learnerUserId).toBe('learner-1')
  })
})
