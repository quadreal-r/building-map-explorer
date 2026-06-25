import type { ReactNode } from 'react'
import { Tooltip } from '@/components/Tooltip/Tooltip'
import tooltipStyles from '@/components/Tooltip/Tooltip.module.css'
import styles from './SettingsModal.module.css'

export interface SettingsToolButtonProps {
  children: ReactNode
  tooltip: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'export'
}

export function SettingsToolButton({
  children,
  tooltip,
  onClick,
  disabled,
  variant = 'default',
}: SettingsToolButtonProps) {
  return (
    <Tooltip
      content={tooltip}
      position="left"
      wide
      className={`${tooltipStyles.wrapBlock} ${styles.toolBtnWrap}`}
    >
      <button
        type="button"
        className={`btn-action${variant === 'export' ? ' btn-save' : ''}`}
        style={{ width: '100%', justifyContent: 'flex-start', position: 'relative', overflow: 'hidden' }}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </Tooltip>
  )
}
