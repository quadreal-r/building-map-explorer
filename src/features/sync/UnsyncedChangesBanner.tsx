import { useState } from 'react'
import { Tooltip } from '@/components/Tooltip/Tooltip'
import {
  discardLocalUnsyncedChanges,
  type DiscardLocalUnsyncedResult,
} from '@/lib/discardLocalUnsyncedChanges'
import { hardRefreshPreservingView } from '@/lib/hardRefresh'
import { formatUnsyncedChangesMessage, type UnsyncedChangeLine } from '@/lib/unsyncedChanges'
import { confirm } from '@/stores/confirmStore'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { useUiStore } from '@/stores/uiStore'
import styles from './UnsyncedChangesBanner.module.css'

export interface UnsyncedChangesBannerProps {
  lines: UnsyncedChangeLine[]
  onDiscarded?: (result: DiscardLocalUnsyncedResult) => void
}

function buildTooltipContent() {
  return (
    <div className={styles.tooltipBody}>
      <p className={styles.tooltipLead}>
        Sync with Cloudflare before closing this tab or these changes stay only on this computer
        and may be lost.
      </p>
    </div>
  )
}

export function UnsyncedChangesBanner({ lines, onDiscarded }: UnsyncedChangesBannerProps) {
  const openSettings = useUiStore((state) => state.openSettings)
  const [discarding, setDiscarding] = useState(false)

  if (!lines.length) return null

  const summary = formatUnsyncedChangesMessage(lines)

  const handleDiscard = () => {
    void (async () => {
      const discardSummary = lines
        .map((line) => (line.count != null ? `${line.label} (${line.count})` : line.label))
        .join('\n• ')
      if (
        !(await confirm(
          `Discard all unsynced changes on this browser?\n\n• ${discardSummary}\n\nThis reloads portfolio data from Cloudflare when available and removes local-only photos and edits. This cannot be undone.`,
        ))
      ) {
        return
      }

      setDiscarding(true)
      try {
        const result = await discardLocalUnsyncedChanges()
        onDiscarded?.(result)
        if (result.source === 'cloudflare') {
          showToastSuccess('✓ Discarded local changes — reloaded from Cloudflare')
        } else {
          showToastSuccess(
            '✓ Discarded local changes — Cloudflare unavailable, loaded bundled portfolio data',
          )
        }
      } catch (error) {
        showToastError(
          error instanceof Error ? error.message : 'Could not discard local changes',
          'Discard failed',
        )
      } finally {
        setDiscarding(false)
      }
    })()
  }

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Tooltip content={buildTooltipContent()} position="bottom" wide className={styles.tooltipWrap}>
        <div className={styles.summary} tabIndex={0}>
          <span className={styles.icon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.title}>Unsynced changes:</span>
          <span className={styles.details}>{summary}</span>
        </div>
      </Tooltip>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={hardRefreshPreservingView}
          title="Reload the app (Ctrl+Shift+R) and return to this map position"
        >
          Hard refresh
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleDiscard}
          disabled={discarding}
          title="Remove local-only edits and photos; reload from Cloudflare when available"
        >
          {discarding ? 'Discarding…' : 'Discard changes'}
        </button>
        <button type="button" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={openSettings}>
          Open Settings to sync
        </button>
      </div>
    </div>
  )
}
