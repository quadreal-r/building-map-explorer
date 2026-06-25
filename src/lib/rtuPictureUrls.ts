/** Public URLs for deployed RTU pictures (Cloudflare R2 or same-origin fallback). */

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/** CDN / R2 public base for image files. Falls back to GitHub Pages static folder in dev. */
export function getRtuPicturesBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_RTU_PICTURES_BASE_URL?.trim()
  if (fromEnv) return normalizeBaseUrl(fromEnv)
  return normalizeBaseUrl(`${import.meta.env.BASE_URL}database/rtu-pictures/`)
}

/** Manifest stays on the app origin (small JSON, versioned with each deploy). */
export function getRtuPictureManifestUrl(): string {
  return `${import.meta.env.BASE_URL}database/rtu-pictures/manifest.json`
}

export function rtuPictureFileUrl(fileName: string): string {
  return `${getRtuPicturesBaseUrl()}${encodeURIComponent(fileName)}`
}
