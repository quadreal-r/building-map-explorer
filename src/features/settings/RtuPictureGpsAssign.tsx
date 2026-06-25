import { useEffect, useRef, useState } from 'react'
import { SettingsToolButton } from '@/features/settings/SettingsToolButton'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './SettingsModal.module.css'

export interface RtuPictureGpsAssignProps {
  onBusyChange?: (busy: boolean) => void
}

export function RtuPictureGpsAssign({ onBusyChange }: RtuPictureGpsAssignProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const stageFromFiles = usePendingRtuPictureStore((s) => s.stageFromFiles)
  const pendingCount = usePendingRtuPictureStore((s) => s.items.length)
  const clearPending = usePendingRtuPictureStore((s) => s.clear)
  const closeSettings = useUiStore((s) => s.closeSettings)

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const handleFiles = () => {
    void (async () => {
      const input = inputRef.current
      if (!input?.files?.length) return

      setBusy(true)
      try {
        const result = await stageFromFiles([...input.files])
        if (result.staged.length) {
          showToastSuccess(
            `✓ ${result.staged.length} photo marker${result.staged.length === 1 ? '' : 's'} placed on map — drag each onto the correct RTU`,
          )
          closeSettings()
        }
        if (result.skipped.length && !result.staged.length) {
          showToastError('No photos had GPS — enable location in your camera or use bulk filename import')
        } else if (result.skipped.length) {
          showToastSuccess(
            `${result.skipped.length} file${result.skipped.length === 1 ? '' : 's'} skipped (no GPS or not an image)`,
          )
        }
      } catch (error) {
        showToastError(error instanceof Error ? error.message : 'Failed to stage photos')
      } finally {
        setBusy(false)
        input.value = ''
      }
    })()
  }

  return (
    <div className={styles.bulkImport}>
      <SettingsToolButton
        tooltip={
          <>
            Select photos with GPS. Each appears as a purple marker where the photo was taken. Drag
            the marker onto the correct RTU — the picture is saved and renamed like 2320-RTU-06 Hybrid (3).jpg.
          </>
        }
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Reading GPS…' : 'Assign RTU Pictures by GPS (drag to RTU)'}
      </SettingsToolButton>
      {pendingCount > 0 ? (
        <p className={styles.hint}>
          {pendingCount} photo marker{pendingCount === 1 ? '' : 's'} waiting on the map.{' '}
          <button type="button" className={styles.linkBtn} onClick={() => clearPending()}>
            Clear all
          </button>
        </p>
      ) : (
        <p className={styles.hint}>
          Purple markers appear at photo GPS. Drop within 100 ft of an RTU marker to assign.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenFile}
        onChange={handleFiles}
      />
    </div>
  )
}
