import { create } from 'zustand'
import type { Building } from '@/types/domain'

interface SelectionState {
  currentBuilding: Building | null
  dragMode: boolean
  sidebarCollapsed: boolean
  setCurrentBuilding: (building: Building | null) => void
  selectBuilding: (building: Building) => void
  clearSelection: () => void
  setDragMode: (active: boolean) => void
  toggleDragMode: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  currentBuilding: null,
  dragMode: false,
  sidebarCollapsed: false,

  setCurrentBuilding: (building) => set({ currentBuilding: building }),
  selectBuilding: (building) => set({ currentBuilding: building }),
  clearSelection: () => set({ currentBuilding: null }),

  setDragMode: (active) => set({ dragMode: active }),
  toggleDragMode: () => set((state) => ({ dragMode: !state.dragMode })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}))
