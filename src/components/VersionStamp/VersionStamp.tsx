import { BUILD_VERSION, BUILD_VERSION_LABEL } from '@/generated/buildVersion'
import styles from './VersionStamp.module.css'

export interface VersionStampProps {
  /** Inline in the map topbar (default) or fixed for loading screens. */
  placement?: 'topbar' | 'fixed'
}

export function VersionStamp({ placement = 'topbar' }: VersionStampProps) {
  const label =
    BUILD_VERSION.build === 0 ? `v${BUILD_VERSION.date} (dev)` : BUILD_VERSION_LABEL

  return (
    <div
      className={`${styles.stamp}${placement === 'fixed' ? ` ${styles.fixed}` : ''}`}
      aria-label={`App version ${label}`}
    >
      {label}
    </div>
  )
}
