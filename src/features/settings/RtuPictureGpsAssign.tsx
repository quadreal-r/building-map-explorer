import { useEffect, useRef, useState } from 'react'
import { SettingsToolButton } from '@/features/settings/SettingsToolButton'
import { RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { confirm } from '@/stores/confirmStore'
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

  const handleClearPending = () => {
    if (pendingCount === 0) return
    void confirm(
      `Remove ${pendingCount} photo marker${pendingCount === 1 ? '' : 's'} from the map and start over?`,
    ).then((ok) => {
      if (!ok) return
      clearPending()
      showToastSuccess('Photo markers cleared — choose Upload RTU Pictures when ready.')
    })
  }

  const handleFiles = () => {
    void (async () => {
      const input = inputRef.current
      if (!input?.files?.length) return

      setBusy(true)
      try {
        const result = await stageFromFiles([...input.files])
        if (result.staged.length) {
          showToastSuccess(
            `✓ ${result.staged.length} photo marker${result.staged.length === 1 ? '' : 's'} on map — drag onto an RTU pin, or click the RTU pin → Assign pending photo`,
          )
          closeSettings()
        }
        if (result.skipped.length && !result.staged.length) {
          showToastError('No photos had GPS — enable location in your camera settings')
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
            Select RTU photos from your device. Photos with GPS are placed on the map at the
            exact coordinates from the photo. Double-click a marker for full size. Drag onto
            the correct RTU pin to assign, or click the RTU pin &rarr; Assign pending photo. Saved as
            e.g. 2320-RTU-04-1.jpg (within {RTU_PICTURE_DROP_FEET} ft). Turn off Edit Multiple Positions first.
            Photos without GPS are skipped. A new upload replaces any markers
            still waiting on the map.
          </>
        }
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Reading photos…' : 'Upload RTU Pictures'}
      </SettingsToolButton>
      {pendingCount > 0 ? (
        <SettingsToolButton
          tooltip="Remove all pending photo markers from the map so you can upload a fresh batch."
          onClick={handleClearPending}
          disabled={busy}
        >
          Clear photo markers ({pendingCount})
        </SettingsToolButton>
      ) : null}
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
