import { Modal } from '@/components/Modal/Modal'
import { buildSummaryDeltas } from '@/lib/portfolioStats'
import {
  describeSyncSource,
  formatSyncTimestamp,
} from '@/lib/syncMeta'
import type { SyncMeta } from '@/types/syncMeta'
import type { SyncMetaSummary } from '@/types/syncMeta'
import styles from './RemoteSyncUpdateModal.module.css'

export interface RemoteSyncUpdateModalProps {
  open: boolean
  meta: SyncMeta | null
  localSummary: SyncMetaSummary | null
  loading?: boolean
  onDismiss: () => void
  onLoadUpdates: () => void
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  return String(delta)
}

export function RemoteSyncUpdateModal({
  open,
  meta,
  localSummary,
  loading = false,
  onDismiss,
  onLoadUpdates,
}: RemoteSyncUpdateModalProps) {
  if (!meta || !localSummary) return null

  const deltas = buildSummaryDeltas(localSummary, meta.summary)
  const uploadedPictures =
    meta.summary.picturesUploaded > 0 ? meta.summary.picturesUploaded : null

  return (
    <Modal open={open} onClose={onDismiss} title="New data synced elsewhere" width={480}>
      <div className={styles.body}>
        <p className={styles.lead}>
          Another computer uploaded portfolio changes to Cloudflare. Review the summary below, then
          load updates on this PC or dismiss if you already have the latest data.
        </p>

        <div className={styles.metaBox}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Uploaded</span>
            <span>{formatSyncTimestamp(meta.exportedAt)}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Source</span>
            <span>{describeSyncSource(meta.source)}</span>
          </div>
        </div>

        <div className={styles.summary}>
          <h3 className={styles.summaryTitle}>Upload summary</h3>
          {deltas.length > 0 ? (
            <ul className={styles.deltaList}>
              {deltas.map((line) => (
                <li key={line.label}>
                  <span className={styles.deltaLabel}>{line.label}</span>
                  <span className={styles.deltaValues}>
                    {line.before} → {line.after}
                    {line.delta !== 0 ? (
                      <span
                        className={
                          line.delta > 0 ? styles.deltaPositive : styles.deltaNegative
                        }
                      >
                        {' '}
                        ({formatDelta(line.delta)})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.noDelta}>
              Counts match your local copy, but the server snapshot is newer — load updates to
              replace local markers and schedule data with the uploaded version.
            </p>
          )}
          {uploadedPictures ? (
            <p className={styles.pictureNote}>
              {uploadedPictures} picture{uploadedPictures === 1 ? '' : 's'} included in this sync
              (manifest total: {meta.summary.manifestPictureCount}).
            </p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.dismissBtn} onClick={onDismiss} disabled={loading}>
            Dismiss
          </button>
          <button
            type="button"
            className={styles.loadBtn}
            onClick={onLoadUpdates}
            disabled={loading}
          >
            {loading ? 'Loading updates…' : 'Load updates on this PC'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
