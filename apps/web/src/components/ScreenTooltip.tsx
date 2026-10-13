import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ScreenTooltipProps {
  children: ReactNode
  content: ReactNode
  className?: string
  ariaLabel?: string
  width?: number
}

/**
 * ScreenTooltip renders a floating tooltip using React Portal to document.body.
 * This completely prevents:
 * 1. Stacking context traps (z-index wars)
 * 2. Overflow clipping by parent containers with overflow-y: auto / overflow: hidden
 * 3. Viewport collisions by clamping coordinates: 12px <= left <= (window.innerWidth - width - 12px)
 */
export function ScreenTooltip({
  children,
  content,
  className = '',
  ariaLabel,
  width = 280,
}: ScreenTooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; arrowLeft: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = Math.min(width, (typeof window !== 'undefined' ? window.innerWidth : 360) - 24)
    const targetLeft = rect.left + rect.width / 2 - tooltipWidth / 2
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 360) - tooltipWidth - 12
    const clampedLeft = Math.max(12, Math.min(targetLeft, Math.max(12, maxLeft)))
    const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - clampedLeft, tooltipWidth - 16))

    let top = rect.bottom + 8
    if (typeof window !== 'undefined' && top + 220 > window.innerHeight && rect.top - 200 > 10) {
      top = rect.top - 8
    }

    setCoords({ top, left: clampedLeft, arrowLeft })
  }, [width])

  const show = () => {
    updatePosition()
    setOpen(true)
  }
  const hide = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updatePosition])

  return (
    <>
      <span
        ref={triggerRef}
        className={`observe-has-tooltip ${className ? className : 'inline-flex items-center'}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
      >
        {children}
      </span>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="observe-screen-tooltip-portal observe-tooltip-rich"
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: `${Math.min(width, window.innerWidth - 24)}px`,
                zIndex: 99999,
                display: 'block',
                margin: 0,
                transform: 'none',
                backgroundColor: '#030712',
                opacity: 1,
              }}
              role="tooltip"
            >
              <div
                className="observe-tooltip-portal-arrow"
                style={{
                  position: 'absolute',
                  top: '-5px',
                  left: `${coords.arrowLeft}px`,
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: '10px',
                  height: '10px',
                  borderLeft: '1px solid rgba(255,255,255,0.15)',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                  backgroundColor: '#030712',
                }}
              />
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
