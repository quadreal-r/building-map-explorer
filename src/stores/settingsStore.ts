import { create } from 'zustand'
import { applyThemeVars } from '@/lib/themes'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'

interface SettingsState {
  themeIndex: number
  managerRenames: Record<string, string>
  loaded: boolean
  setThemeIndex: (index: number) => void
  setManagerRename: (original: string, name: string) => void
  getManagerName: (original: string) => string
  applyTheme: (index: number) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

const SETTINGS_KEY = 'portfolio_settings'

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeIndex: 0,
  managerRenames: {},
  loaded: false,

  setThemeIndex: (index) => set({ themeIndex: index }),

  setManagerRename: (original, name) =>
    set((state) => ({
      managerRenames: { ...state.managerRenames, [original]: name },
    })),

  getManagerName: (original) => {
    const renamed = get().managerRenames[original]
    return renamed?.trim() ? renamed.trim() : original
  },

  applyTheme: (index) => {
    applyThemeVars(index)
    set({ themeIndex: index })
  },

  loadSettings: async () => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle()

      if (!error && data?.value && typeof data.value === 'object') {
        const value = data.value as {
          theme?: { name?: string }
          managers?: string[]
          managerRenames?: Record<string, string>
          themeIndex?: number
        }
        const themeIndex = value.themeIndex ?? 0
        get().applyTheme(themeIndex)
        set({
          themeIndex,
          managerRenames: value.managerRenames ?? {},
          loaded: true,
        })
        return
      }
    }

    const stored = localStorage.getItem('bme-settings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          themeIndex?: number
          managerRenames?: Record<string, string>
        }
        const themeIndex = parsed.themeIndex ?? 0
        get().applyTheme(themeIndex)
        set({
          themeIndex,
          managerRenames: parsed.managerRenames ?? {},
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
    const { themeIndex, managerRenames } = get()
    const payload = {
      themeIndex,
      theme: { name: String(themeIndex) },
      managers: Object.values(managerRenames),
      managerRenames,
    }

    localStorage.setItem('bme-settings', JSON.stringify(payload))

    if (isSupabaseConfigured) {
      await supabase.from('app_settings').upsert(
        {
          key: SETTINGS_KEY,
          value: payload,
        },
        { onConflict: 'key' },
      )
    }
  },
}))
