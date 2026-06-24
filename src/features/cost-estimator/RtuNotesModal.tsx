import { useState } from 'react'
import { Modal } from '@/components/Modal/Modal'
import styles from './RtuNotesModal.module.css'

export interface RtuNotesModalProps {
  open: boolean
  address: string
  rtu: string
  notes: string
  onClose: () => void
  onSave: (notes: string) => void
}

interface RtuNotesEditorProps {
  address: string
  rtu: string
  notes: string
  onClose: () => void
  onSave: (notes: string) => void
}

function RtuNotesEditor({ address, notes, onClose, onSave }: RtuNotesEditorProps) {
  const [draft, setDraft] = useState(notes)

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className={styles.body}>
      <p className={styles.subtitle}>{address}</p>
      <textarea
        className={styles.textarea}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add notes for this RTU…"
        rows={8}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-action btn-save" onClick={handleSave}>
          Save notes
        </button>
      </div>
    </div>
  )
}

export function RtuNotesModal({
  open,
  address,
  rtu,
  notes,
  onClose,
  onSave,
}: RtuNotesModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`Notes — ${rtu}`} width={420} align="center">
      {open ? (
        <RtuNotesEditor
          key={`${address}|${rtu}|${notes}`}
          address={address}
          rtu={rtu}
          notes={notes}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  )
}
