const HISTORY_STATE_KEY = 'bmeRtuPictureViewer'

let historyEntryActive = false

export function isRtuPictureViewerHistoryState(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as Record<string, unknown>)[HISTORY_STATE_KEY],
  )
}

export function pushRtuPictureViewerHistory(): void {
  if (typeof window === 'undefined') return
  window.history.pushState({ [HISTORY_STATE_KEY]: true }, '')
  historyEntryActive = true
}

export function clearRtuPictureViewerHistoryFlag(): void {
  historyEntryActive = false
}

export function hasRtuPictureViewerHistoryEntry(): boolean {
  return historyEntryActive
}

/** Sync browser history after the viewer closes via UI (not browser back). */
export function syncRtuPictureViewerHistoryOnClose(): void {
  if (typeof window === 'undefined' || !historyEntryActive) return
  historyEntryActive = false
  window.history.back()
}
