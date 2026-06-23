import { create } from 'zustand'

export type ModalId =
  | 'addMarker'
  | 'polygonDraw'
  | 'import'
  | 'notes'
  | 'costDetail'
  | 'confirmDelete'

interface UiState {
  modals: Partial<Record<ModalId, boolean>>
  settingsOpen: boolean
  openModal: (id: ModalId) => void
  closeModal: (id: ModalId) => void
  toggleModal: (id: ModalId) => void
  isModalOpen: (id: ModalId) => boolean
  closeAllModals: () => void
  setSettingsOpen: (open: boolean) => void
  openSettings: () => void
  closeSettings: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  modals: {},
  settingsOpen: false,

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
}))
