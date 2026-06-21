import { useState } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'
import { canPersistToSupabase, updateBuildingNotes } from '@/lib/portfolioApi'
import { useSelectionStore } from '@/stores/selectionStore'

export function BuildingNotesEditor() {
  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const selectBuilding = useSelectionStore((s) => s.selectBuilding)
  const { isAuthenticated } = useAuthContext()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!currentBuilding) return null

  const startEdit = () => {
    setDraft(currentBuilding.notes ?? '')
    setOpen(true)
  }

  const save = async () => {
    if (!currentBuilding) return
    setSaving(true)
    try {
      if (canPersistToSupabase(isAuthenticated) && currentBuilding.id) {
        await updateBuildingNotes(currentBuilding.id, draft)
      }
      selectBuilding({ ...currentBuilding, notes: draft })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="bldg-notes-btn" onClick={startEdit}>
        {currentBuilding.notes ? '📝 Edit notes' : '+ Add notes'}
      </button>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        style={{ width: '100%', fontSize: 11, fontFamily: 'Inter,sans-serif' }}
        placeholder="Building notes…"
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button type="button" className="btn-action primary" disabled={saving} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className="btn-action" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
