import { describe, expect, it } from 'vitest'
import { createSeedRoster } from './seed'
import { createClass, createLearnerAndEnroll, endEnrollment } from './service'
import {
  inviteCoverage,
  listLearnerEnrollmentOptions,
  listTeacherOperableClasses,
  resolveActiveClassId,
  resolveLearnerClassId,
} from './class-context'

describe('class-context', () => {
  it('lists operable teacher classes and resolves preferred id', () => {
    const seed = createSeedRoster()
    const teacherId = seed.users.find((u) => u.roles.includes('teacher'))!.id
    const second = createClass(seed, {
      courseId: seed.courses[0]!.id,
      name: 'Class B-2',
      teacherUserId: teacherId,
      capacity: 3,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const classes = listTeacherOperableClasses(second.state)
    expect(classes.length).toBeGreaterThanOrEqual(2)
    expect(resolveActiveClassId(classes, second.value.id)).toBe(second.value.id)
    expect(resolveActiveClassId(classes, 'missing')).toBe(classes[0]!.id)
  })

  it('lists learner enrollment options and resolves class', () => {
    const seed = createSeedRoster()
    const learner = seed.users.find((u) => u.roles.includes('learner'))!
    const opts = listLearnerEnrollmentOptions(seed, learner.id)
    expect(opts.length).toBeGreaterThanOrEqual(1)
    expect(resolveLearnerClassId(opts, opts[0]!.classRow.id)).toBe(opts[0]!.classRow.id)
    expect(resolveLearnerClassId(opts, 'nope')).toBe(opts[0]!.classRow.id)
  })

  it('computes invite coverage from seated learners with email', () => {
    let state = createSeedRoster()
    const classId = state.classes[0]!.id
    const cov = inviteCoverage(state)
    expect(cov.seats).toBe(3)
    expect(cov.withEmail).toBeGreaterThan(0)
    expect(cov.percent).toBeGreaterThan(0)

    // Free a seat and add learner without email → coverage drops if we strip emails
    const first = state.enrollments.find((e) => e.classId === classId && e.status === 'active')!
    const freed = endEnrollment(state, first.id)
    expect(freed.ok).toBe(true)
    if (!freed.ok) return
    state = freed.state
    const added = createLearnerAndEnroll(state, classId, {
      displayName: 'No Mail',
      email: 'nomail@example.com',
    })
    expect(added.ok).toBe(true)
  })
})
