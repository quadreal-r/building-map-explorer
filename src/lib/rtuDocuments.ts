/** RTU document links from Cloudflare R2 bucket rtu-documents + documents-manifest.json. */

import { usesRemoteJsonData } from '@/lib/jsonDataUrls'
import {
  getRtuDocumentsManifestUrl,
  rtuDocumentFileUrl,
} from '@/lib/rtuDocumentUrls'
import { resolveManifestRtuKey, rtuPictureKey, type RtuPictureManifest } from '@/lib/rtuPictures'

export interface RtuDocumentsManifest {
  entries: Record<string, string[]>
}

export interface RtuDocument {
  fileName: string
  url: string
  label: string
}

const BUNDLED_MANIFEST_URL = `${import.meta.env.BASE_URL}database/rtu-documents/documents-manifest.json`

let manifestCache: RtuDocumentsManifest | null = null
let manifestPromise: Promise<RtuDocumentsManifest> | null = null

async function fetchManifestFromUrl(
  url: string,
  options?: { allowEmpty?: boolean },
): Promise<RtuDocumentsManifest | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return options?.allowEmpty ? { entries: {} } : null
    const data = (await res.json()) as RtuDocumentsManifest
    if (!data || typeof data.entries !== 'object') return { entries: {} }
    return data
  } catch {
    return options?.allowEmpty ? { entries: {} } : null
  }
}

export function clearRtuDocumentsManifestCache(): void {
  manifestCache = null
}

export async function loadRtuDocumentsManifest(): Promise<RtuDocumentsManifest> {
  if (manifestCache) return manifestCache
  if (manifestPromise) return manifestPromise

  manifestPromise = (async () => {
    try {
      const remoteUrl = getRtuDocumentsManifestUrl()
      const cloudflareJson = usesRemoteJsonData()

      if (cloudflareJson) {
        const remote = await fetchManifestFromUrl(remoteUrl, { allowEmpty: true })
        if (remote) {
          manifestCache = remote
          return manifestCache
        }
        console.warn(
          '[rtuDocuments] Cloudflare documents-manifest.json unavailable; falling back to bundled copy.',
        )
      } else if (remoteUrl !== BUNDLED_MANIFEST_URL) {
        const remote = await fetchManifestFromUrl(remoteUrl)
        if (remote) {
          manifestCache = remote
          return manifestCache
        }
      }

      const bundled = await fetchManifestFromUrl(BUNDLED_MANIFEST_URL)
      manifestCache = bundled ?? { entries: {} }
      return manifestCache
    } finally {
      manifestPromise = null
    }
  })()

  return manifestPromise
}

function documentLabel(fileName: string): string {
  const base = fileName.includes('/') ? fileName.slice(fileName.lastIndexOf('/') + 1) : fileName
  return base.replace(/_/g, ' ')
}

export async function listRtuDocuments(
  buildingAddress: string,
  rtuName: string,
): Promise<RtuDocument[]> {
  const manifest = await loadRtuDocumentsManifest()
  const manifestKey = resolveManifestRtuKey(buildingAddress, rtuName, manifest as RtuPictureManifest)
  const key = rtuPictureKey(buildingAddress, rtuName)
  const names = [
    ...(manifest.entries[manifestKey] ?? []),
    ...(manifestKey !== key ? manifest.entries[key] ?? [] : []),
  ]

  const seen = new Set<string>()
  const docs: RtuDocument[] = []
  for (const fileName of names) {
    const trimmed = fileName.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    docs.push({
      fileName: trimmed,
      url: rtuDocumentFileUrl(trimmed),
      label: documentLabel(trimmed),
    })
  }

  return docs.sort((a, b) => a.label.localeCompare(b.label))
}
