import { create } from 'zustand'
import {
  DEFAULT_ADV_FILTERS,
  DEFAULT_DQ_FILTERS,
  type AdvFilterState,
  type AdvFilterValue,
  type DqFilterState,
} from '@/types/domain'

interface FilterStoreState {
  search: string
  park: string
  cluster: string
  manager: string
  adv: AdvFilterState
  advPanelOpen: boolean
  dq: DqFilterState
  setSearch: (search: string) => void
  setPark: (park: string) => void
  setCluster: (cluster: string) => void
  setManager: (manager: string) => void
  setAdvFilter: (key: keyof AdvFilterState, value: AdvFilterValue) => void
  clearAdvFilters: () => void
  toggleAdvPanel: () => void
  setAdvPanelOpen: (open: boolean) => void
  toggleDqFilter: (key: keyof DqFilterState) => void
  setDqFilter: (key: keyof DqFilterState, value: boolean) => void
  resetFilters: () => void
}

export const useFilterStore = create<FilterStoreState>((set) => ({
  search: '',
  park: '',
  cluster: '',
  manager: '',
  adv: { ...DEFAULT_ADV_FILTERS },
  advPanelOpen: false,
  dq: { ...DEFAULT_DQ_FILTERS },

  setSearch: (search) => set({ search }),
  setPark: (park) => set({ park }),
  setCluster: (cluster) => set({ cluster }),
  setManager: (manager) => set({ manager }),

  setAdvFilter: (key, value) =>
    set((state) => ({
      adv: { ...state.adv, [key]: value },
    })),

  clearAdvFilters: () => set({ adv: { ...DEFAULT_ADV_FILTERS } }),

  toggleAdvPanel: () => set((state) => ({ advPanelOpen: !state.advPanelOpen })),
  setAdvPanelOpen: (open) => set({ advPanelOpen: open }),

  toggleDqFilter: (key) =>
    set((state) => ({
      dq: { ...state.dq, [key]: !state.dq[key] },
    })),

  setDqFilter: (key, value) =>
    set((state) => ({
      dq: { ...state.dq, [key]: value },
    })),

  resetFilters: () =>
    set({
      search: '',
      park: '',
      cluster: '',
      manager: '',
      adv: { ...DEFAULT_ADV_FILTERS },
      dq: { ...DEFAULT_DQ_FILTERS },
    }),
}))
