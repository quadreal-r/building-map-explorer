import { useState, type ReactNode } from 'react'
import styles from './Tooltip.module.css'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: 'top' | 'bottom'
  className?: string
}

export function Tooltip({ content, children, position = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible ? (
        <span className={styles.tip} data-position={position} role="tooltip">
          {content}
        </span>
      ) : null}
    </span>
  )
}
