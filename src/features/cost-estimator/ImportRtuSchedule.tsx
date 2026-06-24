import { useRef, useState } from 'react'
import { importCapitalRtuWorkbook } from '@/lib/capitalRtuWorkbook'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import type { Building } from '@/types/domain'
import styles from '../settings/SettingsModal.module.css'

export interface ImportRtuScheduleProps {
  buildings: Building[]
}

export function ImportRtuSchedule({ buildings }: ImportRtuScheduleProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const sourceFile = useRtuScheduleStore((s) => s.sourceFile)
  const applyEquipmentImport = useRtuScheduleStore((s) => s.applyEquipmentImport)
  const applyPricingImport = useRtuPricingStore((s) => s.applyPricingImport)
  const pricingTiers = useRtuPricingStore((s) => s.rows.length)

  const handleImport = async (file: File) => {
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const result = importCapitalRtuWorkbook(buffer, buildings)

      applyEquipmentImport(result.equipment, file.name)
      applyPricingImport(result.pricing.rows, result.pricing.version, file.name)

      const { stats } = result.equipment
      showToastSuccess(
        `Imported ${stats.matchedYears} replacement years, ${stats.matchedNotes} notes, and ${result.pricing.rowCount} pricing tiers`,
      )
    } catch (error) {
      showToastError(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={styles.bulkImport}>
      <button
        type="button"
        className="btn-action"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import RTU cost'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className={styles.hiddenFile}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImport(file)
        }}
      />
      <p className={styles.hint}>
        Reads <strong>Equipment</strong> (col E replacement year, col F notes) and{' '}
        <strong>RTU Pricing</strong> (per-tonnage costs), matched by building address and RTU number
        across all buildings.
      </p>
      {sourceFile ? (
        <p className={styles.bulkImportFile}>
          Workbook: {sourceFile}
          {pricingTiers ? ` · ${pricingTiers} tonnage tiers` : ''}
        </p>
      ) : null}
    </div>
  )
}
