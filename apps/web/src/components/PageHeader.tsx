import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  kicker?: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, icon: Icon, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <div className="page-header-title-row">
          {Icon ? (
            <span className="page-header-icon" aria-hidden>
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
          ) : null}
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}
