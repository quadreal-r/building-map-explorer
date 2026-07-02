import type { ReactNode } from 'react'
import { SettingsHoverHelp } from '@/features/settings/SettingsHoverHelp'
import styles from './SettingsModal.module.css'

export interface SettingsSectionLabelProps {
  children: ReactNode
  help?: ReactNode
}

export function SettingsSectionLabel({ children, help }: SettingsSectionLabelProps) {
  if (!help) {
    return <div className={styles.sectionLabel}>{children}</div>
  }

  return (
    <SettingsHoverHelp content={help} className={styles.sectionLabelWrap}>
      <div className={styles.sectionLabel}>{children}</div>
    </SettingsHoverHelp>
  )
}
