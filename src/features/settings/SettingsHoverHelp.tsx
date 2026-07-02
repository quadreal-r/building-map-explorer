import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './SettingsModal.module.css'

export interface SettingsHoverHelpProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

interface PopupCoords {
  top: number
  left: number
}

function computeCoords(rect: DOMRect): PopupCoords {
  return { top: rect.top + rect.height / 2, left: rect.left - 14 }
}

export function SettingsHoverHelp({ content, children, className }: SettingsHoverHelpProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<PopupCoords | null>(null)

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setCoords(null)
      return
    }

    const update = () => {
      if (!wrapRef.current) return
      setCoords(computeCoords(wrapRef.current.getBoundingClientRect()))
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const popup =
    open && coords
      ? createPortal(
          <div
            className={styles.helpPopup}
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={wrapRef}
      className={[styles.hoverHelpWrap, className].filter(Boolean).join(' ')}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {popup}
    </div>
  )
}
