/** Public URLs for portfolio JSON hosted on Cloudflare R2 (optional). */

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/** Read JSON CDN base from env; tolerates pasting a full `.env` line into GitHub secrets. */
export function readJsonDataBaseUrlFromEnv(): string | undefined {
  let value = import.meta.env.VITE_JSON_DATA_BASE_URL?.trim()
  if (!value) return undefined

  const envLine = value.match(/^VITE_JSON_DATA_BASE_URL\s*=\s*(.+)$/i)
  if (envLine) value = envLine[1]!.trim().replace(/^["']|["']$/g, '')

  return value || undefined
}

/** R2 public base for portfolio JSON. Undefined when not configured (use bundled git JSON). */
export function getJsonDataBaseUrl(): string | undefined {
  const fromEnv = readJsonDataBaseUrlFromEnv()
  return fromEnv ? normalizeBaseUrl(fromEnv) : undefined
}

/** True when the production bundle loads portfolio JSON from Cloudflare R2. */
export function usesRemoteJsonData(): boolean {
  return Boolean(getJsonDataBaseUrl())
}

export function jsonDataFileUrl(fileName: string): string | undefined {
  const base = getJsonDataBaseUrl()
  return base ? `${base}${fileName}` : undefined
}

export async function fetchRemoteJson<T>(fileName: string): Promise<T | null> {
  const url = jsonDataFileUrl(fileName)
  if (!url) return null
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}
