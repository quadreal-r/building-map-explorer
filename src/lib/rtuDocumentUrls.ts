/** Public URLs for RTU documents on Cloudflare R2 (rtu-documents bucket). */

import { readJsonDataBaseUrlFromEnv } from '@/lib/jsonDataUrls'

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function readRtuDocumentsBaseUrlFromEnv(): string | undefined {
  let value = import.meta.env.VITE_RTU_DOCUMENTS_BASE_URL?.trim()
  if (!value) return undefined

  const envLine = value.match(/^VITE_RTU_DOCUMENTS_BASE_URL\s*=\s*(.+)$/i)
  if (envLine) value = envLine[1]!.trim().replace(/^["']|["']$/g, '')

  return value || undefined
}

/** CDN / R2 public base for document files. Falls back to same-origin static folder in dev. */
export function getRtuDocumentsBaseUrl(): string {
  const fromEnv = readRtuDocumentsBaseUrlFromEnv()
  if (fromEnv) return normalizeBaseUrl(fromEnv)
  return normalizeBaseUrl(`${import.meta.env.BASE_URL}database/rtu-documents/`)
}

/** Manifest on R2 JSON bucket when configured, else bundled static file. */
export function getRtuDocumentsManifestUrl(): string {
  const jsonBase = readJsonDataBaseUrlFromEnv()
  if (jsonBase) return `${normalizeBaseUrl(jsonBase)}documents-manifest.json`
  return `${import.meta.env.BASE_URL}database/rtu-documents/documents-manifest.json`
}

export function rtuDocumentFileUrl(fileName: string): string {
  return `${getRtuDocumentsBaseUrl()}${encodeURIComponent(fileName)}`
}
