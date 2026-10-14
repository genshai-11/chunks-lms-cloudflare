import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Circle, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('chunks_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('chunks_sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className="workspace">
      <aside
        className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}
        style={{
          width: collapsed ? '4.75rem' : '16.5rem',
          transition: 'width 200ms ease, padding 200ms ease',
        }}
        aria-label={navLabel}
      >
        <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-slate-100/80 mb-2">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              {leading ? <div className="sidebar-leading mb-1">{leading}</div> : null}
              <div className="sidebar-label">{title}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition ${
              collapsed ? 'mx-auto' : 'ml-auto'
            }`}
            title={collapsed ? 'Mở rộng menu (Expand sidebar)' : 'Thu gọn menu (Collapse sidebar)'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>

        {!collapsed && subtitle ? <p className="sidebar-subtitle">{subtitle}</p> : null}
        {!collapsed && contextSlot ? <div className="sidebar-context">{contextSlot}</div> : null}
        {items.map((item) => {
          const Icon = item.icon ?? Circle
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' is-active' : ''}${collapsed ? ' justify-center px-0' : ''}`
              }
            >
              <Icon className="sidebar-icon" aria-hidden strokeWidth={2} />
              {!collapsed && <span className="sidebar-link-text">{item.label}</span>}
            </NavLink>
          )
        })}
        {!collapsed && footer ? <div className="sidebar-foot">{footer}</div> : null}
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
