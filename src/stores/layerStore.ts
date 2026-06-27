import { create } from 'zustand'
import type { LayerKey } from '@/types/domain'

export type LayerVisibility = Record<LayerKey, boolean>

const DEFAULT_LAYERS: LayerVisibility = {
  rtu: true,
  polygons: true,
  sprinkler: true,
  electrical: true,
  hydrant: true,
  gas: true,
}

const ALL_LAYERS_OFF: LayerVisibility = {
  rtu: false,
  polygons: false,
  sprinkler: false,
  electrical: false,
  hydrant: false,
  gas: false,
}

export function areAllLayersHidden(layers: LayerVisibility): boolean {
  return !Object.values(layers).some(Boolean)
}

interface LayerState {
  layers: LayerVisibility
  toggleLayer: (key: LayerKey) => void
  setLayer: (key: LayerKey, visible: boolean) => void
  setLayers: (layers: LayerVisibility) => void
  resetLayers: () => void
  hideAllLayers: () => void
  showAllLayers: () => void
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

  hideAllLayers: () => set({ layers: { ...ALL_LAYERS_OFF } }),

  showAllLayers: () => set({ layers: { ...DEFAULT_LAYERS } }),
}))
