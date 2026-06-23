import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal/Modal'
import {
  getMarkerScale,
  getMarkerShapeIndex,
  MARKER_SHAPES,
  setMarkerScale,
  setMarkerShapeIndex,
} from '@/lib/markerStyles'
import { showToastSuccess } from '@/lib/toast'
import type { LayerKey, PortfolioData, Rtu, Utility } from '@/types/domain'

type MarkerCategory = 'rtu' | Exclude<LayerKey, 'tenants'>

const CATEGORY_OPTIONS: { value: MarkerCategory; label: string }[] = [
  { value: 'rtu', label: 'RTU' },
  { value: 'sprinkler', label: 'Sprinkler Room' },
  { value: 'electrical', label: 'Electrical Room' },
  { value: 'hydrant', label: 'Fire Hydrant' },
  { value: 'gas', label: 'Gas Shut-Off' },
]

const DEFAULT_NAMES: Record<MarkerCategory, string> = {
  rtu: 'RTU-NEW',
  sprinkler: 'Sprinkler Room',
  electrical: 'Electrical Room',
  hydrant: 'Fire Hydrant',
  gas: 'Gas Meter',
}

const LAYER_TO_UTILITY: Partial<Record<LayerKey, Utility['utility_type']>> = {
  sprinkler: 'Sprinkler Rooms',
  electrical: 'Electrical Rooms',
  hydrant: 'Fire Hydrants',
  gas: 'Natural Gas Shut-Off',
}

export interface AddMarkerPanelProps {
  open: boolean
  onClose: () => void
  portfolio: PortfolioData
  map: google.maps.Map | null
  onAdded: (patch: PortfolioData) => void
  defaultLat?: number
  defaultLng?: number
}

export function AddMarkerPanel({
  open,
  onClose,
  portfolio,
  map,
  onAdded,
  defaultLat = 43.65,
  defaultLng = -79.62,
}: AddMarkerPanelProps) {
  const [category, setCategory] = useState<MarkerCategory>('rtu')
  const [buildingAddress, setBuildingAddress] = useState(portfolio.buildings[0]?.address ?? '')
  const [name, setName] = useState(DEFAULT_NAMES.rtu)
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [pickMode, setPickMode] = useState(false)
  const [shapeIdx, setShapeIdx] = useState(getMarkerShapeIndex())
  const [scale, setScale] = useState(getMarkerScale())
  const [error, setError] = useState<string | null>(null)

  const needsBuilding = category === 'rtu'

  useEffect(() => {
    if (!open) return
    setLat(defaultLat ? String(defaultLat) : '')
    setLng(defaultLng ? String(defaultLng) : '')
    setError(null)
    setPickMode(false)
    setShapeIdx(getMarkerShapeIndex())
    setScale(getMarkerScale())
  }, [open, defaultLat, defaultLng])

  useEffect(() => {
    if (!open || !map || !pickMode) return
    map.setOptions({ draggableCursor: 'crosshair' })
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      const pos = e.latLng
      if (!pos) return
      setLat(pos.lat().toFixed(6))
      setLng(pos.lng().toFixed(6))
      setPickMode(false)
    })
    return () => {
      google.maps.event.removeListener(listener)
      map.setOptions({ draggableCursor: '' })
    }
  }, [open, map, pickMode])

  const handleCategoryChange = (next: MarkerCategory) => {
    setCategory(next)
    setName(DEFAULT_NAMES[next])
    if (next === 'rtu') {
      setBuildingAddress(portfolio.buildings[0]?.address ?? '')
    }
  }

  const handleSave = () => {
    setError(null)
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    if (!parsedLat || !parsedLng || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setError('Set GPS by clicking the map or entering coordinates.')
      return
    }

    setMarkerShapeIndex(shapeIdx)
    setMarkerScale(scale)

    const marker = {
      name: name.trim(),
      description: description.trim(),
      lat: parsedLat,
      lng: parsedLng,
    }

    if (category === 'rtu') {
      const building = portfolio.buildings.find((b) => b.address === buildingAddress)
      if (!building) {
        setError('Building not found.')
        return
      }
      onAdded({
        ...portfolio,
        buildings: portfolio.buildings.map((b) =>
          b.address === building.address ? { ...b, rtus: [...(b.rtus ?? []), marker as Rtu] } : b,
        ),
      })
    } else {
      const utilityType = LAYER_TO_UTILITY[category]
      if (!utilityType) return
      const utility: Utility = {
        id: Date.now(),
        utility_type: utilityType,
        name: name.trim(),
        description: description.trim(),
        lat: parsedLat,
        lng: parsedLng,
      }
      onAdded({ ...portfolio, utilities: [...portfolio.utilities, utility] })
    }

    showToastSuccess('✓ Marker added — save to HTML to keep it.')
    onClose()
    setName('')
    setDescription('')
    setLat('')
    setLng('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Add map marker" width={320}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, opacity: pickMode ? 0.75 : 1 }}>
        <label>
          Category
          <select value={category} onChange={(e) => handleCategoryChange(e.target.value as MarkerCategory)} style={{ width: '100%', marginTop: 4 }}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        {needsBuilding ? (
          <label>
            Building
            <select value={buildingAddress} onChange={(e) => setBuildingAddress(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
              {portfolio.buildings.map((b) => (
                <option key={b.address} value={b.address}>{b.address}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: '100%', marginTop: 4, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Lat<input type="text" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: '100%', marginTop: 4 }} /></label>
          <label style={{ flex: 1 }}>Lng<input type="text" value={lng} onChange={(e) => setLng(e.target.value)} style={{ width: '100%', marginTop: 4 }} /></label>
        </div>
        <button type="button" className={`btn-action${pickMode ? ' primary' : ''}`} onClick={() => setPickMode(true)} disabled={!map}>
          {pickMode ? '🎯 Click anywhere on the map…' : '📍 Click on Map to Place'}
        </button>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>Marker shape</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {MARKER_SHAPES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setShapeIdx(i)}
                style={{
                  padding: '4px 9px',
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: 'pointer',
                  border: `2px solid ${i === shapeIdx ? 'var(--accent)' : 'var(--border)'}`,
                  background: i === shapeIdx ? 'rgba(125,184,255,.12)' : 'var(--surface)',
                  color: 'var(--text-primary)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          Size ({scale})
          <input type="range" min={4} max={20} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
        {error ? <p style={{ color: '#f87171', fontSize: 11 }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-action" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-action primary" onClick={handleSave}>Add marker</button>
        </div>
      </div>
    </Modal>
  )
}