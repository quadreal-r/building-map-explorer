import { useState } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'
import { canPersistToSupabase, upsertPolygon } from '@/lib/portfolioApi'
import { usePolygonDraw } from '@/features/polygons/usePolygonDraw'
import type { Polygon } from '@/types/domain'
import styles from './PolygonDrawPanel.module.css'

export interface PolygonDrawPanelProps {
  open: boolean
  onClose: () => void
  map: google.maps.Map | null
  onSaved: (polygon: Polygon) => void
}

export function PolygonDrawPanel({ open, onClose, map, onSaved }: PolygonDrawPanelProps) {
  const { isAuthenticated } = useAuthContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#60a5fa')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const { points, isDrawing, toggleDrawing, reset } = usePolygonDraw({
    map,
    color,
  })

  if (!open) return null

  const handleSave = async () => {
    if (points.length < 3) {
      setStatus('Draw at least 3 points first.')
      return
    }
    const polygon: Polygon = {
      name: name.trim() || 'Polygon',
      description: description.trim(),
      color,
      paths: points,
    }
    setSaving(true)
    try {
      if (canPersistToSupabase(isAuthenticated)) {
        const saved = await upsertPolygon(polygon)
        onSaved(saved)
      } else {
        onSaved({ ...polygon, id: Date.now() })
      }
      reset()
      setName('')
      setDescription('')
      setColor('#60a5fa')
      setStatus('')
      onClose()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to save polygon')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    reset()
    setStatus('')
    onClose()
  }

  const pointLabel =
    points.length === 0
      ? isDrawing
        ? 'Click map to place points. Double-click last point to finish.'
        : ''
      : isDrawing
        ? `${points.length} point${points.length === 1 ? '' : 's'} placed. Double-click to finish.`
        : `✓ ${points.length} points — fill in details and click Save.`

  return (
    <div className={styles.panel}>
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

      <button
        type="button"
        className={`btn-action ${styles.drawBtn}`}
        onClick={() => {
          toggleDrawing()
          if (!isDrawing) setStatus('Click map to place points. Double-click last point to finish.')
        }}
      >
        {isDrawing ? '⏹ Stop Drawing' : '🖊 Click Map to Add Points'}
      </button>

      <div className={styles.status}>{status || pointLabel}</div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`btn-action ${styles.saveBtn}`}
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : '✓ Save'}
        </button>
        <button type="button" className="btn-action" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
