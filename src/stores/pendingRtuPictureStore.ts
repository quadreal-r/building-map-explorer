import { create } from 'zustand'
import {
  assignPictureFileToRtu,
  stageGpsPicturesFromFiles,
  type StagedGpsPicture,
  type StageGpsPicturesResult,
} from '@/lib/rtuPictureGpsAssign'
import type { Building, Rtu } from '@/types/domain'

interface PendingRtuPictureState {
  items: StagedGpsPicture[]
  stageRevision: number
  stageFromFiles: (files: File[]) => Promise<StageGpsPicturesResult>
  updatePosition: (id: string, lat: number, lng: number) => void
  remove: (id: string) => void
  clear: () => void
  assignToRtu: (
    id: string,
    building: Building,
    rtu: Rtu,
  ) => Promise<{ fileName: string; pictureIndex: number }>
}

function revokeItemPreview(item: StagedGpsPicture): void {
  URL.revokeObjectURL(item.previewUrl)
}

export const usePendingRtuPictureStore = create<PendingRtuPictureState>((set, get) => ({
  items: [],
  stageRevision: 0,

  stageFromFiles: async (files) => {
    for (const item of get().items) revokeItemPreview(item)
    const result = await stageGpsPicturesFromFiles(files)
    if (result.staged.length) {
      set((state) => ({
        items: result.staged,
        stageRevision: state.stageRevision + 1,
      }))
    } else {
      set({ items: [] })
    }
    return result
  },

  updatePosition: (id, lat, lng) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, lat, lng } : item)),
    }))
  },

  remove: (id) => {
    const item = get().items.find((entry) => entry.id === id)
    if (item) revokeItemPreview(item)
    set((state) => ({ items: state.items.filter((entry) => entry.id !== id) }))
  },

  clear: () => {
    for (const item of get().items) revokeItemPreview(item)
    set({ items: [] })
  },

  assignToRtu: async (id, building, rtu) => {
    const item = get().items.find((entry) => entry.id === id)
    if (!item) throw new Error('Picture marker not found')

    const assigned = await assignPictureFileToRtu(item.file, building.address, rtu.name)
    get().remove(id)
    return assigned
  },
}))
