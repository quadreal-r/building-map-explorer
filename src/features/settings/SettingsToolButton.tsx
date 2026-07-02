import type { ReactNode } from 'react'
import { SettingsHoverHelp } from '@/features/settings/SettingsHoverHelp'

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
    <SettingsHoverHelp content={tooltip}>
      <button
        type="button"
        className={`btn-action${variant === 'export' ? ' btn-save' : ''}`}
        style={{ width: '100%', justifyContent: 'flex-start', position: 'relative', overflow: 'hidden' }}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </SettingsHoverHelp>
  )
}
