import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Circle, Menu } from 'lucide-react'
import type { SectionTab } from './SectionTabs'

type Props = {
  title: string
  subtitle?: string
  /** Optional avatar or badge shown above the sidebar title */
  leading?: ReactNode
  /** Class switcher or other context control under subtitle */
  contextSlot?: ReactNode
  navLabel: string
  items: SectionTab[]
  footer?: string
}

export function RoleWorkspace({
  title,
  subtitle,
  leading,
  contextSlot,
  navLabel,
  items,
  footer,
}: Props) {
  const location = useLocation()
  const [mobileExpanded, setMobileExpanded] = useState(false)

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label={navLabel}>
        {leading ? <div className="sidebar-leading">{leading}</div> : null}
        <div className="sidebar-label">{title}</div>
        {subtitle ? <p className="sidebar-subtitle">{subtitle}</p> : null}
        {contextSlot ? <div className="sidebar-context">{contextSlot}</div> : null}
        {items.map((item) => {
          const Icon = item.icon ?? Circle
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
            >
              <Icon className="sidebar-icon" aria-hidden strokeWidth={1.75} />
              {item.label}
            </NavLink>
          )
        })}
        {footer ? <div className="sidebar-foot">{footer}</div> : null}
      </aside>

      <div className="workspace-main">
        <nav className={`mobile-nav${mobileExpanded ? ' is-expanded' : ''}`} aria-label={navLabel}>
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => setMobileExpanded((value) => !value)}
            aria-expanded={mobileExpanded}
            title={mobileExpanded ? 'Hide labels' : 'Show menu labels'}
          >
            <Menu className="h-4 w-4" aria-hidden />
            <span className="mobile-nav-label">{title}</span>
          </button>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                onClick={() => setMobileExpanded(false)}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden strokeWidth={1.75} /> : null}
                <span className="mobile-nav-label">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        {contextSlot ? <div className="mobile-class-context">{contextSlot}</div> : null}
        <div className="page">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="stack-lg"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
