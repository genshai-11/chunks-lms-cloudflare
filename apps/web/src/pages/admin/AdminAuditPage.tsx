import { useMemo, useState } from 'react'
import { History, PencilLine } from 'lucide-react'
import { Flash } from '../../components/Flash'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, Panel } from '../../components/ui'
import { useFlash } from '../../hooks/useFlash'
import { filterAuditEvents } from '../../modules/ops/audit'
import { effectiveResults, resultKey } from '../../modules/ops/effective-results'
import type { OpsAuditEventType } from '../../modules/ops/types'
import { SPECTRUM_COLORS, type ResultColor } from '../../modules/result-lifecycle/types'
import { useAppState } from '../../state/useAppState'
import { useStaffSession } from '../../auth/useStaffSession'

const COLORS: ResultColor[] = [...SPECTRUM_COLORS]

const TYPE_LABEL: Record<OpsAuditEventType, string> = {
  result_finalized: 'Finalized',
  result_corrected: 'Corrected',
  attendance_recorded: 'Attendance',
  session_completed: 'Session done',
}

export function AdminAuditPage() {
  const { roster, ledger, auditLog, correctResult } = useAppState()
  const session = useStaffSession()
  const { message, error, ok, err } = useFlash()
  const [classId, setClassId] = useState('')
  const [learnerId, setLearnerId] = useState('')
  const [type, setType] = useState<OpsAuditEventType | ''>('')
  const [q, setQ] = useState('')

  const [correctKey, setCorrectKey] = useState<string | null>(null)
  const [color, setColor] = useState<ResultColor>('green')
  const [reason, setReason] = useState('')

  const events = useMemo(
    () =>
      filterAuditEvents(auditLog, {
        classId: classId || undefined,
        learnerUserId: learnerId || undefined,
        type: type || undefined,
        q: q || undefined,
      }),
    [auditLog, classId, learnerId, type, q],
  )

  const effective = useMemo(() => effectiveResults(ledger), [ledger])
  const classes = roster.classes
  const learners = roster.users.filter((u) => u.roles.includes('learner'))

  function nameOf(id: string | null) {
    if (!id) return '—'
    return roster.users.find((u) => u.id === id)?.displayName ?? id.slice(0, 8)
  }

  function classNameOf(id: string) {
    return roster.classes.find((c) => c.id === id)?.name ?? id.slice(0, 8)
  }

  return (
    <>
      <PageHeader
        icon={History}
        kicker="Admin"
        title="Audit & corrections"
        subtitle="Finalize and correction history. Post-session corrections require a reason."
      />
      <Flash message={message} error={error} />

      <Panel icon={History} title="Filters" collapsible defaultOpen>
        <div className="form-grid">
          <label>
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Learner
            <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
              <option value="">All learners</option>
              {learners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OpsAuditEventType | '')}
            >
              <option value="">All types</option>
              <option value="result_finalized">Finalized</option>
              <option value="result_corrected">Corrected</option>
            </select>
          </label>
          <label className="form-span-full">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="reason, color…"
            />
          </label>
        </div>
      </Panel>

      <Panel
        icon={History}
        title="Event log"
        description={`${events.length} event(s)`}
      >
        {events.length === 0 ? (
          <EmptyState
            icon={History}
            title="No audit events yet"
            description="Finalized results from live sessions appear here; corrections append history."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Class</th>
                  <th>Learner</th>
                  <th>Color</th>
                  <th>Reason / note</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td>{TYPE_LABEL[e.type] ?? e.type}</td>
                    <td>{classNameOf(e.classId)}</td>
                    <td>{nameOf(e.learnerUserId)}</td>
                    <td>
                      {e.previousColor ? (
                        <span>
                          <span className={`color-pill is-${e.previousColor}`}>
                            {e.previousColor}
                          </span>
                          {' → '}
                        </span>
                      ) : null}
                      {e.color ? (
                        <span className={`color-pill is-${e.color}`}>{e.color}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{e.reason ?? '—'}</td>
                    <td>{nameOf(e.actorId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        icon={PencilLine}
        title="Correct a finalized result"
        description="Append-only — prior color stays in the ledger and audit log."
      >
        {effective.length === 0 ? (
          <EmptyState
            icon={PencilLine}
            title="No finalized results"
            description="Complete an observation session first."
          />
        ) : (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              if (!correctKey) return err('Select a result')
              const actorId = session.userId ?? 'admin'
              const r = correctResult({
                resultKey: correctKey,
                color,
                reason,
                actorId,
              })
              if (!r.ok) return err(r.error)
              ok('Correction recorded')
              setReason('')
              setCorrectKey(null)
            }}
          >
            <label className="form-span-full">
              Result
              <select
                value={correctKey ?? ''}
                onChange={(e) => setCorrectKey(e.target.value || null)}
                required
              >
                <option value="">Select finalized result…</option>
                {effective.map((r) => (
                  <option key={resultKey(r)} value={resultKey(r)}>
                    {classNameOf(r.classId)} · {nameOf(r.learnerUserId)} · {r.effectiveColor} ·{' '}
                    {new Date(r.finalizedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              New color
              <select
                value={color}
                onChange={(e) => setColor(e.target.value as ResultColor)}
              >
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-span-full">
              Reason (required)
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="Why is this being corrected?"
              />
            </label>
            <button type="submit" className="primary">
              <PencilLine className="h-4 w-4" aria-hidden />
              <span>Apply correction</span>
            </button>
          </form>
        )}
      </Panel>
    </>
  )
}
