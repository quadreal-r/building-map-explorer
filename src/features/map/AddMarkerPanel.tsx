import { useState } from 'react'
import { Modal } from '@/components/Modal/Modal'
import { useAuthContext } from '@/hooks/useAuthContext'
import { addUtilityMarker, canPersistToSupabase } from '@/lib/portfolioApi'
import type { PortfolioData, Utility } from '@/types/domain'

const UTILITY_TYPES: Utility['utility_type'][] = [
  'Sprinkler Rooms',
  'Electrical Rooms',
  'Fire Hydrants',
  'Natural Gas Shut-Off',
]

export interface AddMarkerPanelProps {
  open: boolean
  onClose: () => void
  portfolio: PortfolioData
  onAdded: (utility: Utility) => void
  defaultLat?: number
  defaultLng?: number
}

export function AddMarkerPanel({
  open,
  onClose,
  onAdded,
  defaultLat = 43.65,
  defaultLng = -79.62,
}: AddMarkerPanelProps) {
  const { isAuthenticated } = useAuthContext()
  const [utilityType, setUtilityType] = useState<Utility['utility_type']>('Fire Hydrants')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState(String(defaultLat))
  const [lng, setLng] = useState(String(defaultLng))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    if (!name.trim() || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setError('Name and valid coordinates are required.')
      return
    }

    const utility: Omit<Utility, 'id'> = {
      utility_type: utilityType,
      name: name.trim(),
      description: description.trim(),
      lat: parsedLat,
      lng: parsedLng,
    }

    setSaving(true)
    try {
      if (canPersistToSupabase(isAuthenticated)) {
        const saved = await addUtilityMarker(utility)
        onAdded(saved)
      } else {
        onAdded({ ...utility, id: Date.now() })
      }
      onClose()
      setName('')
      setDescription('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save marker')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add map marker" width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <label>
          Type
          <select
            value={utilityType}
            onChange={(e) => setUtilityType(e.target.value as Utility['utility_type'])}
            style={{ width: '100%', marginTop: 4 }}
          >
            {UTILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <label>
          Description
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>
            Lat
            <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </label>
          <label style={{ flex: 1 }}>
            Lng
            <input type="text" value={lng} onChange={(e) => setLng(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </label>
        </div>
        {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
        {!isAuthenticated ? (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Sign in to persist new markers to Supabase. Otherwise they appear for this session only.
          </p>
        ) : null}
        <button type="button" className="btn-action primary" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Add marker'}
        </button>
      </div>
    </Modal>
  )
}
