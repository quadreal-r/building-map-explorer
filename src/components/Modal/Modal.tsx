import { useEffect, type ReactNode } from 'react'
import styles from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  align?: 'center' | 'right'
  width?: number | string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  align = 'center',
  width = 400,
}: ModalProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const panelStyle = { width: typeof width === 'number' ? `${width}px` : width }

  return (
    <div
      className={styles.overlay}
      data-align={align}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.panel} style={panelStyle} role="dialog" aria-modal="true">
        {title ? (
          <header className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
