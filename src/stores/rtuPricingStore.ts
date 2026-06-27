import { create } from 'zustand'
import {
  isDeployDataDirtyLocally,
  markDeployDataDirty,
  pricingSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import {
  DEFAULT_RTU_PRICING_ROWS,
  DEFAULT_RTU_PRICING_VERSION,
} from '@/lib/rtuPricing.defaults'
import { fetchRemoteJson, usesRemoteJsonData } from '@/lib/jsonDataUrls'
import bundledPricing from '../../supabase/data/rtu-pricing-rows.json'
import {
  DEFAULT_RCB_PRICING,
  type RcbPricingTable,
} from '@/lib/costEstimator.pricing'
import {
  parseRtuPricingWorkbook,
  rowsToRtuPricing,
  getRcbTiersFromPricing,
  type RtuPricingRow,
  type RtuPricingComponentField,
} from '@/lib/rtuPricingSheet'

const STORAGE_KEY = 'bme-rtu-pricing'

interface StoredRtuPricing {
  version?: string | null
  sourceFile?: string | null
  rows?: RtuPricingRow[]
}

function buildPricingTable(rows: RtuPricingRow[]): RcbPricingTable {
  const pricing = rowsToRtuPricing(rows)
  return { pricing, tiers: getRcbTiersFromPricing(pricing) }
}

function cloneRows(rows: RtuPricingRow[]): RtuPricingRow[] {
  return rows.map((row) => ({ ...row }))
}

interface RtuPricingState {
  rows: RtuPricingRow[]
  version: string | null
  sourceFile: string | null
  revision: number
  pricingTable: RcbPricingTable
  loaded: boolean
  load: () => Promise<void>
  resetToDefaults: () => void
  applyPricingImport: (
    rows: RtuPricingRow[],
    version: string | null,
    sourceFile: string,
  ) => void
  importWorkbook: (file: File) => Promise<{ rowCount: number }>
  updateRowField: (
    tonnageKey: number,
    field: RtuPricingComponentField,
    value: number,
  ) => void
  persist: () => void
}

function readStoredPricing(): StoredRtuPricing | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as StoredRtuPricing
    if (!parsed.rows?.length) return null
    return parsed
  } catch {
    return null
  }
}

function applyStoredPricing(
  parsed: StoredRtuPricing,
  set: (partial: Partial<RtuPricingState> | ((state: RtuPricingState) => Partial<RtuPricingState>)) => void,
  get: () => RtuPricingState,
): void {
  const rows = cloneRows(parsed.rows ?? [])
  set({
    rows,
    version: parsed.version ?? null,
    sourceFile: parsed.sourceFile ?? null,
    pricingTable: buildPricingTable(rows),
    revision: get().revision + 1,
    loaded: true,
  })
}

export const useRtuPricingStore = create<RtuPricingState>((set, get) => ({
  rows: cloneRows(DEFAULT_RTU_PRICING_ROWS),
  version: DEFAULT_RTU_PRICING_VERSION,
  sourceFile: null,
  revision: 0,
  pricingTable: DEFAULT_RCB_PRICING,
  loaded: false,

  load: async () => {
    if (!usesRemoteJsonData()) {
      const stored = readStoredPricing()
      if (stored) {
        applyStoredPricing(stored, set, get)
        return
      }
    }

    const remote = await fetchRemoteJson<StoredRtuPricing>('rtu-pricing-rows.json')
    const stored = readStoredPricing()

    if (stored && remote?.rows?.length) {
      const preferLocal =
        isDeployDataDirtyLocally() ||
        pricingSyncFingerprint({
          version: stored.version ?? null,
          rows: stored.rows ?? [],
        }) !==
          pricingSyncFingerprint({
            version: remote.version ?? null,
            rows: remote.rows,
          })
      if (preferLocal) {
        applyStoredPricing(stored, set, get)
        return
      }
      applyStoredPricing(remote, set, get)
      return
    }

    if (remote?.rows?.length) {
      applyStoredPricing(remote, set, get)
      return
    }

    if (stored) {
      applyStoredPricing(stored, set, get)
      return
    }

    const rows = cloneRows(
      bundledPricing.rows?.length ? bundledPricing.rows : DEFAULT_RTU_PRICING_ROWS,
    )
    set({
      rows,
      version: bundledPricing.version ?? DEFAULT_RTU_PRICING_VERSION,
      sourceFile: null,
      pricingTable: buildPricingTable(rows),
      revision: get().revision + 1,
      loaded: true,
    })
  },

  resetToDefaults: () => {
    const rows = cloneRows(
      bundledPricing.rows?.length ? bundledPricing.rows : DEFAULT_RTU_PRICING_ROWS,
    )
    set({
      rows,
      version: bundledPricing.version ?? DEFAULT_RTU_PRICING_VERSION,
      sourceFile: null,
      pricingTable: buildPricingTable(rows),
      revision: get().revision + 1,
    })
    get().persist()
  },

  applyPricingImport: (rows, version, sourceFile) => {
    set({
      rows: cloneRows(rows),
      version,
      sourceFile,
      pricingTable: buildPricingTable(rows),
      revision: get().revision + 1,
    })
    get().persist()
  },

  importWorkbook: async (file: File) => {
    const buffer = await file.arrayBuffer()
    const { version, rows } = parseRtuPricingWorkbook(buffer)
    if (!rows.length) {
      throw new Error('No tonnage rows found on the “RTU Pricing” sheet.')
    }
    set({
      rows: cloneRows(rows),
      version: version ?? null,
      sourceFile: file.name,
      pricingTable: buildPricingTable(rows),
      revision: get().revision + 1,
    })
    get().persist()
    return { rowCount: rows.length }
  },

  updateRowField: (tonnageKey, field, value) => {
    const safe = Number.isFinite(value) ? value : 0
    const rows = get().rows.map((row) =>
      row.tonnageKey === tonnageKey ? { ...row, [field]: safe } : row,
    )
    set({
      rows,
      pricingTable: buildPricingTable(rows),
      revision: get().revision + 1,
    })
    get().persist()
  },

  persist: () => {
    const { rows, version, sourceFile } = get()
    const payload: StoredRtuPricing = { rows, version, sourceFile }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    markDeployDataDirty()
  },
}))

export function getActiveRcbPricing(): RcbPricingTable {
  return useRtuPricingStore.getState().pricingTable
}
