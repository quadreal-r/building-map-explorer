import { useUiStore } from '@/stores/uiStore'
import type { UnsyncedChangeLine } from '@/lib/unsyncedChanges'
import styles from './UnsyncedChangesBanner.module.css'

export interface UnsyncedChangesBannerProps {
  lines: UnsyncedChangeLine[]
}

export function UnsyncedChangesBanner({ lines }: UnsyncedChangesBannerProps) {
  const openSettings = useUiStore((state) => state.openSettings)

  if (!lines.length) return null

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.content}>
        <div className={styles.text}>
          <strong className={styles.title}>Unsynced changes on this browser</strong>
          <p className={styles.lead}>
            Sync with Cloudflare before closing this tab or these changes stay only on this
            computer and may be lost.
          </p>
          <ul className={styles.list}>
            {lines.map((line) => (
              <li key={line.id}>
                {line.label}
                {line.count != null ? ` (${line.count})` : null}
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className={styles.syncBtn} onClick={openSettings}>
          Open Settings to sync
        </button>
      </div>
    </div>
  )
}
