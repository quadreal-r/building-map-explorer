import { create } from 'zustand'
import type { PortfolioData } from '@/types/domain'
import { setPortfolioDirtyLocally } from '@/hooks/usePortfolioData'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const STORAGE_KEY = STORAGE_KEYS.portfolio

interface PortfolioStoreState {
  portfolio: PortfolioData | null
  unsaved: boolean
  setPortfolio: (data: PortfolioData, options?: { markSaved?: boolean }) => void
  patchPortfolio: (data: PortfolioData) => void
  markSaved: () => void
  markUnsaved: () => void
  loadFromStorage: () => PortfolioData | null
  persistToStorage: (data: PortfolioData) => void
}

export const usePortfolioStore = create<PortfolioStoreState>((set, get) => ({
  portfolio: null,
  unsaved: false,

  setPortfolio: (data, options) => {
    get().persistToStorage(data)
    set({ portfolio: data, unsaved: options?.markSaved === false })
  },

  patchPortfolio: (data) => {
    get().persistToStorage(data)
    setPortfolioDirtyLocally(true)
    set({ portfolio: data, unsaved: true })
  },

  markSaved: () => {
    setPortfolioDirtyLocally(false)
    set({ unsaved: false })
  },
  markUnsaved: () => set({ unsaved: true }),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as PortfolioData
    } catch {
      return null
    }
  },

  persistToStorage: (data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* quota */
    }
  },
}))
