import { useCallback, useEffect, useRef, useState } from 'react'
import { showToastSuccess } from '@/lib/toast'
import { usePolygonDraw } from '@/features/polygons/usePolygonDraw'
import { useUiStore } from '@/stores/uiStore'
import type { Polygon } from '@/types/domain'
import styles from './PolygonDrawPanel.module.css'

export interface PolygonDrawPanelProps {
  open: boolean
  onClose: () => void
  map: google.maps.Map | null
  onSaved: (polygon: Polygon) => void
}

type DrawPhase = 'config' | 'drawing'

export function PolygonDrawPanel({ open, onClose, map, onSaved }: PolygonDrawPanelProps) {
  const [phase, setPhase] = useState<DrawPhase>('config')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#60a5fa')
  const [status, setStatus] = useState('')
  const wasOpenRef = useRef(false)

  const { points, startDrawing, reset } = usePolygonDraw({
    map,
    color,
  })

  const resetPanel = useCallback(() => {
    setPhase('config')
    setStatus('')
    reset()
    useUiStore.getState().setPolygonDrawMode(false)
  }, [reset])

  const handleClose = useCallback(() => {
    resetPanel()
    onClose()
  }, [onClose, resetPanel])

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setName('')
      setDescription('')
      setColor('#60a5fa')
      setPhase('config')
      setStatus('')
      reset()
    }
    wasOpenRef.current = open
    if (!open) {
      useUiStore.getState().setPolygonDrawMode(false)
    }
  }, [open, reset])

  useEffect(() => {
    useUiStore.getState().setPolygonDrawMode(phase === 'drawing')
  }, [phase])

  useEffect(() => {
    if (!map) return
    map.setOptions({ draggableCursor: phase === 'drawing' ? 'crosshair' : '' })
    return () => {
      map.setOptions({ draggableCursor: '' })
    }
  }, [map, phase])

  useEffect(
    () => () => {
      reset()
      useUiStore.getState().setPolygonDrawMode(false)
    },
    [reset],
  )

  if (!open) return null

  const handleSave = () => {
    if (points.length < 3) {
      setStatus('Add at least 3 points on the map.')
      return
    }
    const polygon: Polygon = {
      id: Date.now(),
      name: name.trim() || 'Polygon',
      description: description.trim(),
      color,
      paths: points,
    }
    onSaved(polygon)
    showToastSuccess('✓ Polygon added — save to HTML to keep it.')
    resetPanel()
    onClose()
  }

  const handlePrimary = () => {
    if (phase === 'config') {
      if (!map) {
        setStatus('Map is not ready.')
        return
      }
      setStatus('Click the map to place each corner point.')
      startDrawing()
      setPhase('drawing')
      return
    }
    handleSave()
  }

  const statusText =
    status ||
    (phase === 'drawing'
      ? points.length === 0
        ? 'Click the map to place the first point.'
        : points.length < 3
          ? `${points.length} point${points.length === 1 ? '' : 's'} — need ${3 - points.length} more.`
          : `${points.length} points placed — adjust details if needed, then Save.`
      : '')

  return (
    <div className={styles.panel} data-polygon-draw-panel="">
      <div className={styles.title}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="3,18 9,4 15,14 20,8 21,18" />
        </svg>
        Add New Polygon
      </div>

      <div className={styles.fields}>
        <input
          type="text"
          placeholder="Polygon name (e.g. Lot A)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          rows={2}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className={styles.colorRow}>
          <label>Colour</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>

      {statusText ? <div className={styles.status}>{statusText}</div> : null}

      <div className={styles.actions}>
        <button type="button" className="btn-action" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn-action ${phase === 'drawing' ? styles.saveBtn : styles.drawBtn}`}
          onClick={handlePrimary}
          disabled={!map || (phase === 'drawing' && points.length < 3)}
        >
          {phase === 'drawing' ? 'Save' : 'Click map to add points'}
        </button>
      </div>
    </div>
  )
}
