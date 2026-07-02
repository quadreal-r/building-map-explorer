import { beforeEach, describe, expect, it } from 'vitest'
import {
  addLocalDocumentLink,
  clearLocalDocumentsManifest,
  countLocalDocumentsManifestEntries,
  exportLocalDocumentsManifestForDeploy,
} from '@/lib/localDocumentsManifest'
import { STORAGE_KEYS } from '@/lib/storageKeys'

describe('localDocumentsManifest', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('exports nothing when empty', () => {
    expect(exportLocalDocumentsManifestForDeploy()).toBeUndefined()
    expect(countLocalDocumentsManifestEntries()).toBe(0)
  })

  it('stores and exports local document links', () => {
    addLocalDocumentLink('1 Main St|RTU-01', 'spec.pdf')
    addLocalDocumentLink('1 Main St|RTU-01', 'warranty.pdf')

    const manifest = exportLocalDocumentsManifestForDeploy()
    expect(manifest?.entries['1 Main St|RTU-01']).toEqual(['spec.pdf', 'warranty.pdf'])
    expect(countLocalDocumentsManifestEntries()).toBe(2)
  })

  it('clears local manifest overrides', () => {
    addLocalDocumentLink('1 Main St|RTU-01', 'spec.pdf')
    clearLocalDocumentsManifest()
    expect(localStorage.getItem(STORAGE_KEYS.localDocumentsManifest)).toBeNull()
    expect(countLocalDocumentsManifestEntries()).toBe(0)
  })
})
