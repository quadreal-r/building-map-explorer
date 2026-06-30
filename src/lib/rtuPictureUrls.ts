/** Public URLs for deployed RTU pictures (Cloudflare R2 or same-origin fallback). */

import { readJsonDataBaseUrlFromEnv } from '@/lib/jsonDataUrls'

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/** Read R2 base URL from env; tolerates pasting a full `.env` line into GitHub secrets. */
function readRtuPicturesBaseUrlFromEnv(): string | undefined {
  let value = import.meta.env.VITE_RTU_PICTURES_BASE_URL?.trim()
  if (!value) return undefined

  const envLine = value.match(/^VITE_RTU_PICTURES_BASE_URL\s*=\s*(.+)$/i)
  if (envLine) value = envLine[1]!.trim().replace(/^["']|["']$/g, '')

  return value || undefined
}

/** CDN / R2 public base for image files. Falls back to GitHub Pages static folder in dev. */
export function getRtuPicturesBaseUrl(): string {
  const fromEnv = readRtuPicturesBaseUrlFromEnv()
  if (fromEnv) return normalizeBaseUrl(fromEnv)
  return normalizeBaseUrl(`${import.meta.env.BASE_URL}database/rtu-pictures/`)
}

/** True when RTU pictures load from a configured Cloudflare R2 public URL. */
export function usesRemoteRtuPicturesCdn(): boolean {
  return Boolean(readRtuPicturesBaseUrlFromEnv())
}

/** Manifest on R2 JSON bucket when configured, else same-origin static file. */
export function getRtuPictureManifestUrl(): string {
  const jsonBase = readJsonDataBaseUrlFromEnv()
  if (jsonBase) return `${normalizeBaseUrl(jsonBase)}manifest.json`
  return `${import.meta.env.BASE_URL}database/rtu-pictures/manifest.json`
}

export function rtuPictureFileUrl(fileName: string): string {
  return `${getRtuPicturesBaseUrl()}${encodeURIComponent(fileName)}`
}
