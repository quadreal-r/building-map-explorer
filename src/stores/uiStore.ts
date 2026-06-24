import { create } from 'zustand'

export type ModalId =
  | 'addMarker'
  | 'polygonDraw'
  | 'import'
  | 'notes'
  | 'costDetail'
  | 'confirmDelete'

export type AddMarkerClickHandler = (lat: number, lng: number) => void

interface UiState {
  modals: Partial<Record<ModalId, boolean>>
  settingsOpen: boolean
  addMarkerPickMode: boolean
  addMarkerClickHandler: AddMarkerClickHandler | null
  polygonDrawMode: boolean
  openModal: (id: ModalId) => void
  closeModal: (id: ModalId) => void
  toggleModal: (id: ModalId) => void
  isModalOpen: (id: ModalId) => boolean
  closeAllModals: () => void
  setSettingsOpen: (open: boolean) => void
  openSettings: () => void
  closeSettings: () => void
  setAddMarkerPickMode: (active: boolean) => void
  setAddMarkerClickHandler: (handler: AddMarkerClickHandler | null) => void
  setPolygonDrawMode: (active: boolean) => void
  clearAddMarkerPlacement: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  modals: {},
  settingsOpen: false,
  addMarkerPickMode: false,
  addMarkerClickHandler: null,
  polygonDrawMode: false,

  openModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: true },
    })),

  closeModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: false },
    })),

  toggleModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: !state.modals[id] },
    })),

  isModalOpen: (id) => Boolean(get().modals[id]),

  closeAllModals: () => set({ modals: {} }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setAddMarkerPickMode: (active) => set({ addMarkerPickMode: active }),
  setAddMarkerClickHandler: (handler) => set({ addMarkerClickHandler: handler }),
  setPolygonDrawMode: (active) => set({ polygonDrawMode: active }),
  clearAddMarkerPlacement: () => set({ addMarkerPickMode: false, addMarkerClickHandler: null }),
}))
