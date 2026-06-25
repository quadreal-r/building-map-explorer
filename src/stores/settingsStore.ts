import { create } from 'zustand'
import { applyThemeVars } from '@/lib/themes'

interface SettingsState {
  themeIndex: number
  managerRenames: Record<string, string>
  githubPat: string
  githubRepo: string
  loaded: boolean
  setThemeIndex: (index: number) => void
  setManagerRename: (original: string, name: string) => void
  setGitHubPat: (pat: string) => void
  setGitHubRepo: (repo: string) => void
  applyTheme: (index: number) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

const SETTINGS_KEY = 'bme-settings'

declare global {
  interface Window {
    __BME_EMBEDDED_SETTINGS__?: {
      themeIndex?: number
      managerRenames?: Record<string, string>
    } | null
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeIndex: 0,
  managerRenames: {},
  githubPat: '',
  githubRepo: '',
  loaded: false,

  setThemeIndex: (index) => set({ themeIndex: index }),

  setManagerRename: (original, name) =>
    set((state) => ({
      managerRenames: { ...state.managerRenames, [original]: name },
    })),

  setGitHubPat: (pat) => set({ githubPat: pat }),

  setGitHubRepo: (repo) => set({ githubRepo: repo }),

  applyTheme: (index) => {
    applyThemeVars(index)
    set({ themeIndex: index })
  },

  loadSettings: async () => {
    const embedded = typeof window !== 'undefined' ? window.__BME_EMBEDDED_SETTINGS__ : null
    if (embedded && typeof embedded === 'object') {
      const themeIndex = embedded.themeIndex ?? 0
      get().applyTheme(themeIndex)
      set({
        themeIndex,
        managerRenames: embedded.managerRenames ?? {},
        githubPat: '',
        githubRepo: '',
        loaded: true,
      })
      return
    }

    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          themeIndex?: number
          managerRenames?: Record<string, string>
          githubPat?: string
          githubRepo?: string
        }
        const themeIndex = parsed.themeIndex ?? 0
        get().applyTheme(themeIndex)
        set({
          themeIndex,
          managerRenames: parsed.managerRenames ?? {},
          githubPat: parsed.githubPat ?? '',
          githubRepo: parsed.githubRepo ?? '',
          loaded: true,
        })
        return
      } catch {
        /* use defaults */
      }
    }

    get().applyTheme(0)
    set({ loaded: true })
  },

  saveSettings: async () => {
    const { themeIndex, managerRenames, githubPat, githubRepo } = get()
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        themeIndex,
        theme: { name: String(themeIndex) },
        managers: Object.values(managerRenames),
        managerRenames,
        githubPat,
        githubRepo,
      }),
    )
  },
}))
