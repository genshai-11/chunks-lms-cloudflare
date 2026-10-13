import { describe, expect, it } from 'vitest'
import type { PolicyActor } from '../identity/access-policy'
import {
  canAccessOrgStorage,
  canSubscribeRealtimeTopic,
  canSubscribeToClassSnapshots,
  subscribeToClassSnapshots,
} from './snapshot-channel'

const org = 'org-a'
const teacher: PolicyActor = {
  userId: 'teacher-a',
  organizationIds: [org],
  rolesByOrg: { [org]: ['teacher'] },
}
const learner: PolicyActor = {
  userId: 'learner-1',
  organizationIds: [org],
  rolesByOrg: { [org]: ['learner'] },
}
const outsider: PolicyActor = {
  userId: 'x',
  organizationIds: ['org-b'],
  rolesByOrg: { 'org-b': ['teacher'] },
}

const classScope = {
  organizationId: org,
  teacherUserId: 'teacher-a',
  learnerUserIds: ['learner-1'],
}

describe('realtime and storage authorization', () => {
  it('allows assigned teacher class snapshot subscription; denies learner and outsider', () => {
    expect(canSubscribeToClassSnapshots(teacher, classScope)).toBe(true)
    expect(canSubscribeToClassSnapshots(learner, classScope)).toBe(false)
    expect(canSubscribeToClassSnapshots(outsider, classScope)).toBe(false)
  })

  it('returns auth error when learner tries to subscribe', () => {
    const sub = subscribeToClassSnapshots({
      client: null,
      classId: 'class-1',
      actor: learner,
      classScope,
      onChange: () => {},
    })
    expect(sub.error).toMatch(/not authorized/i)
  })

  it('mirrors RLS for storage and realtime topics', () => {
    expect(canAccessOrgStorage(teacher, org)).toBe(true)
    expect(canAccessOrgStorage(outsider, org)).toBe(false)
    expect(canAccessOrgStorage(learner, org, 'learner-1')).toBe(true)
    expect(canAccessOrgStorage(learner, org, 'learner-2')).toBe(false)

    expect(
      canSubscribeRealtimeTopic(teacher, {
        kind: 'class_snapshots',
        organizationId: org,
        teacherUserId: 'teacher-a',
      }),
    ).toBe(true)
    expect(
      canSubscribeRealtimeTopic(learner, {
        kind: 'class_snapshots',
        organizationId: org,
        teacherUserId: 'teacher-a',
      }),
    ).toBe(false)
  })
})
