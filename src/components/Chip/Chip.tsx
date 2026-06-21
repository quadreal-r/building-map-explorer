import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Chip.module.css'

export type ChipVariant = 'default' | 'dq-gps' | 'dq-rtu' | 'dq-vacant' | 'dq-ml' | 'adv-yes' | 'adv-no' | 'adv-any'

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  variant?: ChipVariant
  children: ReactNode
}

export function Chip({
  active = false,
  variant = 'default',
  className,
  children,
  type = 'button',
  ...props
}: ChipProps) {
  const classes = [
    styles.chip,
    active && styles.active,
    variant !== 'default' && styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  )
}
