import { useId, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Inbox, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { UserAvatar } from './UserAvatar'

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: LucideIcon
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <p className="stat-label">{label}</p>
        {Icon ? (
          <span className="stat-icon" aria-hidden>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        ) : null}
      </div>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  )
}

export function Panel({
  title,
  description,
  icon: Icon = LayoutGrid,
  actions,
  children,
  className = '',
  collapsible = true,
  defaultOpen = true,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** When true, header toggles body visibility */
  collapsible?: boolean
  /** Initial open state (only when collapsible) */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const expanded = collapsible ? open : true

  return (
    <section
      className={`panel ${expanded ? 'is-open' : 'is-collapsed'} ${className}`.trim()}
    >
      <div className="panel-header">
        {collapsible ? (
          <button
            type="button"
            className="panel-toggle"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="panel-icon" aria-hidden>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <span className="panel-header-text">
              <h2 className="panel-title">{title}</h2>
              {description && expanded ? (
                <span className="panel-desc">{description}</span>
              ) : null}
            </span>
            <ChevronDown
              className={`panel-chevron ${expanded ? 'is-open' : ''}`}
              aria-hidden
              strokeWidth={2}
            />
          </button>
        ) : (
          <div className="panel-header-main">
            <span className="panel-icon" aria-hidden>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <div className="panel-header-text">
              <h2 className="panel-title">{title}</h2>
              {description ? <p className="panel-desc">{description}</p> : null}
            </div>
          </div>
        )}

        {actions ? (
          <div
            className="panel-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>

      {collapsible ? (
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              id={bodyId}
              key="panel-body"
              className="panel-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className="panel-body-inner">{children}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <div id={bodyId} className="panel-body">
          <div className="panel-body-inner">{children}</div>
        </div>
      )}
    </section>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function PersonRow({
  name,
  meta,
  avatarUrl,
  icon: Icon,
  actions,
}: {
  name: string
  meta?: string
  avatarUrl?: string | null
  icon?: LucideIcon
  actions?: ReactNode
}) {
  return (
    <li className="person-row">
      {Icon && !avatarUrl ? (
        <span className="person-avatar" aria-hidden>
          <Icon className="h-3 w-3" strokeWidth={1.75} />
        </span>
      ) : (
        <UserAvatar name={name} avatarUrl={avatarUrl} size="md" className="person-avatar-slot" />
      )}
      <div className="person-body">
        <strong>{name}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      {actions ? <div className="row-actions">{actions}</div> : null}
    </li>
  )
}

export function NavTile({
  to,
  step,
  title,
  description,
  icon: Icon,
  cta = 'Open',
}: {
  to: string
  step?: string
  title: string
  description: string
  icon: LucideIcon
  cta?: string
}) {
  return (
    <Link className="list-card" to={to}>
      <span className="list-card-icon" aria-hidden>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="list-card-body">
        <strong>
          {step ? <span className="list-step">{step}</span> : null}
          {title}
        </strong>
        <span>{description}</span>
      </div>
      <span className="list-card-meta">{cta}</span>
    </Link>
  )
}
