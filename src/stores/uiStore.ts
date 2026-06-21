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
  costBannerOpen: boolean
  openModal: (id: ModalId) => void
  closeModal: (id: ModalId) => void
  toggleModal: (id: ModalId) => void
  isModalOpen: (id: ModalId) => boolean
  closeAllModals: () => void
  setSettingsOpen: (open: boolean) => void
  openSettings: () => void
  closeSettings: () => void
  setCostBannerOpen: (open: boolean) => void
  toggleCostBanner: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  modals: {},
  settingsOpen: false,
  costBannerOpen: true,

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

  setCostBannerOpen: (open) => set({ costBannerOpen: open }),
  toggleCostBanner: () => set((state) => ({ costBannerOpen: !state.costBannerOpen })),
}))
