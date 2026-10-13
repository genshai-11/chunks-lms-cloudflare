import { useMemo, useState } from 'react'
import {
  Ban,
  GraduationCap,
  ImagePlus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { readImageAsDataUrl } from '../lib/readImageFile'
import {
  activeEnrollmentsForClass,
  createLearnerAndEnroll,
  endEnrollment,
  enrollLearner,
  learnersAvailableForClass,
} from '../modules/roster/service'
import { useAppState } from '../state/useAppState'
import { UserAvatar } from './UserAvatar'
import { EmptyState } from './ui'

type Props = {
  classId: string
  /** Compact embed under a course card */
  compact?: boolean
  onMessage?: (msg: string) => void
  onError?: (msg: string) => void
}

/**
 * Seat learners into a class from Courses/Classes admin workflow:
 * - list roster with avatars
 * - enroll existing directory learner
 * - quick-add new learner (profile + seat)
 */
export function ClassStudentsPanel({ classId, compact, onMessage, onError }: Props) {
  const { roster, setRoster, syncNow } = useAppState()
  const klass = roster.classes.find((c) => c.id === classId)
  const [existingId, setExistingId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAvatar, setNewAvatar] = useState<string | null>(null)
  const [tab, setTab] = useState<'existing' | 'new'>('new')

  const active = useMemo(
    () => (klass ? activeEnrollmentsForClass(roster, klass.id) : []),
    [roster, klass],
  )
  const available = useMemo(
    () => (klass ? learnersAvailableForClass(roster, klass.id) : []),
    [roster, klass],
  )
  if (!klass) {
    return <EmptyState icon={Users} title="Class not found" />
  }

  const full = active.length >= klass.capacity
  const seatsLabel = `${active.length}/${klass.capacity} seats`
  const missingEmail = active.filter((e) => {
    const u = roster.users.find((x) => x.id === e.learnerUserId)
    return !u?.email?.trim()
  }).length

  function ok(msg: string) {
    onMessage?.(msg)
  }
  function err(msg: string) {
    onError?.(msg)
  }

  return (
    <div className={`class-students${compact ? ' is-compact' : ''}`}>
      <div className="class-students-head">
        <div>
          <p className="class-students-title">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Students in {klass.name}
          </p>
          <p className="meta">
            {seatsLabel}
            {klass.status !== 'active' ? ' · class not active' : ''}
            {missingEmail > 0 ? ` · ${missingEmail} missing email` : ''}
          </p>
        </div>
        <span className={`badge${full ? '' : ' success'}`}>{seatsLabel}</span>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add a student to seat them in this class."
        />
      ) : (
        <ul className="person-list class-students-list">
          {active.map((e) => {
            const user = roster.users.find((u) => u.id === e.learnerUserId)
            return (
              <li key={e.id} className="person-row">
                <UserAvatar
                  name={user?.displayName ?? e.learnerUserId}
                  avatarUrl={user?.avatarUrl}
                  size="md"
                />
                <div className="person-body">
                  <strong>{user?.displayName ?? e.learnerUserId}</strong>
                  <span>
                    {user?.email ?? 'No email'}
                  </span>
                </div>
                <div className="row-actions">
                  {klass.status === 'active' ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => {
                        if (
                          !window.confirm(`Remove ${user?.displayName ?? 'learner'} from class?`)
                        ) {
                          return
                        }
                        const r = endEnrollment(roster, e.id)
                        if (!r.ok) return err(r.error)
                        setRoster(r.state)
                        void syncNow({ roster: r.state })
                        ok(`${user?.displayName ?? 'Learner'} removed from class`)
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden />
                      <span>Remove</span>
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {klass.status === 'active' ? (
        <div className="class-students-add">
          <div className="subnav class-students-tabs" role="tablist" aria-label="Add student">
            <button
              type="button"
              role="tab"
              className={tab === 'new' ? 'is-active' : undefined}
              aria-selected={tab === 'new'}
              onClick={() => setTab('new')}
            >
              New student
            </button>
            <button
              type="button"
              role="tab"
              className={tab === 'existing' ? 'is-active' : undefined}
              aria-selected={tab === 'existing'}
              onClick={() => setTab('existing')}
            >
              From directory
            </button>
          </div>

          {tab === 'new' ? (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault()
                if (full) return err(`Class is full (${klass.capacity})`)
                const r = createLearnerAndEnroll(roster, klass.id, {
                  displayName: newName,
                  email: newEmail,
                  avatarUrl: newAvatar,
                })
                if (!r.ok) return err(r.error)
                setRoster(r.state)
                void syncNow({ roster: r.state })
                ok(`${r.value.learner.displayName} seated`)
                setNewName('')
                setNewEmail('')
                setNewAvatar(null)
              }}
            >
              <div className="form-span-full avatar-field">
                <UserAvatar name={newName || 'Student'} avatarUrl={newAvatar} size="lg" />
                <div className="avatar-field-actions">
                  <label className="btn ghost avatar-file-label">
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                    <span>{newAvatar ? 'Change photo' : 'Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (ev) => {
                        const file = ev.target.files?.[0]
                        ev.target.value = ''
                        if (!file) return
                        try {
                          setNewAvatar(await readImageAsDataUrl(file))
                        } catch (error) {
                          err(error instanceof Error ? error.message : 'Could not read image')
                        }
                      }}
                    />
                  </label>
                  {newAvatar ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => setNewAvatar(null)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      <span>Remove</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <label>
                Name
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="Learner name"
                  disabled={full}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="learner@school.edu"
                  disabled={full}
                />
              </label>
              <p className="meta form-span-full">
                Email is optional for learner contact and account matching.
              </p>
              <button type="submit" className="primary" disabled={full}>
                <UserPlus className="h-4 w-4" aria-hidden />
                <span>Add &amp; seat</span>
              </button>
            </form>
          ) : (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault()
                if (!existingId) return err('Select a learner')
                if (full) return err(`Class is full (${klass.capacity})`)
                const r = enrollLearner(roster, klass.id, existingId)
                if (!r.ok) return err(r.error)
                const learner = roster.users.find((u) => u.id === existingId)
                const name = learner?.displayName ?? 'Learner'
                setRoster(r.state)
                void syncNow({ roster: r.state })
                ok(`${name} enrolled`)
                setExistingId('')
              }}
            >
              <label className="form-span-full">
                Learner
                <select
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                  disabled={full || available.length === 0}
                  required
                >
                  <option value="">
                    {available.length === 0 ? 'No other learners in directory' : 'Select learner…'}
                  </option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                      {u.email ? ` · ${u.email}` : ' · no email'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="primary"
                disabled={full || available.length === 0 || !existingId}
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                <span>Enroll</span>
              </button>
            </form>
          )}

          {full ? (
            <p className="meta class-students-full">
              Class is full. Raise capacity or remove a student to add more.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="meta">Restore the class to add or remove students.</p>
      )}
    </div>
  )
}
