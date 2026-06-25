import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getJsonDataBaseUrl,
  jsonDataFileUrl,
  readJsonDataBaseUrlFromEnv,
  usesRemoteJsonData,
} from '@/lib/jsonDataUrls'

describe('jsonDataUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns undefined when env is not set', () => {
    expect(readJsonDataBaseUrlFromEnv()).toBeUndefined()
    expect(getJsonDataBaseUrl()).toBeUndefined()
    expect(jsonDataFileUrl('buildings.json')).toBeUndefined()
  })

  it('normalizes base URL and builds file URLs', () => {
    vi.stubEnv('VITE_JSON_DATA_BASE_URL', 'https://pub-example.r2.dev')
    expect(getJsonDataBaseUrl()).toBe('https://pub-example.r2.dev/')
    expect(usesRemoteJsonData()).toBe(true)
    expect(jsonDataFileUrl('buildings.json')).toBe('https://pub-example.r2.dev/buildings.json')
  })

  it('strips accidental .env line prefix', () => {
    vi.stubEnv(
      'VITE_JSON_DATA_BASE_URL',
      'VITE_JSON_DATA_BASE_URL=https://pub-example.r2.dev/',
    )
    expect(readJsonDataBaseUrlFromEnv()).toBe('https://pub-example.r2.dev/')
  })
})
