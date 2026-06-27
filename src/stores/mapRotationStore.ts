import { create } from 'zustand'

interface MapRotationState {
  heading: number
  tilt: number
  setHeading: (heading: number) => void
  setTilt: (tilt: number) => void
  resetRotation: () => void
}

/** User-controlled map rotation; reset via Ctrl+dblclick. */
export const useMapRotationStore = create<MapRotationState>((set) => ({
  heading: 0,
  tilt: 0,
  setHeading: (heading) => set({ heading }),
  setTilt: (tilt) => set({ tilt }),
  resetRotation: () => set({ heading: 0, tilt: 0 }),
}))
