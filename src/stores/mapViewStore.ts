import { create } from 'zustand'

export interface MapViewSnapshot {
  lat: number
  lng: number
  zoom: number
}

interface MapViewState {
  snapshot: MapViewSnapshot | null
  setSnapshot: (snapshot: MapViewSnapshot) => void
}

/** Latest map center/zoom — updated on idle for hard refresh restore. */
export const useMapViewStore = create<MapViewState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}))
