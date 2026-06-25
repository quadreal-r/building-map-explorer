import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRtuPictureManifestUrl,
  getRtuPicturesBaseUrl,
  rtuPictureFileUrl,
} from './rtuPictureUrls'

describe('rtuPictureUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses R2 base URL when VITE_RTU_PICTURES_BASE_URL is set', () => {
    vi.stubEnv('VITE_RTU_PICTURES_BASE_URL', 'https://cdn.example.com/rtu')
    expect(getRtuPicturesBaseUrl()).toBe('https://cdn.example.com/rtu/')
    expect(rtuPictureFileUrl('1590_RTU-04_(1).jpg')).toBe(
      'https://cdn.example.com/rtu/1590_RTU-04_(1).jpg',
    )
  })

  it('strips accidental full .env line pasted into the secret value', () => {
    vi.stubEnv(
      'VITE_RTU_PICTURES_BASE_URL',
      'VITE_RTU_PICTURES_BASE_URL=https://pub-example.r2.dev/',
    )
    expect(getRtuPicturesBaseUrl()).toBe('https://pub-example.r2.dev/')
    expect(rtuPictureFileUrl('100-RTU-01-1.jpg')).toBe(
      'https://pub-example.r2.dev/100-RTU-01-1.jpg',
    )
  })

  it('falls back to same-origin static path when R2 URL is unset', () => {
    vi.stubEnv('VITE_RTU_PICTURES_BASE_URL', '')
    vi.stubEnv('VITE_JSON_DATA_BASE_URL', '')
    vi.stubEnv('BASE_URL', '/building-map-explorer/')
    expect(getRtuPicturesBaseUrl()).toBe('/building-map-explorer/database/rtu-pictures/')
    expect(getRtuPictureManifestUrl()).toBe(
      '/building-map-explorer/database/rtu-pictures/manifest.json',
    )
  })

  it('loads manifest from JSON data bucket when configured', () => {
    vi.stubEnv('VITE_JSON_DATA_BASE_URL', 'https://pub-json.r2.dev/')
    expect(getRtuPictureManifestUrl()).toBe('https://pub-json.r2.dev/manifest.json')
  })
})
