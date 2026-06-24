import { importEquipmentSchedule, type EquipmentImportResult } from '@/lib/equipmentSheet'
import { parseRtuPricingWorkbook, type RtuPricingRow } from '@/lib/rtuPricingSheet'
import type { Building } from '@/types/domain'

export interface CapitalRtuPricingImport {
  version: string | null
  rows: RtuPricingRow[]
  rowCount: number
}

export interface CapitalRtuWorkbookImportResult {
  equipment: EquipmentImportResult
  pricing: CapitalRtuPricingImport
}

/**
 * Import Capital_RTU_Replacement workbook:
 * - Equipment sheet col E → replacement years, col F → RTU notes
 * - RTU Pricing sheet cols D–L → per-tonnage installed costs
 */
export function importCapitalRtuWorkbook(
  data: ArrayBuffer,
  buildings: Building[],
): CapitalRtuWorkbookImportResult {
  const equipment = importEquipmentSchedule(data, buildings)
  const { version, rows } = parseRtuPricingWorkbook(data)

  if (!rows.length) {
    throw new Error('No tonnage rows found on the “RTU Pricing” sheet.')
  }

  return {
    equipment,
    pricing: {
      version,
      rows,
      rowCount: rows.length,
    },
  }
}
