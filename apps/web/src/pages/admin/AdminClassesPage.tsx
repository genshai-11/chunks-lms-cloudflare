import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleStop,
  Pencil,
  Plus,
  RotateCcw,
  School,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { ClassStudentsPanel } from '../../components/ClassStudentsPanel'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import {
  activeEnrollmentsForClass,
  createClass,
  deleteClass,
  endClass,
  listTeachers,
  restoreClass,
  updateClass,
} from '../../modules/roster/service'
import type { Class } from '../../modules/roster/types'
import { useAppState } from '../../state/useAppState'

type Draft = {
  name: string
  courseId: string
  teacherUserId: string
  capacity: number
}

export function AdminClassesPage() {
  const { roster, setRoster } = useAppState()
  const { message, error, ok, err } = useFlash()
  const teachers = useMemo(() => listTeachers(roster), [roster])
  const activeCourses = roster.courses.filter((c) => c.status === 'active')

  const [createDraft, setCreateDraft] = useState<Draft>({
    name: '',
    courseId: activeCourses[0]?.id ?? '',
    teacherUserId: teachers[0]?.id ?? '',
    capacity: 3,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>({
    name: '',
    courseId: '',
    teacherUserId: '',
    capacity: 3,
  })
  const [studentsOpenId, setStudentsOpenId] = useState<string | null>(null)

  function startEdit(cl: Class) {
    setEditingId(cl.id)
    setStudentsOpenId(null)
    setEditDraft({
      name: cl.name,
      courseId: cl.courseId,
      teacherUserId: cl.teacherUserId,
      capacity: cl.capacity,
    })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  return (
    <>
      <PageHeader
        icon={School}
        kicker="Admin"
        title="Classes"
        subtitle="Create a class, assign a teacher, then add students on the roster."
      />
      <Flash message={message} error={error} />

      <Panel
        icon={School}
        title="Class list"
        description="One teacher per class. Expand Students to seat learners (new or from directory)."
      >
        {roster.classes.length === 0 ? (
          <EmptyState
            icon={School}
            title="No classes yet"
            description="Create a class after you have an active course and teacher."
          />
        ) : (
          <div className="class-cards">
            {roster.classes.map((cl) => {
              const course = roster.courses.find((c) => c.id === cl.courseId)
              const teacher = roster.users.find((u) => u.id === cl.teacherUserId)
              const active = activeEnrollmentsForClass(roster, cl.id).length
              const full = active >= cl.capacity
              const studentsOpen = studentsOpenId === cl.id
              const isEditing = editingId === cl.id

              return (
                <article
                  key={cl.id}
                  className={`class-card${studentsOpen ? ' is-open' : ''}${cl.status !== 'active' ? ' is-ended' : ''}`}
                >
                  {isEditing ? (
                    <div className="class-card-edit">
                      <div className="form-grid">
                        <label>
                          Name
                          <input
                            className="row-input"
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, name: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Course
                          <select
                            className="row-input"
                            value={editDraft.courseId}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, courseId: e.target.value }))
                            }
                          >
                            {roster.courses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} ({c.status})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Teacher
                          <select
                            className="row-input"
                            value={editDraft.teacherUserId}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, teacherUserId: e.target.value }))
                            }
                          >
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Capacity
                          <input
                            className="row-input w-20"
                            type="number"
                            min={1}
                            value={editDraft.capacity}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                capacity: Number(e.target.value),
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            const r = updateClass(roster, cl.id, {
                              name: editDraft.name,
                              courseId: editDraft.courseId,
                              teacherUserId: editDraft.teacherUserId,
                              capacity: editDraft.capacity,
                            })
                            if (!r.ok) return err(r.error)
                            setRoster(r.state)
                            ok(`Class ${r.value.name} updated`)
                            cancelEdit()
                          }}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          <span>Save</span>
                        </button>
                        <button type="button" className="ghost" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5" aria-hidden />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="class-card-main">
                        <div className="class-card-identity">
                          <span className="class-card-icon" aria-hidden>
                            <School className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <div>
                            <h3 className="class-card-name">{cl.name}</h3>
                            <p className="class-card-meta">
                              <span className="font-mono">{course?.code ?? cl.courseId}</span>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="h-3 w-3" aria-hidden />
                                {teacher?.displayName ?? 'No teacher'}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="class-card-stats">
                          <span className={`badge${full ? '' : ' success'}`}>
                            {active}/{cl.capacity} students
                          </span>
                          <span className={`badge${cl.status === 'active' ? ' success' : ''}`}>
                            {cl.status}
                          </span>
                        </div>
                      </div>

                      <div className="class-card-actions">
                        <button
                          type="button"
                          className={studentsOpen ? 'primary' : 'ghost'}
                          aria-expanded={studentsOpen}
                          onClick={() =>
                            setStudentsOpenId((id) => (id === cl.id ? null : cl.id))
                          }
                        >
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          <span>Students</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform${studentsOpen ? ' rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                        <button type="button" className="ghost" onClick={() => startEdit(cl)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          <span>Edit</span>
                        </button>
                        {cl.status === 'active' ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `End class ${cl.name}? Active enrollments will be ended.`,
                                )
                              ) {
                                return
                              }
                              const r = endClass(roster, cl.id)
                              if (!r.ok) return err(r.error)
                              setRoster(r.state)
                              ok(`Class ${cl.name} ended`)
                              setStudentsOpenId(null)
                            }}
                          >
                            <CircleStop className="h-3.5 w-3.5" aria-hidden />
                            <span>End</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              const r = restoreClass(roster, cl.id)
                              if (!r.ok) return err(r.error)
                              setRoster(r.state)
                              ok(`Class ${cl.name} restored`)
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            <span>Restore</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete class ${cl.name}? Only works without enrollment history.`,
                              )
                            ) {
                              return
                            }
                            const r = deleteClass(roster, cl.id)
                            if (!r.ok) return err(r.error)
                            setRoster(r.state)
                            ok(`Class ${cl.name} deleted`)
                            if (studentsOpenId === cl.id) setStudentsOpenId(null)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          <span>Delete</span>
                        </button>
                      </div>

                      {studentsOpen ? (
                        <div className="class-card-students">
                          <ClassStudentsPanel
                            classId={cl.id}
                            onMessage={ok}
                            onError={err}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <div className="panel-footer-form">
          <p className="panel-title mb-3">Create class</p>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              const r = createClass(roster, {
                courseId: createDraft.courseId,
                name: createDraft.name,
                teacherUserId: createDraft.teacherUserId,
                capacity: createDraft.capacity,
              })
              if (!r.ok) return err(r.error)
              setRoster(r.state)
              ok(`Class ${r.value.name} created — open Students to add learners`)
              setCreateDraft((d) => ({ ...d, name: '' }))
              setStudentsOpenId(r.value.id)
            }}
          >
            <label>
              Name
              <input
                value={createDraft.name}
                onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
                required
                placeholder="e.g. Class A-1"
              />
            </label>
            <label>
              Course
              <select
                value={createDraft.courseId}
                onChange={(e) => setCreateDraft((d) => ({ ...d, courseId: e.target.value }))}
              >
                {activeCourses.length === 0 ? (
                  <option value="">Create a course first</option>
                ) : (
                  activeCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Teacher
              <select
                value={createDraft.teacherUserId}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, teacherUserId: e.target.value }))
                }
              >
                {teachers.length === 0 ? (
                  <option value="">Add a teacher in People</option>
                ) : (
                  teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Capacity
              <input
                type="number"
                min={1}
                value={createDraft.capacity}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, capacity: Number(e.target.value) }))
                }
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!createDraft.courseId || !createDraft.teacherUserId}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span>Create class</span>
            </button>
          </form>
        </div>
      </Panel>
    </>
  )
}
