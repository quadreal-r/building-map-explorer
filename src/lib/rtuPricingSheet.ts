import * as XLSX from 'xlsx'
import type { CostBasis } from '@/types/domain'
import type { RtuPricingUnit } from '@/lib/costEstimator.pricing'

/** One tonnage row from the workbook “RTU Pricing” sheet (columns D–L are editable inputs). */
export interface RtuPricingRow {
  tonnageKey: number
  label: string
  notes: string
  model: string
  supplyStd: number
  supplyHyb: number
  install: number
  consulting: number
  structural: number
  serviceBalancing: number
  electrical: number
  miscellaneous: number
  supervisoryMult: number
}

export type RtuPricingComponentField = keyof Pick<
  RtuPricingRow,
  | 'supplyStd'
  | 'supplyHyb'
  | 'install'
  | 'consulting'
  | 'structural'
  | 'serviceBalancing'
  | 'electrical'
  | 'miscellaneous'
  | 'supervisoryMult'
>

export const RTU_PRICING_COMPONENT_FIELDS: RtuPricingComponentField[] = [
  'supplyStd',
  'supplyHyb',
  'install',
  'consulting',
  'structural',
  'serviceBalancing',
  'electrical',
  'miscellaneous',
  'supervisoryMult',
]

export const RTU_PRICING_COLUMN_LABELS: Record<RtuPricingComponentField, string> = {
  supplyStd: 'Std supply $ (D)',
  supplyHyb: 'Hybrid supply $ (E)',
  install: 'Install $ (F)',
  consulting: 'Consulting $ (G)',
  structural: 'Structural $ (H)',
  serviceBalancing: 'Service / balance $ (I)',
  electrical: 'Electrical $ (J)',
  miscellaneous: 'Misc $ (K)',
  supervisoryMult: 'Supervisory × (L)',
}

export const RTU_PRICING_MONEY_FIELDS = new Set<RtuPricingComponentField>([
  'supplyStd',
  'supplyHyb',
  'install',
  'consulting',
  'structural',
  'serviceBalancing',
  'electrical',
  'miscellaneous',
])

const HYB_YEARS = ['2026', '2027', '2028', '2029', '2030', '2031', '2032'] as const
const HYB_ESCALATION = 1.05
const STD_YEAR = '2025'

const SHEET_COL = {
  notes: 0,
  model: 1,
  tonnage: 2,
  supplyStd: 3,
  supplyHyb: 4,
  install: 5,
  consulting: 6,
  structural: 7,
  serviceBalancing: 8,
  electrical: 9,
  miscellaneous: 10,
  supervisoryMult: 11,
  totalStd: 12,
  totalHyb2026: 13,
} as const

function cellNum(ws: XLSX.WorkSheet, row: number, col: number): number {
  const value = ws[XLSX.utils.encode_cell({ r: row, c: col })]?.v
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function cellStr(ws: XLSX.WorkSheet, row: number, col: number): string {
  return String(ws[XLSX.utils.encode_cell({ r: row, c: col })]?.v ?? '').trim()
}

export function parseTonnageLabel(label: string): number | null {
  const match = label.match(/([\d.]+)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

/** All-in installed cost from workbook component columns (D–L). */
export function computeRtuAllInFromComponents(
  row: RtuPricingRow,
  basis: CostBasis,
): number {
  const supply = basis === 'hyb' ? row.supplyHyb : row.supplyStd
  const sum =
    supply +
    row.install +
    row.consulting +
    row.structural +
    row.serviceBalancing +
    row.electrical +
    row.miscellaneous
  const mult = row.supervisoryMult > 0 ? row.supervisoryMult : 1.05
  return Math.round(sum * mult)
}

export function buildRtuPricingUnit(row: RtuPricingRow): RtuPricingUnit {
  const hyb2026 = computeRtuAllInFromComponents(row, 'hyb')
  const hyb: Record<string, number> = {}
  for (let i = 0; i < HYB_YEARS.length; i++) {
    const year = HYB_YEARS[i]!
    hyb[year] = Math.round(hyb2026 * HYB_ESCALATION ** i)
  }
  return {
    l: row.label,
    std: { [STD_YEAR]: computeRtuAllInFromComponents(row, 'std') },
    hyb,
  }
}

export function rowsToRtuPricing(rows: RtuPricingRow[]): Record<string, RtuPricingUnit> {
  const pricing: Record<string, RtuPricingUnit> = {}
  for (const row of rows) {
    pricing[String(row.tonnageKey)] = buildRtuPricingUnit(row)
  }
  return pricing
}

export function getRcbTiersFromPricing(pricing: Record<string, RtuPricingUnit>): number[] {
  return Object.keys(pricing)
    .map(Number)
    .sort((a, b) => a - b)
}

export function parseRtuPricingWorkbook(
  data: ArrayBuffer,
): { version: string | null; rows: RtuPricingRow[] } {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName =
    wb.SheetNames.find((name) => /rtu pricing/i.test(name)) ?? wb.SheetNames[0]
  if (!sheetName) return { version: null, rows: [] }

  const ws = wb.Sheets[sheetName]
  if (!ws?.['!ref']) return { version: null, rows: [] }

  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows: RtuPricingRow[] = []

  for (let r = 1; r <= range.e.r; r++) {
    const label = cellStr(ws, r, SHEET_COL.tonnage)
    if (!label || !/ton/i.test(label)) continue

    const tonnageKey = parseTonnageLabel(label)
    if (tonnageKey == null) continue

    rows.push({
      tonnageKey,
      label,
      notes: cellStr(ws, r, SHEET_COL.notes),
      model: cellStr(ws, r, SHEET_COL.model),
      supplyStd: cellNum(ws, r, SHEET_COL.supplyStd),
      supplyHyb: cellNum(ws, r, SHEET_COL.supplyHyb),
      install: cellNum(ws, r, SHEET_COL.install),
      consulting: cellNum(ws, r, SHEET_COL.consulting),
      structural: cellNum(ws, r, SHEET_COL.structural),
      serviceBalancing: cellNum(ws, r, SHEET_COL.serviceBalancing),
      electrical: cellNum(ws, r, SHEET_COL.electrical),
      miscellaneous: cellNum(ws, r, SHEET_COL.miscellaneous),
      supervisoryMult: cellNum(ws, r, SHEET_COL.supervisoryMult) || 1.05,
    })
  }

  const versionMatch = sheetName.match(/V([\d_]+)/i)
  return { version: versionMatch?.[1] ?? null, rows }
}
