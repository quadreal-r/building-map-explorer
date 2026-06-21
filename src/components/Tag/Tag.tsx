import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Tag.module.css'

export type TagVariant =
  | 'default'
  | 'sqft'
  | 'rtu'
  | 'tenant'
  | 'sold'
  | 'pm'
  | 'gps-bad'
  | 'ml'
  | 'old-rtu'
  | 'vacant'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant
  children: ReactNode
}

export function Tag({ variant = 'default', className, children, ...props }: TagProps) {
  const classes = [styles.tag, styles[variant], className].filter(Boolean).join(' ')

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}
