import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export type SectionTab = {
  to: string
  label: string
  end?: boolean
  icon?: LucideIcon
}

type Props = {
  ariaLabel: string
  tabs: SectionTab[]
}

export function SectionTabs({ ariaLabel, tabs }: Props) {
  return (
    <nav className="section-tabs" aria-label={ariaLabel}>
      <div className="section-tabs-track" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              role="tab"
              className={({ isActive }) => `section-tab${isActive ? ' is-active' : ''}`}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
              {tab.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
