import { create } from 'zustand'
import type { LayerKey } from '@/types/domain'

export type LayerVisibility = Record<LayerKey, boolean>

const DEFAULT_LAYERS: LayerVisibility = {
  rtu: true,
  sprinkler: true,
  electrical: true,
  hydrant: true,
  gas: true,
}

interface LayerState {
  layers: LayerVisibility
  toggleLayer: (key: LayerKey) => void
  setLayer: (key: LayerKey, visible: boolean) => void
  setLayers: (layers: LayerVisibility) => void
  resetLayers: () => void
}

export const useLayerStore = create<LayerState>((set) => ({
  layers: { ...DEFAULT_LAYERS },

  toggleLayer: (key) =>
    set((state) => ({
      layers: { ...state.layers, [key]: !state.layers[key] },
    })),

  setLayer: (key, visible) =>
    set((state) => ({
      layers: { ...state.layers, [key]: visible },
    })),

  setLayers: (layers) => set({ layers: { ...layers } }),

  resetLayers: () => set({ layers: { ...DEFAULT_LAYERS } }),
}))
