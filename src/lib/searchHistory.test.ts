import { afterEach, describe, expect, it } from 'vitest'
import {
  SEARCH_HISTORY_MAX,
  loadSearchHistory,
  pushSearchHistory,
  saveSearchHistory,
} from '@/lib/searchHistory'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const STORAGE_KEY = STORAGE_KEYS.searchHistory

describe('searchHistory', () => {
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  it('caps history at six items', () => {
    let history: string[] = []
    for (let i = 1; i <= 8; i++) {
      history = pushSearchHistory(`query-${i}`, history)
    }
    expect(history).toHaveLength(SEARCH_HISTORY_MAX)
    expect(history[0]).toBe('query-8')
    expect(history[5]).toBe('query-3')
  })

  it('moves duplicate searches to the front', () => {
    const history = pushSearchHistory('bristol', pushSearchHistory('derry', ['bristol', '2320']))
    expect(history).toEqual(['bristol', 'derry', '2320'])
  })

  it('ignores blank queries', () => {
    expect(pushSearchHistory('   ', ['existing'])).toEqual(['existing'])
  })

  it('persists to localStorage', () => {
    saveSearchHistory(['one', 'two'])
    expect(loadSearchHistory()).toEqual(['one', 'two'])
  })
})
