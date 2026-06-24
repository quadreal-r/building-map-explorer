import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './RtuPictureViewer.module.css'

export interface RtuPictureViewerItem {
  fileName: string
  fullUrl: string
  index: number
}

export interface RtuPictureViewerProps {
  open: boolean
  pictures: RtuPictureViewerItem[]
  index: number
  rtuName: string
  buildingAddress: string
  onClose: () => void
  onIndexChange: (index: number) => void
}

type ViewerMode = 'view' | 'crop' | 'text'

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

interface TextPlacement {
  frameX: number
  frameY: number
  imageX: number
  imageY: number
}

function textFontSize(imageWidth: number): number {
  return Math.max(14, Math.round(imageWidth / 28))
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

export function RtuPictureViewer({
  open,
  pictures,
  index,
  rtuName,
  buildingAddress,
  onClose,
  onIndexChange,
}: RtuPictureViewerProps) {
  const current = pictures[index]
  const total = pictures.length

  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; rect: CropRect | null } | null>(null)

  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewerMode>('view')
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [textPlacement, setTextPlacement] = useState<TextPlacement | null>(null)
  const [textInput, setTextInput] = useState('')
  const [isEdited, setIsEdited] = useState(false)
  const [loading, setLoading] = useState(false)

  const resetEdits = useCallback(() => {
    setDisplayUrl(null)
    setIsEdited(false)
    setCropRect(null)
    setTextPlacement(null)
    setTextInput('')
    setMode('view')
  }, [])

  const exitTextMode = useCallback(() => {
    setTextPlacement(null)
    setTextInput('')
    setMode('view')
  }, [])

  useEffect(() => {
    if (!open || !current) return
    resetEdits()
    setLoading(true)
    void loadImage(current.fullUrl)
      .then((img) => {
        setSourceImage(img)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, current?.fullUrl, current?.fileName, resetEdits])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textPlacement) {
          setTextPlacement(null)
          setTextInput('')
          return
        }
        if (mode === 'text') {
          exitTextMode()
          return
        }
        onClose()
        return
      }
      if (mode === 'text' && textPlacement) return
      if (e.key === 'ArrowLeft' && index > 0) {
        resetEdits()
        onIndexChange(index - 1)
      }
      if (e.key === 'ArrowRight' && index < total - 1) {
        resetEdits()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, total, mode, textPlacement, onClose, onIndexChange, resetEdits, exitTextMode])

  useEffect(() => {
    if (textPlacement) textInputRef.current?.focus()
  }, [textPlacement])

  const getDisplayMetrics = useCallback(() => {
    const frame = frameRef.current
    const imgEl = imgRef.current
    if (!frame || !imgEl?.naturalWidth) return null
    const fw = frame.clientWidth
    const fh = frame.clientHeight
    const ir = imgEl.naturalWidth / imgEl.naturalHeight
    const fr = fw / fh
    let dw: number
    let dh: number
    if (ir > fr) {
      dw = fw
      dh = fw / ir
    } else {
      dh = fh
      dw = fh * ir
    }
    const ox = (fw - dw) / 2
    const oy = (fh - dh) / 2
    return { dw, dh, ox, oy, nw: imgEl.naturalWidth, nh: imgEl.naturalHeight }
  }, [])

  const getBaseImage = useCallback((): Promise<HTMLImageElement> => {
    if (displayUrl) return loadImage(displayUrl)
    if (sourceImage) return Promise.resolve(sourceImage)
    return Promise.reject(new Error('No image'))
  }, [displayUrl, sourceImage])

  const applyCrop = useCallback(() => {
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8) return
    const m = getDisplayMetrics()
    if (!m) return
    void getBaseImage().then((base) => {
      const sx = ((cropRect.x - m.ox) / m.dw) * m.nw
      const sy = ((cropRect.y - m.oy) / m.dh) * m.nh
      const sw = (cropRect.w / m.dw) * m.nw
      const sh = (cropRect.h / m.dh) * m.nh
      if (sw < 1 || sh < 1) return

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw)
      canvas.height = Math.round(sh)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(base, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      setDisplayUrl(canvas.toDataURL('image/jpeg', 0.92))
      setIsEdited(true)
      setMode('view')
      setCropRect(null)
    })
  }, [cropRect, getDisplayMetrics, getBaseImage])

  const applyText = useCallback(() => {
    const text = textInput.trim()
    if (!text || !textPlacement) return

    void getBaseImage().then((base) => {
      const canvas = document.createElement('canvas')
      canvas.width = base.naturalWidth
      canvas.height = base.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(base, 0, 0)
      drawText(ctx, text, textPlacement.imageX, textPlacement.imageY, base.naturalWidth)
      setDisplayUrl(canvas.toDataURL('image/jpeg', 0.92))
      setIsEdited(true)
      setTextPlacement(null)
      setTextInput('')
      setMode('view')
    })
  }, [textInput, textPlacement, getBaseImage])

  const handleDownload = useCallback(() => {
    if (!current) return
    const save = (href: string) => {
      const a = document.createElement('a')
      a.href = href
      a.download = current.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    if (displayUrl) {
      save(displayUrl)
      return
    }
    void fetch(current.fullUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        save(url)
        URL.revokeObjectURL(url)
      })
  }, [current, displayUrl])

  const onTextFrameClick = (e: React.MouseEvent) => {
    if (mode !== 'text' || !frameRef.current) return
    const m = getDisplayMetrics()
    if (!m) return
    const box = frameRef.current.getBoundingClientRect()
    const frameX = e.clientX - box.left
    const frameY = e.clientY - box.top
    if (
      frameX < m.ox ||
      frameX > m.ox + m.dw ||
      frameY < m.oy ||
      frameY > m.oy + m.dh
    ) {
      return
    }
    const imageX = ((frameX - m.ox) / m.dw) * m.nw
    const imageY = ((frameY - m.oy) / m.dh) * m.nh
    setTextPlacement({ frameX, frameY, imageX, imageY })
    setTextInput('')
  }

  const onCropPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'crop' || !frameRef.current) return
    const box = frameRef.current.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    dragRef.current = { startX: x, startY: y, rect: { x, y, w: 0, h: 0 } }
    setCropRect({ x, y, w: 0, h: 0 })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onCropPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag?.rect || !frameRef.current) return
    const box = frameRef.current.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const left = Math.min(drag.startX, x)
    const top = Math.min(drag.startY, y)
    const w = Math.abs(x - drag.startX)
    const h = Math.abs(y - drag.startY)
    setCropRect({ x: left, y: top, w, h })
  }

  const onCropPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  if (!open || !current) return null

  const imageSrc = displayUrl ?? current.fullUrl
  const metrics = getDisplayMetrics()
  const displayFontSize =
    metrics && imgRef.current?.naturalWidth
      ? textFontSize(imgRef.current.naturalWidth) * (metrics.dw / metrics.nw)
      : 16

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="RTU picture viewer">
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

      <div
        ref={frameRef}
        className={`${styles.frame}${mode === 'crop' ? ` ${styles.frameCrop}` : ''}${mode === 'text' ? ` ${styles.frameText}` : ''}`}
        onClick={mode === 'text' ? onTextFrameClick : undefined}
        onPointerDown={mode === 'crop' ? onCropPointerDown : undefined}
        onPointerMove={mode === 'crop' ? onCropPointerMove : undefined}
        onPointerUp={mode === 'crop' ? onCropPointerUp : undefined}
      >
        {loading ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <>
            <img
              ref={imgRef}
              className={styles.image}
              src={imageSrc}
              alt={current.fileName}
              draggable={false}
            />
            {mode === 'crop' && cropRect && cropRect.w > 0 && cropRect.h > 0 ? (
              <div
                className={styles.cropBox}
                style={{
                  left: cropRect.x,
                  top: cropRect.y,
                  width: cropRect.w,
                  height: cropRect.h,
                }}
              />
            ) : null}
            {mode === 'text' && textPlacement ? (
              <input
                ref={textInputRef}
                type="text"
                className={styles.inlineTextInput}
                style={{
                  left: textPlacement.frameX,
                  top: textPlacement.frameY,
                  fontSize: displayFontSize,
                }}
                value={textInput}
                placeholder="Type here"
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyText()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setTextPlacement(null)
                    setTextInput('')
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : null}
          </>
        )}
      </div>

      {mode === 'text' ? (
        <div className={styles.textBar}>
          <span className={styles.hint}>
            {textPlacement
              ? 'Type on the picture · Enter to apply · Esc to cancel'
              : 'Click on the picture where you want the text'}
          </span>
          {textPlacement ? (
            <>
              <button type="button" className={styles.toolBtn} onClick={applyText}>
                Apply text
              </button>
              <button
                type="button"
                className={styles.toolBtnMuted}
                onClick={() => {
                  setTextPlacement(null)
                  setTextInput('')
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={styles.toolBtnMuted} onClick={exitTextMode}>
              Cancel
            </button>
          )}
        </div>
      ) : null}

      {mode === 'crop' ? (
        <div className={styles.textBar}>
          <span className={styles.hint}>Drag on the image to select crop area</span>
          <button type="button" className={styles.toolBtn} onClick={applyCrop}>
            Apply crop
          </button>
          <button type="button" className={styles.toolBtnMuted} onClick={() => { setMode('view'); setCropRect(null) }}>
            Cancel
          </button>
        </div>
      ) : null}

      <footer className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={index <= 0}
          onClick={() => {
            resetEdits()
            onIndexChange(index - 1)
          }}
        >
          ← Previous
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={index >= total - 1}
          onClick={() => {
            resetEdits()
            onIndexChange(index + 1)
          }}
        >
          Next →
        </button>
        <span className={styles.toolSep} />
        <button type="button" className={styles.toolBtn} onClick={handleDownload}>
          Download
        </button>
        <button
          type="button"
          className={`${styles.toolBtn}${mode === 'crop' ? ` ${styles.toolBtnActive}` : ''}`}
          onClick={() => setMode(mode === 'crop' ? 'view' : 'crop')}
        >
          Crop
        </button>
        <button
          type="button"
          className={`${styles.toolBtn}${mode === 'text' ? ` ${styles.toolBtnActive}` : ''}`}
          onClick={() => {
            if (mode === 'text') {
              exitTextMode()
              return
            }
            setTextPlacement(null)
            setTextInput('')
            setMode('text')
          }}
        >
          Add text
        </button>
        {isEdited ? (
          <button type="button" className={styles.toolBtnMuted} onClick={resetEdits}>
            Reset
          </button>
        ) : null}
      </footer>
    </div>
  )
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  imageWidth: number,
): void {
  const fontSize = textFontSize(imageWidth)
  ctx.font = `700 ${fontSize}px Inter, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(2, fontSize / 8)
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#fff'
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
}
