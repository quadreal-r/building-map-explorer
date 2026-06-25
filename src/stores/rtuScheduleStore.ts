import { create } from 'zustand'
import { rcbReplacementYearKey } from '@/lib/costEstimator'
import { fetchRemoteJson, usesRemoteJsonData } from '@/lib/jsonDataUrls'
import { importEquipmentSchedule } from '@/lib/equipmentSheet'
import type { Building } from '@/types/domain'
import bundledSchedule from '../../supabase/data/rtu-schedule.json'

const STORAGE_KEY = 'bme-rtu-schedule'

interface StoredRtuSchedule {
  replacementYears?: Record<string, string>
  notes?: Record<string, string>
  sourceFile?: string | null
}

interface RtuScheduleState {
  replacementYears: Record<string, string>
  notes: Record<string, string>
  sourceFile: string | null
  loaded: boolean
  load: () => Promise<void>
  applyEquipmentImport: (result: import('@/lib/equipmentSheet').EquipmentImportResult, sourceFile: string) => void
  importWorkbook: (
    file: File,
    buildings: Building[],
  ) => Promise<{ stats: ReturnType<typeof importEquipmentSchedule>['stats'] }>
  setReplacementYear: (address: string, rtu: string, year: string, defaultYear: string) => void
  setNotes: (address: string, rtu: string, notes: string) => void
  getNotes: (address: string, rtu: string) => string
  persist: () => void
}

function scheduleStorageKey(address: string, rtu: string): string {
  return rcbReplacementYearKey(address, rtu)
}

export const useRtuScheduleStore = create<RtuScheduleState>((set, get) => ({
  replacementYears: {},
  notes: {},
  sourceFile: null,
  loaded: false,

  load: async () => {
    const loadFromStorage = (): boolean => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return false
      try {
        const parsed = JSON.parse(stored) as StoredRtuSchedule
        set({
          replacementYears: parsed.replacementYears ?? {},
          notes: parsed.notes ?? {},
          sourceFile: parsed.sourceFile ?? null,
          loaded: true,
        })
        return true
      } catch {
        return false
      }
    }

    if (!usesRemoteJsonData() && loadFromStorage()) return

    const remote = await fetchRemoteJson<StoredRtuSchedule>('rtu-schedule.json')
    if (remote) {
      set({
        replacementYears: remote.replacementYears ?? {},
        notes: remote.notes ?? {},
        sourceFile: remote.sourceFile ?? null,
        loaded: true,
      })
      return
    }

    if (usesRemoteJsonData() && loadFromStorage()) return

    const bundled = bundledSchedule as StoredRtuSchedule
    set({
      replacementYears: bundled.replacementYears ?? {},
      notes: bundled.notes ?? {},
      sourceFile: bundled.sourceFile ?? null,
      loaded: true,
    })
  },

  applyEquipmentImport: (result, sourceFile) => {
    set({
      replacementYears: result.replacementYears,
      notes: result.notes,
      sourceFile,
    })
    get().persist()
  },

  importWorkbook: async (file, buildings) => {
    const buffer = await file.arrayBuffer()
    const result = importEquipmentSchedule(buffer, buildings)
    set({
      replacementYears: result.replacementYears,
      notes: result.notes,
      sourceFile: file.name,
    })
    get().persist()
    return { stats: result.stats }
  },

  setReplacementYear: (address, rtu, year, defaultYear) => {
    const key = rcbReplacementYearKey(address, rtu)
    set((state) => {
      const next = { ...state.replacementYears }
      if (year === defaultYear) delete next[key]
      else next[key] = year
      return { replacementYears: next }
    })
    get().persist()
  },

  setNotes: (address, rtu, notes) => {
    const key = scheduleStorageKey(address, rtu)
    set((state) => {
      const next = { ...state.notes }
      const trimmed = notes.trim()
      if (trimmed) next[key] = trimmed
      else delete next[key]
      return { notes: next }
    })
    get().persist()
  },

  getNotes: (address, rtu) => {
    return get().notes[scheduleStorageKey(address, rtu)] ?? ''
  },

  persist: () => {
    const { replacementYears, notes, sourceFile } = get()
    const payload: StoredRtuSchedule = { replacementYears, notes, sourceFile }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  },
}))

/** Replacement-year map keyed by `rcbReplacementYearKey` for the cost estimator. */
export function getRtuReplacementYearAssignments(): Record<string, string> {
  return useRtuScheduleStore.getState().replacementYears
}
