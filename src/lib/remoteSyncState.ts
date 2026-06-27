const STORAGE_KEY = 'bme-remote-sync-state'

export interface RemoteSyncState {
  /** Last remote exportedAt the user dismissed or loaded. */
  acknowledgedExportedAt: string | null
  /** exportedAt from the last successful Settings push on this computer. */
  lastPushedExportedAt: string | null
  /** Hidden RTU picture keys included in the last successful push on this computer. */
  lastPushedHiddenKeys: string[] | null
  /** Fingerprints of portfolio / schedule / pricing included in the last successful push. */
  lastPushedPortfolioFingerprint: string | null
  lastPushedScheduleFingerprint: string | null
  lastPushedPricingFingerprint: string | null
  /** First remote check completed without showing a stale alert. */
  initialized: boolean
}

const DEFAULT_STATE: RemoteSyncState = {
  acknowledgedExportedAt: null,
  lastPushedExportedAt: null,
  lastPushedHiddenKeys: null,
  lastPushedPortfolioFingerprint: null,
  lastPushedScheduleFingerprint: null,
  lastPushedPricingFingerprint: null,
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
      lastPushedHiddenKeys: Array.isArray(parsed.lastPushedHiddenKeys)
        ? parsed.lastPushedHiddenKeys.filter((item): item is string => typeof item === 'string')
        : null,
      lastPushedPortfolioFingerprint:
        typeof parsed.lastPushedPortfolioFingerprint === 'string'
          ? parsed.lastPushedPortfolioFingerprint
          : null,
      lastPushedScheduleFingerprint:
        typeof parsed.lastPushedScheduleFingerprint === 'string'
          ? parsed.lastPushedScheduleFingerprint
          : null,
      lastPushedPricingFingerprint:
        typeof parsed.lastPushedPricingFingerprint === 'string'
          ? parsed.lastPushedPricingFingerprint
          : null,
      initialized: parsed.initialized ?? false,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveRemoteSyncState(state: RemoteSyncState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function recordLocalSyncPush(
  exportedAt: string,
  options?: {
    hiddenKeys?: string[]
    portfolioFingerprint?: string
    scheduleFingerprint?: string
    pricingFingerprint?: string
  },
): void {
  const state = loadRemoteSyncState()
  saveRemoteSyncState({
    ...state,
    lastPushedExportedAt: exportedAt,
    acknowledgedExportedAt: exportedAt,
    lastPushedHiddenKeys: options?.hiddenKeys ?? state.lastPushedHiddenKeys,
    lastPushedPortfolioFingerprint:
      options?.portfolioFingerprint ?? state.lastPushedPortfolioFingerprint,
    lastPushedScheduleFingerprint:
      options?.scheduleFingerprint ?? state.lastPushedScheduleFingerprint,
    lastPushedPricingFingerprint:
      options?.pricingFingerprint ?? state.lastPushedPricingFingerprint,
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
