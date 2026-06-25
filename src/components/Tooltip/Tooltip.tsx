import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: 'top' | 'bottom' | 'left'
  wide?: boolean
  className?: string
}

interface TipCoords {
  top: number
  left: number
}

function computeCoords(rect: DOMRect, position: 'top' | 'bottom' | 'left'): TipCoords {
  switch (position) {
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - 10 }
    case 'bottom':
      return { top: rect.bottom + 7, left: rect.left + rect.width / 2 }
    case 'top':
    default:
      return { top: rect.top - 7, left: rect.left + rect.width / 2 }
  }
}

export function Tooltip({ content, children, position = 'top', wide, className }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<TipCoords | null>(null)

  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) {
      setCoords(null)
      return
    }

    const update = () => {
      if (!wrapRef.current) return
      setCoords(computeCoords(wrapRef.current.getBoundingClientRect(), position))
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [visible, position])

  const tip =
    visible && coords
      ? createPortal(
          <span
            className={[styles.tip, styles.tipFixed, wide ? styles.wide : null]
              .filter(Boolean)
              .join(' ')}
            data-position={position}
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            {content}
          </span>,
          document.body,
        )
      : null

  return (
    <span
      ref={wrapRef}
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {tip}
    </span>
  )
}
