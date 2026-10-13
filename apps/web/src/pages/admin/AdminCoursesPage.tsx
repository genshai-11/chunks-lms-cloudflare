import { BookOpen, Check, Pencil, Plus, RotateCcw, School, Trash2, X, Archive } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import {
  activeEnrollmentsForClass,
  archiveCourse,
  createCourse,
  deleteCourse,
  restoreCourse,
  updateCourse,
} from '../../modules/roster/service'
import type { Course } from '../../modules/roster/types'
import { useAppState } from '../../state/useAppState'

type Draft = {
  code: string
  name: string
}

function emptyDraft(): Draft {
  return {
    code: '',
    name: '',
  }
}

function courseToDraft(c: Course): Draft {
  return {
    code: c.code,
    name: c.name,
  }
}

function CourseForm({
  draft,
  setDraft,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  draft: Draft
  setDraft: (fn: (d: Draft) => Draft) => void
  submitLabel: string
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <form
      className="course-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="course-form-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 2fr' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>
          Code
          <input
            value={draft.code}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            placeholder="ERE-Level-A"
            required
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>
          Name
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="ERE Level A"
            required
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
          />
        </label>
      </div>

      <div className="course-form-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" aria-hidden />
          <span>Cancel</span>
        </button>
        <button type="submit" className="btn primary">
          <Check className="h-3.5 w-3.5" aria-hidden />
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  )
}

export function AdminCoursesPage() {
  const { roster, setRoster } = useAppState()
  const { message, error, ok, err } = useFlash()
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  function openCreate() {
    setDraft(emptyDraft())
    setEditingId(null)
    setMode('create')
  }

  function openEdit(c: Course) {
    setDraft(courseToDraft(c))
    setEditingId(c.id)
    setMode('edit')
  }

  function closeForm() {
    setMode('list')
    setEditingId(null)
    setDraft(emptyDraft())
  }

  function saveCreate() {
    const r = createCourse(roster, {
      code: draft.code,
      name: draft.name,
    })
    if (!r.ok) return err(r.error)
    setRoster(r.state)
    ok(`Course ${r.value.code} created`)
    closeForm()
  }

  function saveEdit() {
    if (!editingId) return
    const r = updateCourse(roster, editingId, {
      code: draft.code,
      name: draft.name,
    })
    if (!r.ok) return err(r.error)
    setRoster(r.state)
    ok(`Course ${r.value.code} updated`)
    closeForm()
  }

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Courses"
        subtitle="Programs / Courses template list. Schedule and dates are customized at the Class level."
        actions={
          mode === 'list' ? (
            <button type="button" className="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              New course
            </button>
          ) : null
        }
      />
      <Flash message={message} error={error} />

      {mode !== 'list' ? (
        <section className="course-sheet">
          <header className="course-sheet-head">
            <h2 className="course-sheet-title">
              {mode === 'create' ? 'New course' : 'Edit course'}
            </h2>
            <button type="button" className="ghost" onClick={closeForm} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </header>
          <CourseForm
            draft={draft}
            setDraft={setDraft}
            submitLabel={mode === 'create' ? 'Create' : 'Save'}
            onSubmit={mode === 'create' ? saveCreate : saveEdit}
            onCancel={closeForm}
          />
        </section>
      ) : null}

      {roster.courses.length === 0 && mode === 'list' ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Create a course template first, then assign classes and schedules to it."
          action={
            <button type="button" className="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              New course
            </button>
          }
        />
      ) : mode === 'list' || roster.courses.length > 0 ? (
        <div className="course-list">
          {roster.courses.map((c) => {
            const classCount = roster.classes.filter((cl) => cl.courseId === c.id).length
            const seats = roster.classes
              .filter((cl) => cl.courseId === c.id)
              .reduce((n, cl) => n + activeEnrollmentsForClass(roster, cl.id).length, 0)

            return (
              <article
                key={c.id}
                className={`course-row${editingId === c.id ? ' is-active' : ''}`}
              >
                <div className="course-row-icon" aria-hidden>
                  <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                </div>

                <div className="course-row-body">
                  <div className="course-row-title">
                    <strong>{c.code}</strong>
                    <span>{c.name}</span>
                    <span className={`badge${c.status === 'active' ? ' success' : ''}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="course-row-meta">
                    {classCount} class{classCount === 1 ? '' : 'es'} · {seats} seats
                  </p>
                </div>

                <div className="course-row-actions">
                  <Link to="/admin/classes" className="btn ghost" title="Classes">
                    <School className="h-3.5 w-3.5" aria-hidden />
                    <span className="course-row-action-label">Classes</span>
                  </Link>
                  <button type="button" className="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    <span className="course-row-action-label">Edit</span>
                  </button>
                  {c.status === 'active' ? (
                    <button
                      type="button"
                      className="ghost"
                      title="Archive"
                      onClick={() => {
                        const r = archiveCourse(roster, c.id)
                        if (!r.ok) return err(r.error)
                        setRoster(r.state)
                        ok(`Archived ${c.code}`)
                      }}
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      title="Restore"
                      onClick={() => {
                        const r = restoreCourse(roster, c.id)
                        if (!r.ok) return err(r.error)
                        setRoster(r.state)
                        ok(`Restored ${c.code}`)
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost danger"
                    title="Delete"
                    onClick={() => {
                      if (!window.confirm(`Delete ${c.code}?`)) return
                      const r = deleteCourse(roster, c.id)
                      if (!r.ok) return err(r.error)
                      setRoster(r.state)
                      ok(`Deleted ${c.code}`)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
