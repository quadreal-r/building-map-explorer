import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeZoomToRect,
  DEFAULT_ZOOM,
  isZoomed,
  panZoom,
  PAN_STEP_PX,
  pointInRect,
  type CropRect,
  type DisplayMetrics,
  type ZoomState,
  zoomAtFrameCenter,
  zoomAtPoint,
  ZOOM_STEP_FACTOR,
} from './rtuPictureViewerZoom'
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

  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; rect: CropRect | null } | null>(null)
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  )
  const zoomDragMovedRef = useRef(false)
  const suppressZoomClickRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)

  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewerMode>('view')
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [zoomSelectRect, setZoomSelectRect] = useState<CropRect | null>(null)
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM)
  const [textPlacement, setTextPlacement] = useState<TextPlacement | null>(null)
  const [textInput, setTextInput] = useState('')
  const [isEdited, setIsEdited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [frameMetrics, setFrameMetrics] = useState<{
    dw: number
    dh: number
    ox: number
    oy: number
    nw: number
    nh: number
  } | null>(null)

  const resetEdits = useCallback(() => {
    setDisplayUrl(null)
    setIsEdited(false)
    setCropRect(null)
    setZoomSelectRect(null)
    setZoomState(DEFAULT_ZOOM)
    setTextPlacement(null)
    setTextInput('')
    setMode('view')
  }, [])

  const resetZoom = useCallback(() => {
    setZoomState(DEFAULT_ZOOM)
    setZoomSelectRect(null)
  }, [])

  const exitTextMode = useCallback(() => {
    setTextPlacement(null)
    setTextInput('')
    setMode('view')
  }, [])

  const syncFrameMetrics = useCallback(() => {
    const viewport = viewportRef.current
    const imgEl = imgRef.current
    if (!viewport || !imgEl?.naturalWidth) {
      setFrameMetrics(null)
      return
    }
    const fw = viewport.clientWidth
    const fh = viewport.clientHeight
    if (fw < 1 || fh < 1) {
      setFrameMetrics(null)
      return
    }
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
    setFrameMetrics({
      dw,
      dh,
      ox,
      oy,
      nw: imgEl.naturalWidth,
      nh: imgEl.naturalHeight,
    })
  }, [])

  const handleImageLoad = useCallback(() => {
    const imgEl = imgRef.current
    if (!imgEl?.naturalWidth) return
    setSourceImage(imgEl)
    setLoading(false)
    setLoadError(false)
    syncFrameMetrics()
  }, [syncFrameMetrics])

  const handleImageError = useCallback(() => {
    setLoading(false)
    setLoadError(true)
    setFrameMetrics(null)
  }, [])

  useEffect(() => {
    const imgEl = imgRef.current
    if (imgEl?.complete && imgEl.naturalWidth > 0) {
      handleImageLoad()
    }
  }, [open, current?.fullUrl, displayUrl, handleImageLoad])

  useEffect(() => {
    if (!open || !current) return
    /* eslint-disable react-hooks/set-state-in-effect -- reset editor state when switching pictures */
    setDisplayUrl(null)
    setIsEdited(false)
    setCropRect(null)
    setZoomSelectRect(null)
    setZoomState(DEFAULT_ZOOM)
    setTextPlacement(null)
    setTextInput('')
    setMode('view')
    setFrameMetrics(null)
    setLoading(true)
    setLoadError(false)
    setSourceImage(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, current])

  useEffect(() => {
    if (!open) return
    const viewport = viewportRef.current
    if (!viewport) return
    let lastW = 0
    let lastH = 0
    const observer = new ResizeObserver(() => {
      syncFrameMetrics()
      const w = viewport.clientWidth
      const h = viewport.clientHeight
      if (lastW > 0 && lastH > 0 && (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2)) {
        setZoomState(DEFAULT_ZOOM)
        setZoomSelectRect(null)
      }
      lastW = w
      lastH = h
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [open, syncFrameMetrics, loading, displayUrl, mode])

  const getDisplayMetrics = useCallback((): DisplayMetrics | null => {
    const viewport = viewportRef.current
    const imgEl = imgRef.current
    if (!viewport || !imgEl?.naturalWidth) return null
    const fw = viewport.clientWidth
    const fh = viewport.clientHeight
    if (fw < 1 || fh < 1) return null
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

  const viewportPoint = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const box = viewport.getBoundingClientRect()
    return { x: clientX - box.left, y: clientY - box.top }
  }, [])

  const stepZoom = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current
      const m = getDisplayMetrics()
      if (!viewport || !m) return
      setZoomState((current) =>
        zoomAtFrameCenter(current, m, viewport.clientWidth, viewport.clientHeight, factor),
      )
      setZoomSelectRect(null)
    },
    [getDisplayMetrics],
  )

  useEffect(() => {
    if (!open || mode !== 'view') return
    const viewport = viewportRef.current
    if (!viewport) return

    const onWheel = (e: WheelEvent) => {
      const m = getDisplayMetrics()
      if (!m) return
      e.preventDefault()
      const pt = viewportPoint(e.clientX, e.clientY)
      if (!pt) return
      const factor = e.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR
      setZoomState((current) => zoomAtPoint(current, m, pt.x, pt.y, factor))
      setZoomSelectRect(null)
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [open, mode, getDisplayMetrics, viewportPoint])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        if (isZoomed(zoomState)) {
          resetZoom()
          return
        }
        if (zoomSelectRect) {
          setZoomSelectRect(null)
          return
        }
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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        resetZoom()
        return
      }

      if (mode === 'view' && isZoomed(zoomState)) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setZoomState((z) => panZoom(z, PAN_STEP_PX, 0))
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setZoomState((z) => panZoom(z, -PAN_STEP_PX, 0))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setZoomState((z) => panZoom(z, 0, PAN_STEP_PX))
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setZoomState((z) => panZoom(z, 0, -PAN_STEP_PX))
          return
        }
      }

      if (mode === 'view' && !isZoomed(zoomState)) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          stepZoom(ZOOM_STEP_FACTOR)
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          stepZoom(1 / ZOOM_STEP_FACTOR)
          return
        }
        if (e.key === ' ' || e.key === 'PageDown') {
          e.preventDefault()
          if (index < total - 1) {
            resetEdits()
            onIndexChange(index + 1)
          }
          return
        }
        if (e.key === 'Backspace' || e.key === 'PageUp') {
          e.preventDefault()
          if (index > 0) {
            resetEdits()
            onIndexChange(index - 1)
          }
          return
        }
      }

      if (mode === 'text' && textPlacement) return

      if (!isZoomed(zoomState) && e.key === 'ArrowLeft' && index > 0) {
        resetEdits()
        onIndexChange(index - 1)
      }
      if (!isZoomed(zoomState) && e.key === 'ArrowRight' && index < total - 1) {
        resetEdits()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    index,
    total,
    mode,
    textPlacement,
    zoomState,
    zoomSelectRect,
    onClose,
    onIndexChange,
    resetEdits,
    resetZoom,
    exitTextMode,
    stepZoom,
  ])

  useEffect(() => {
    if (textPlacement) textInputRef.current?.focus()
  }, [textPlacement])

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

  const applyZoomToSelection = useCallback(
    (rect?: CropRect | null) => {
      const target = rect ?? zoomSelectRect
      const viewport = viewportRef.current
      if (!target || !viewport) return
      const m = getDisplayMetrics()
      if (!m) return
      const next = computeZoomToRect(
        target,
        m,
        viewport.clientWidth,
        viewport.clientHeight,
      )
      if (!isZoomed(next)) return
      setZoomState(next)
      setZoomSelectRect(null)
    },
    [zoomSelectRect, getDisplayMetrics],
  )

  const handleFrameDoubleClick = useCallback(() => {
    if (isZoomed(zoomState)) {
      resetZoom()
    }
  }, [zoomState, resetZoom])

  const onViewFrameClick = (e: React.MouseEvent) => {
    if (suppressZoomClickRef.current) return
    if (mode !== 'view' || !zoomSelectRect) return
    if (zoomSelectRect.w < 8 || zoomSelectRect.h < 8) return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt || !pointInRect(pt.x, pt.y, zoomSelectRect)) return
    applyZoomToSelection()
  }

  const onTextFrameClick = (e: React.MouseEvent) => {
    if (mode !== 'text') return
    const m = getDisplayMetrics()
    if (!m) return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x: frameX, y: frameY } = pt
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
    if (mode !== 'crop') return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x, y } = pt
    dragRef.current = { startX: x, startY: y, rect: { x, y, w: 0, h: 0 } }
    setCropRect({ x, y, w: 0, h: 0 })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onCropPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag?.rect) return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x, y } = pt
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

  const onViewPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'view') return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x, y } = pt

    if (isZoomed(zoomState)) {
      panDragRef.current = {
        startX: x,
        startY: y,
        panX: zoomState.panX,
        panY: zoomState.panY,
      }
      setIsPanning(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    zoomDragMovedRef.current = false
    dragRef.current = { startX: x, startY: y, rect: { x, y, w: 0, h: 0 } }
    setZoomSelectRect({ x, y, w: 0, h: 0 })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onViewPointerMove = (e: React.PointerEvent) => {
    if (mode !== 'view') return
    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x, y } = pt

    const panDrag = panDragRef.current
    if (panDrag) {
      setZoomState((current) => ({
        scale: current.scale,
        panX: panDrag.panX + (x - panDrag.startX),
        panY: panDrag.panY + (y - panDrag.startY),
      }))
      return
    }

    const drag = dragRef.current
    if (!drag?.rect) return
    if (Math.abs(x - drag.startX) > 3 || Math.abs(y - drag.startY) > 3) {
      zoomDragMovedRef.current = true
    }
    const left = Math.min(drag.startX, x)
    const top = Math.min(drag.startY, y)
    const w = Math.abs(x - drag.startX)
    const h = Math.abs(y - drag.startY)
    setZoomSelectRect({ x: left, y: top, w, h })
  }

  const onViewPointerUp = (e: React.PointerEvent) => {
    if (panDragRef.current) {
      panDragRef.current = null
      setIsPanning(false)
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      return
    }

    const drag = dragRef.current
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!drag || mode !== 'view') return

    const pt = viewportPoint(e.clientX, e.clientY)
    if (!pt) return
    const { x, y } = pt
    const left = Math.min(drag.startX, x)
    const top = Math.min(drag.startY, y)
    const w = Math.abs(x - drag.startX)
    const h = Math.abs(y - drag.startY)
    const finalRect = { x: left, y: top, w, h }

    if (w < 8 || h < 8) {
      setZoomSelectRect(null)
      return
    }

    if (zoomDragMovedRef.current) {
      suppressZoomClickRef.current = true
      window.setTimeout(() => {
        suppressZoomClickRef.current = false
      }, 0)
      applyZoomToSelection(finalRect)
      return
    }

    setZoomSelectRect(finalRect)
  }

  const frameClickHandler =
    mode === 'text' ? onTextFrameClick : mode === 'view' ? onViewFrameClick : undefined

  const framePointerDown =
    mode === 'crop' ? onCropPointerDown : mode === 'view' ? onViewPointerDown : undefined
  const framePointerMove =
    mode === 'crop' ? onCropPointerMove : mode === 'view' ? onViewPointerMove : undefined
  const framePointerUp =
    mode === 'crop' ? onCropPointerUp : mode === 'view' ? onViewPointerUp : undefined

  if (!open || !current) return null

  const imageSrc = displayUrl ?? current.fullUrl
  const displayFontSize =
    frameMetrics && sourceImage?.naturalWidth
      ? textFontSize(sourceImage.naturalWidth) * (frameMetrics.dw / frameMetrics.nw)
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

      <div className={styles.frame}>
        <div
          ref={viewportRef}
          className={`${styles.viewport}${mode === 'crop' ? ` ${styles.frameCrop}` : ''}${mode === 'text' ? ` ${styles.frameText}` : ''}${mode === 'view' && !isZoomed(zoomState) ? ` ${styles.frameZoom}` : ''}${isZoomed(zoomState) ? ` ${styles.frameZoomed}` : ''}${isPanning ? ` ${styles.framePanning}` : ''}`}
          onClick={frameClickHandler}
          onPointerDown={framePointerDown}
          onPointerMove={framePointerMove}
          onPointerUp={framePointerUp}
          onDoubleClick={handleFrameDoubleClick}
        >
          {loadError ? (
            <p className={styles.loading}>
              Image not found on server. The manifest lists this file but it was not uploaded to Cloudflare.
              Close the viewer and use Add pictures to upload a replacement.
            </p>
          ) : (
            <>
              {loading ? <p className={styles.loading}>Loading…</p> : null}
              <div
                className={styles.zoomLayer}
                style={
                  frameMetrics
                    ? {
                        left: frameMetrics.ox,
                        top: frameMetrics.oy,
                        width: frameMetrics.dw,
                        height: frameMetrics.dh,
                        transform: `translate(${zoomState.panX}px, ${zoomState.panY}px) scale(${zoomState.scale})`,
                      }
                    : {
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        transform: 'none',
                        opacity: loading ? 0 : 1,
                      }
                }
              >
                <img
                  ref={imgRef}
                  className={styles.zoomImage}
                  src={imageSrc}
                  alt={current.fileName}
                  draggable={false}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              </div>
              {mode === 'view' && zoomSelectRect && zoomSelectRect.w > 0 && zoomSelectRect.h > 0 ? (
                <div
                  className={styles.zoomSelectBox}
                  style={{
                    left: zoomSelectRect.x,
                    top: zoomSelectRect.y,
                    width: zoomSelectRect.w,
                    height: zoomSelectRect.h,
                  }}
                />
              ) : null}
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

      {mode === 'view' ? (
        <div className={styles.textBar}>
          <span className={styles.hint}>
            {isZoomed(zoomState)
              ? `Zoom ${Math.round(zoomState.scale * 100)}% · drag to pan · scroll or +/− to zoom · Esc / double-click to reset`
              : zoomSelectRect && zoomSelectRect.w >= 8
                ? 'Release to zoom · or click selection'
                : 'Drag to zoom area · scroll or +/− to zoom · Space/←/→ for pictures'}
          </span>
          {isZoomed(zoomState) ? (
            <button type="button" className={styles.toolBtnMuted} onClick={resetZoom}>
              Reset view
            </button>
          ) : null}
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
          onClick={() => {
            if (mode === 'crop') {
              setMode('view')
              setCropRect(null)
              return
            }
            setZoomSelectRect(null)
            setZoomState(DEFAULT_ZOOM)
            setMode('crop')
          }}
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
            setZoomSelectRect(null)
            setZoomState(DEFAULT_ZOOM)
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
