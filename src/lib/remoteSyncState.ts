const STORAGE_KEY = 'bme-remote-sync-state'

export interface RemoteSyncState {
  /** Last remote exportedAt the user dismissed or loaded. */
  acknowledgedExportedAt: string | null
  /** exportedAt from the last successful Settings push on this computer. */
  lastPushedExportedAt: string | null
  /** First remote check completed without showing a stale alert. */
  initialized: boolean
}

const DEFAULT_STATE: RemoteSyncState = {
  acknowledgedExportedAt: null,
  lastPushedExportedAt: null,
  initialized: false,
}

export function loadRemoteSyncState(): RemoteSyncState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<RemoteSyncState>
    return {
      acknowledgedExportedAt: parsed.acknowledgedExportedAt ?? null,
      lastPushedExportedAt: parsed.lastPushedExportedAt ?? null,
      initialized: parsed.initialized ?? false,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveRemoteSyncState(state: RemoteSyncState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function recordLocalSyncPush(exportedAt: string): void {
  const state = loadRemoteSyncState()
  saveRemoteSyncState({
    ...state,
    lastPushedExportedAt: exportedAt,
    acknowledgedExportedAt: exportedAt,
    initialized: true,
  })
}

export function acknowledgeRemoteSync(exportedAt: string): void {
  const state = loadRemoteSyncState()
  saveRemoteSyncState({
    ...state,
    acknowledgedExportedAt: exportedAt,
    initialized: true,
  })
}

export function initializeRemoteSyncBaseline(exportedAt: string): void {
  const state = loadRemoteSyncState()
  if (state.initialized) return
  saveRemoteSyncState({
    ...state,
    acknowledgedExportedAt: exportedAt,
    initialized: true,
  })
}

export function shouldPromptForRemoteSync(
  remoteExportedAt: string,
  state: RemoteSyncState = loadRemoteSyncState(),
): boolean {
  if (!state.initialized) return false
  if (remoteExportedAt === state.lastPushedExportedAt) return false
  if (!state.acknowledgedExportedAt) return true
  return remoteExportedAt > state.acknowledgedExportedAt
}
