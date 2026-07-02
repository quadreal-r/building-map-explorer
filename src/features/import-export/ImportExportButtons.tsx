import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { importCapitalRtuWorkbook } from '@/lib/capitalRtuWorkbook'
import { detectExcelWorkbookKind } from '@/lib/excelWorkbookType'
import { exportPortfolioExcel, importPortfolioExcel } from '@/lib/excel'
import { importEquipmentSchedule } from '@/lib/equipmentSheet'
import { markSchedulePricingDirty, syncLegacyDirtyFlags } from '@/lib/syncState'
import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { normalizePortfolioData } from '@/types/domain'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import type { Building, PortfolioData } from '@/types/domain'
import { SettingsToolButton } from '@/features/settings/SettingsToolButton'
import styles from '@/features/settings/SettingsModal.module.css'

export interface ImportExportButtonsProps {
  portfolio: PortfolioData
  buildings: Building[]
  onImport: (data: PortfolioData) => void
  onExportComplete?: () => void
  mode?: 'both' | 'export' | 'import'
}

export function ImportExportButtons({
  portfolio,
  buildings,
  onImport,
  onExportComplete,
  mode = 'both',
}: ImportExportButtonsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const sourceFile = useRtuScheduleStore((s) => s.sourceFile)
  const pricingTiers = useRtuPricingStore((s) => s.rows.length)
  const applyEquipmentImport = useRtuScheduleStore((s) => s.applyEquipmentImport)
  const applyPricingImport = useRtuPricingStore((s) => s.applyPricingImport)

  const handleExport = async () => {
    setBusy(true)
    try {
      await exportPortfolioExcel(portfolio)
      showToastSuccess('✓ Excel exported')
      onExportComplete?.()
    } catch (e) {
      showToastError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCapitalImport = async (buffer: ArrayBuffer, file: File) => {
    const sheetNames = XLSX.read(buffer, { type: 'array', bookSheets: true }).SheetNames
    const hasPricing = sheetNames.some((name) => /^rtu pricing$/i.test(name.trim()))

    if (hasPricing) {
      const result = importCapitalRtuWorkbook(buffer, buildings)
      applyEquipmentImport(result.equipment, file.name)
      applyPricingImport(result.pricing.rows, result.pricing.version, file.name)
      markSchedulePricingDirty()
      syncLegacyDirtyFlags()
      invalidateUnsyncedChanges()
      const { stats } = result.equipment
      showToastSuccess(
        `Imported ${stats.matchedYears} replacement years, ${stats.matchedNotes} notes, and ${result.pricing.rowCount} pricing tiers. Sync to Cloudflare & GitHub to replace cloud data.`,
      )
      return
    }

    const equipment = importEquipmentSchedule(buffer, buildings)
    applyEquipmentImport(equipment, file.name)
    markSchedulePricingDirty()
    syncLegacyDirtyFlags()
    invalidateUnsyncedChanges()
    const { stats } = equipment
    showToastSuccess(
      `Imported ${stats.matchedYears} replacement years and ${stats.matchedNotes} notes. Sync to Cloudflare & GitHub to replace cloud data.`,
    )
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const kind = detectExcelWorkbookKind(
        XLSX.read(buffer, { type: 'array', bookSheets: true }).SheetNames,
      )

      if (kind === 'portfolio') {
        const data = normalizePortfolioData(importPortfolioExcel(buffer))
        onImport(data)
        invalidateUnsyncedChanges()
        showToastSuccess(
          '✓ Database imported — use Settings → Sync to Cloudflare & GitHub to replace cloud JSON.',
        )
        return
      }

      await handleCapitalImport(buffer, file)
    } catch (e) {
      showToastError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const showExport = mode === 'both' || mode === 'export'
  const showImport = mode === 'both' || mode === 'import'

  return (
    <>
      {showExport ? (
        <SettingsToolButton
          variant="export"
          tooltip="Export buildings, RTUs, tenant polygons, utilities, and Cloudflare RTU picture references to Excel."
          onClick={() => void handleExport()}
          disabled={busy}
        >
          {busy ? 'Exporting…' : 'Export Database to Excel'}
        </SettingsToolButton>
      ) : null}
      {showImport ? (
        <SettingsToolButton
          tooltip={
            <>
              Import Database from Excel: portfolio export (Buildings, RTUs, Tenant Polygons, Utilities) updates
              map positions and equipment, or Capital RTU Replacement workbook (Equipment + RTU Pricing)
              updates replacement years, notes, and tonnage pricing.
            </>
          }
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Importing…' : 'Import Database from Excel'}
        </SettingsToolButton>
      ) : null}
      {showImport ? (
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className={styles.hiddenFile}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
      ) : null}
      {showImport && sourceFile ? (
        <p className={styles.bulkImportFile}>
          Last workbook: {sourceFile}
          {pricingTiers ? ` · ${pricingTiers} tonnage tiers` : ''}
        </p>
      ) : null}
    </>
  )
}
