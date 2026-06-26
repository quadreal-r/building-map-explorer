import { useCallback, useEffect, useState } from 'react'
import { listRtuPictures, saveRtuPictureEdit } from '@/lib/rtuPictures'
import { showToastError, showToastSuccess } from '@/lib/toast'
import type { RtuPictureViewerItem } from '@/stores/uiStore'
import { useImageEditor } from './useImageEditor'
import styles from './RtuPictureViewer.module.css'

export type { RtuPictureViewerItem }

export interface RtuPictureViewerProps {
  open: boolean
  pictures: RtuPictureViewerItem[]
  index: number
  rtuName: string
  buildingAddress: string
  onClose: () => void
  onIndexChange: (index: number) => void
  onPicturesUpdated: (pictures: RtuPictureViewerItem[], index?: number) => void
}

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
  'Comic Sans MS',
]

export function RtuPictureViewer({
  open,
  pictures,
  index,
  rtuName,
  buildingAddress,
  onClose,
  onIndexChange,
  onPicturesUpdated,
}: RtuPictureViewerProps) {
  const current = pictures[index]
  const total = pictures.length
  const editor = useImageEditor()
  const [savingToMap, setSavingToMap] = useState(false)

  const revokeBlobUrls = useCallback((items: RtuPictureViewerItem[]) => {
    for (const pic of items) {
      if (pic.fullUrl.startsWith('blob:')) URL.revokeObjectURL(pic.fullUrl)
      if (pic.thumbUrl.startsWith('blob:') && pic.thumbUrl !== pic.fullUrl) {
        URL.revokeObjectURL(pic.thumbUrl)
      }
    }
  }, [])

  const handleSaveToMap = useCallback(async () => {
    if (!current || savingToMap || !editor.canSaveToMap) return
    setSavingToMap(true)
    try {
      const blob = await editor.getEditedBlob('image/jpeg', editor.quality)
      if (!blob) throw new Error('No image to save')
      await saveRtuPictureEdit(buildingAddress, rtuName, current.index, blob, current.fileName)
      revokeBlobUrls(pictures)
      const nextPictures = await listRtuPictures(buildingAddress, rtuName)
      const items = nextPictures.map((p) => ({
        fileName: p.fileName,
        fullUrl: p.fullUrl,
        thumbUrl: p.thumbUrl,
        index: p.index,
      }))
      const nextIndex = items.findIndex((p) => p.index === current.index)
      onPicturesUpdated(items, nextIndex >= 0 ? nextIndex : index)
      showToastSuccess(
        '✓ Saved to map — use Settings → Sync to Cloudflare & GitHub to publish to R2.',
      )
    } catch (error) {
      showToastError(error instanceof Error ? error.message : 'Failed to save picture to map')
    } finally {
      setSavingToMap(false)
    }
  }, [
    buildingAddress,
    current,
    editor,
    index,
    onPicturesUpdated,
    pictures,
    revokeBlobUrls,
    rtuName,
    savingToMap,
  ])

  useEffect(() => {
    if (!open || !current) {
      editor.resetSession()
      return
    }
    void editor.loadFromUrl(current.fullUrl, current.fileName)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when picture changes
  }, [open, current?.fullUrl, current?.fileName])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      editor.onKeyDown(e as unknown as React.KeyboardEvent<HTMLDivElement>)
      const inField = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)
      if (inField) return
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault()
        onIndexChange(index - 1)
      }
      if (e.key === 'ArrowRight' && index < total - 1) {
        e.preventDefault()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor handlers are stable enough per session
  }, [open, index, total, onIndexChange])

  if (!open || !current) return null

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="RTU picture viewer"
    >
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.title}>{rtuName}</div>
          <div className={styles.subtitle}>
            {buildingAddress} · {current.fileName} · {index + 1} / {total}
          </div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close viewer">
          ×
        </button>
      </header>

      <div className={styles.bar}>
        <button
          type="button"
          className={`${styles.toolBtn}${editor.mode === 'select' ? ` ${styles.toolBtnActive}` : ''}`}
          onClick={() => editor.setMode('select')}
        >
          Select
        </button>
        <button
          type="button"
          className={`${styles.toolBtn}${editor.mode === 'text' ? ` ${styles.toolBtnActive}` : ''}`}
          onClick={() => editor.setMode('text')}
        >
          Text
        </button>
        <span className={styles.sep} />
        <button
          type="button"
          className={styles.toolBtnPrimary}
          disabled={editor.cropDisabled}
          onClick={editor.cropToSelection}
        >
          Crop ⤵
        </button>
        <button type="button" className={styles.toolBtn} disabled={editor.undoDisabled} onClick={editor.undo}>
          Undo
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={editor.resetDisabled}
          onClick={editor.resetToOriginal}
        >
          Reset
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          disabled={!editor.canSaveToMap || savingToMap}
          onClick={() => void handleSaveToMap()}
        >
          {savingToMap ? 'Saving…' : 'Save to map'}
        </button>
        <span className={styles.sep} />
        <select
          className={`${styles.select} ${styles.formatSelect}`}
          value={editor.saveFormat}
          onChange={(e) => editor.setSaveFormat(e.target.value as 'png' | 'jpg' | 'pdf')}
          aria-label="Download format"
          title="Download format"
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
          <option value="pdf">PDF</option>
        </select>
        {editor.saveFormat !== 'png' ? (
          <label className={styles.label}>
            Quality
            <input
              type="range"
              className={styles.range}
              min={0.4}
              max={1}
              step={0.05}
              value={editor.quality}
              onChange={(e) => editor.setQuality(Number.parseFloat(e.target.value))}
            />
          </label>
        ) : null}
        <button type="button" className={styles.toolBtn} onClick={() => editor.save(current.fileName)}>
          Download
        </button>
        <button type="button" className={styles.toolBtn} onClick={editor.printImage}>
          Print
        </button>
        <span className={styles.sep} />
        <button type="button" className={styles.toolBtn} onClick={editor.rotateLeft}>
          ⟲ Left
        </button>
        <button type="button" className={styles.toolBtn} onClick={editor.rotateRight}>
          Right ⟳
        </button>
        <label className={styles.label}>
          Fine
          <input
            type="range"
            className={styles.range}
            min={-45}
            max={45}
            step={0.5}
            value={editor.pendingAngle}
            onChange={(e) => editor.previewRotation(Number.parseFloat(e.target.value))}
          />
        </label>
        <span className={styles.angleLbl}>{editor.pendingAngle}°</span>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={editor.applyRotDisabled}
          onClick={editor.applyRotation}
        >
          Apply
        </button>
        <button type="button" className={styles.toolBtn} onClick={editor.clearRotationPreview}>
          ↺
        </button>
        <span className={styles.spacer} />
        <span className={styles.hint}>
          Edits: <b>{editor.editCount}</b>
        </span>
      </div>

      {editor.mode === 'text' ? (
        <div className={styles.textBar}>
          <input
            type="text"
            className={styles.textInput}
            value={editor.textSettings.text}
            placeholder="Text…"
            onChange={(e) => editor.setTextSettings((s) => ({ ...s, text: e.target.value }))}
          />
          <select
            className={styles.select}
            value={editor.textSettings.family}
            onChange={(e) => editor.setTextSettings((s) => ({ ...s, family: e.target.value }))}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
          <label className={styles.label}>
            Size
            <input
              type="number"
              className={styles.numberInput}
              min={4}
              max={600}
              value={editor.textSettings.size}
              onChange={(e) =>
                editor.setTextSettings((s) => ({ ...s, size: Number.parseInt(e.target.value, 10) || 48 }))
              }
            />
          </label>
          <input
            type="color"
            className={styles.colorInput}
            value={editor.textSettings.color}
            onChange={(e) => editor.setTextSettings((s) => ({ ...s, color: e.target.value }))}
          />
          <button
            type="button"
            className={`${styles.toolBtn}${editor.textSettings.bold ? ` ${styles.toolBtnActive}` : ''}`}
            onClick={editor.toggleBold}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            className={`${styles.toolBtn}${editor.textSettings.italic ? ` ${styles.toolBtnActive}` : ''}`}
            onClick={editor.toggleItalic}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            className={styles.toolBtnPrimary}
            disabled={editor.placeTextDisabled}
            onClick={editor.placeText}
          >
            Place text
          </button>
          <span className={styles.hint}>
            click the image and type · drag to move · Enter places · Esc cancels
          </span>
        </div>
      ) : null}

      <div
        ref={editor.stageRef}
        className={`${styles.stage}${editor.mode === 'text' ? ` ${styles.stageText}` : ''}`}
        onPointerDown={editor.onStagePointerDown}
        onPointerMove={editor.onStagePointerMove}
        onPointerUp={editor.onStagePointerUp}
        onContextMenu={editor.onStageContextMenu}
      >
        <canvas ref={editor.canvasRef} className={styles.canvas} />
        {editor.loading ? <p className={styles.stageMessage}>Loading…</p> : null}
        {editor.loadError ? (
          <p className={styles.stageMessage}>
            Image not found on server. Close and use Add pictures to upload a replacement.
          </p>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span>
          Zoom: <b>{editor.zoomPct}</b>
        </span>
        <span>
          Size: <b>{editor.dims}</b>
        </span>
        <span title={editor.sourceFileName ?? undefined}>
          File: <b>{editor.fileSize}</b>
        </span>
        <span>
          Taken: <b>{editor.taken}</b>
        </span>
        <span>
          Location:{' '}
          <b>
            {editor.locationHref ? (
              <a href={editor.locationHref} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {editor.location}
              </a>
            ) : (
              editor.location
            )}
          </b>
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.toolBtn}
          disabled={index <= 0}
          onClick={() => onIndexChange(index - 1)}
        >
          ← Previous
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={index >= total - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          Next →
        </button>
        <span className={styles.hint}>drag box · click inside zooms · right-drag pans</span>
      </footer>
    </div>
  )
}
