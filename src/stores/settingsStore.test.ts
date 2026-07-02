import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { useSettingsStore } from '@/stores/settingsStore'

describe('settingsStore GitHub PAT', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({
      themeIndex: 0,
      managerRenames: {},
      githubPat: '',
      githubRepo: '',
      rememberGitHubPat: false,
      loaded: false,
    })
  })

  it('does not persist PAT by default', async () => {
    useSettingsStore.getState().setGitHubPat('ghp_session_only')
    await useSettingsStore.getState().saveSettings()

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!) as {
      githubPat?: string
      rememberGitHubPat?: boolean
    }
    expect(parsed.githubPat).toBe('')
    expect(parsed.rememberGitHubPat).toBe(false)
    expect(useSettingsStore.getState().githubPat).toBe('ghp_session_only')
  })

  it('persists PAT when remember is enabled', async () => {
    useSettingsStore.getState().setRememberGitHubPat(true)
    useSettingsStore.getState().setGitHubPat('ghp_remembered')

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!) as {
      githubPat?: string
      rememberGitHubPat?: boolean
    }
    expect(parsed.githubPat).toBe('ghp_remembered')
    expect(parsed.rememberGitHubPat).toBe(true)
  })

  it('clears stored PAT when remember is turned off', async () => {
    useSettingsStore.getState().setRememberGitHubPat(true)
    useSettingsStore.getState().setGitHubPat('ghp_old')
    useSettingsStore.getState().setRememberGitHubPat(false)

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!) as {
      githubPat?: string
      rememberGitHubPat?: boolean
    }
    expect(parsed.githubPat).toBe('')
    expect(parsed.rememberGitHubPat).toBe(false)
    expect(useSettingsStore.getState().githubPat).toBe('ghp_old')
  })

  it('loads remembered PAT on startup', async () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        themeIndex: 0,
        managerRenames: {},
        githubPat: 'ghp_saved',
        rememberGitHubPat: true,
        githubRepo: 'owner/repo',
      }),
    )

    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().githubPat).toBe('ghp_saved')
    expect(useSettingsStore.getState().rememberGitHubPat).toBe(true)
  })

  it('does not load PAT when remember is false', async () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        themeIndex: 0,
        managerRenames: {},
        githubPat: 'ghp_stale',
        rememberGitHubPat: false,
        githubRepo: 'owner/repo',
      }),
    )

    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().githubPat).toBe('')
    expect(useSettingsStore.getState().rememberGitHubPat).toBe(false)
  })

  it('migrates legacy stored PAT as remembered', async () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        themeIndex: 0,
        managerRenames: {},
        githubPat: 'ghp_legacy',
        githubRepo: 'owner/repo',
      }),
    )

    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().githubPat).toBe('ghp_legacy')
    expect(useSettingsStore.getState().rememberGitHubPat).toBe(true)
  })
})
