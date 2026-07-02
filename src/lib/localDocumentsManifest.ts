/** Local documents-manifest additions not yet synced to Cloudflare. */

import { STORAGE_KEYS } from '@/lib/storageKeys'
import type { DeployDocumentsManifestPayload } from '@/types/deployBundle'

const STORAGE_KEY = STORAGE_KEYS.localDocumentsManifest

interface LocalDocumentsManifest {
  entries: Record<string, string[]>
}

function readLocal(): LocalDocumentsManifest {
  if (typeof localStorage === 'undefined') return { entries: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { entries: {} }
    const parsed = JSON.parse(raw) as Partial<LocalDocumentsManifest>
    return { entries: parsed.entries ?? {} }
  } catch {
    return { entries: {} }
  }
}

function writeLocal(manifest: LocalDocumentsManifest): void {
  if (typeof localStorage === 'undefined') return
  const hasEntries = Object.keys(manifest.entries).length > 0
  if (!hasEntries) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest))
}

export function exportLocalDocumentsManifestForDeploy(): DeployDocumentsManifestPayload | undefined {
  const { entries } = readLocal()
  if (!Object.keys(entries).length) return undefined
  return { entries }
}

export function countLocalDocumentsManifestEntries(): number {
  let total = 0
  for (const files of Object.values(readLocal().entries)) {
    total += files.length
  }
  return total
}

export function clearLocalDocumentsManifest(): void {
  writeLocal({ entries: {} })
}

/** Register a document filename for an RTU before the file is on Cloudflare. */
export function addLocalDocumentLink(rtuKey: string, fileName: string): void {
  const trimmed = fileName.trim()
  if (!rtuKey.trim() || !trimmed) return
  const manifest = readLocal()
  const files = manifest.entries[rtuKey] ?? []
  if (files.includes(trimmed)) return
  manifest.entries[rtuKey] = [...files, trimmed].sort((a, b) => a.localeCompare(b))
  writeLocal(manifest)
}
