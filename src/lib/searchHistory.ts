import { STORAGE_KEYS } from '@/lib/storageKeys'

export const SEARCH_HISTORY_MAX = 6

const STORAGE_KEY = STORAGE_KEYS.searchHistory

export function loadSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, SEARCH_HISTORY_MAX)
  } catch {
    return []
  }
}

export function saveSearchHistory(history: string[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_MAX)))
}

/** Add a query to the front; dedupe and cap at SEARCH_HISTORY_MAX. */
export function pushSearchHistory(query: string, history: string[]): string[] {
  const trimmed = query.trim()
  if (!trimmed) return history
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, SEARCH_HISTORY_MAX)
}
