import { create } from 'zustand'
import { rcbReplacementYearKey } from '@/lib/costEstimator'
import {
  isDeployDataDirtyLocally,
  markDeployDataDirty,
  scheduleSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
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

function readStoredSchedule(): StoredRtuSchedule | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as StoredRtuSchedule
  } catch {
    return null
  }
}

function applyStoredSchedule(
  parsed: StoredRtuSchedule,
  set: (partial: Partial<RtuScheduleState> | ((state: RtuScheduleState) => Partial<RtuScheduleState>)) => void,
): void {
  set({
    replacementYears: parsed.replacementYears ?? {},
    notes: parsed.notes ?? {},
    sourceFile: parsed.sourceFile ?? null,
    loaded: true,
  })
}

export const useRtuScheduleStore = create<RtuScheduleState>((set, get) => ({
  replacementYears: {},
  notes: {},
  sourceFile: null,
  loaded: false,

  load: async () => {
    if (!usesRemoteJsonData()) {
      const stored = readStoredSchedule()
      if (stored) {
        applyStoredSchedule(stored, set)
        return
      }
    }

    const remote = await fetchRemoteJson<StoredRtuSchedule>('rtu-schedule.json')
    const stored = readStoredSchedule()

    if (stored && remote) {
      const preferLocal =
        isDeployDataDirtyLocally() ||
        scheduleSyncFingerprint({
          replacementYears: stored.replacementYears ?? {},
          notes: stored.notes ?? {},
        }) !==
          scheduleSyncFingerprint({
            replacementYears: remote.replacementYears ?? {},
            notes: remote.notes ?? {},
          })
      if (preferLocal) {
        applyStoredSchedule(stored, set)
        return
      }
      applyStoredSchedule(remote, set)
      return
    }

    if (remote) {
      applyStoredSchedule(remote, set)
      return
    }

    if (stored) {
      applyStoredSchedule(stored, set)
      return
    }

    const bundled = bundledSchedule as StoredRtuSchedule
    applyStoredSchedule(bundled, set)
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
    markDeployDataDirty()
  },
}))

/** Replacement-year map keyed by `rcbReplacementYearKey` for the cost estimator. */
export function getRtuReplacementYearAssignments(): Record<string, string> {
  return useRtuScheduleStore.getState().replacementYears
}
