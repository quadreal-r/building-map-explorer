import { create } from 'zustand'
import { applyThemeVars } from '@/lib/themes'
import { STORAGE_KEYS } from '@/lib/storageKeys'

interface SettingsState {
  themeIndex: number
  managerRenames: Record<string, string>
  githubPat: string
  githubRepo: string
  rememberGitHubPat: boolean
  loaded: boolean
  setThemeIndex: (index: number) => void
  setManagerRename: (original: string, name: string) => void
  setGitHubPat: (pat: string) => void
  setRememberGitHubPat: (remember: boolean) => void
  setGitHubRepo: (repo: string) => void
  applyTheme: (index: number) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

const SETTINGS_KEY = STORAGE_KEYS.settings

declare global {
  interface Window {
    __BME_EMBEDDED_SETTINGS__?: {
      themeIndex?: number
      managerRenames?: Record<string, string>
    } | null
  }
}

interface StoredSettings {
  themeIndex?: number
  managerRenames?: Record<string, string>
  githubPat?: string
  githubRepo?: string
  rememberGitHubPat?: boolean
}

function resolveRememberGitHubPat(parsed: StoredSettings): boolean {
  if (typeof parsed.rememberGitHubPat === 'boolean') return parsed.rememberGitHubPat
  // Existing installs persisted PAT before opt-in remember existed.
  return Boolean(parsed.githubPat?.trim())
}

function loadGitHubPatFromStorage(parsed: StoredSettings): string {
  const remember = resolveRememberGitHubPat(parsed)
  if (!remember) return ''
  return parsed.githubPat ?? ''
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeIndex: 0,
  managerRenames: {},
  githubPat: '',
  githubRepo: '',
  rememberGitHubPat: false,
  loaded: false,

  setThemeIndex: (index) => set({ themeIndex: index }),

  setManagerRename: (original, name) =>
    set((state) => ({
      managerRenames: { ...state.managerRenames, [original]: name },
    })),

  setGitHubPat: (pat) => {
    set({ githubPat: pat })
    if (get().rememberGitHubPat) void get().saveSettings()
  },

  setRememberGitHubPat: (remember) => {
    set({ rememberGitHubPat: remember })
    void get().saveSettings()
  },

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
        rememberGitHubPat: false,
        loaded: true,
      })
      return
    }

    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredSettings
        const themeIndex = parsed.themeIndex ?? 0
        const rememberGitHubPat = resolveRememberGitHubPat(parsed)
        const githubPat = loadGitHubPatFromStorage(parsed)
        get().applyTheme(themeIndex)
        set({
          themeIndex,
          managerRenames: parsed.managerRenames ?? {},
          githubPat,
          githubRepo: parsed.githubRepo ?? '',
          rememberGitHubPat,
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
    const { themeIndex, managerRenames, githubPat, githubRepo, rememberGitHubPat } = get()
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        themeIndex,
        theme: { name: String(themeIndex) },
        managers: Object.values(managerRenames),
        managerRenames,
        githubPat: rememberGitHubPat ? githubPat : '',
        rememberGitHubPat,
        githubRepo,
      }),
    )
  },
}))
