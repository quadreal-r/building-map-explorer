/** Validated VITE_ environment variables for the browser bundle. */

export interface AppEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  googleMapsApiKey: string
  googleMapsMapId: string
}

function readViteEnv(key: string): string | undefined {
  const value = import.meta.env[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requireViteEnv(key: string): string {
  const value = readViteEnv(key)
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function requireHttpUrl(key: string, value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${key} must be an http(s) URL`)
    }
    return value
  } catch {
    throw new Error(`${key} must be a valid http(s) URL`)
  }
}

let cachedEnv: AppEnv | null = null

/** Read and validate env vars once; throws on missing required keys. */
export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv

  const supabaseUrl = requireHttpUrl(
    'VITE_SUPABASE_URL',
    requireViteEnv('VITE_SUPABASE_URL'),
  )
  const supabaseAnonKey = requireViteEnv('VITE_SUPABASE_ANON_KEY')
  const googleMapsApiKey = requireViteEnv('VITE_GOOGLE_MAPS_API_KEY')
  const googleMapsMapId =
    readViteEnv('VITE_GOOGLE_MAPS_MAP_ID') ?? '8e5479ffab76936efa73ede6'

  cachedEnv = {
    supabaseUrl,
    supabaseAnonKey,
    googleMapsApiKey,
    googleMapsMapId,
  }
  return cachedEnv
}

/** Non-throwing check for dev/test bootstrapping. */
export function isEnvConfigured(): boolean {
  return (
    Boolean(readViteEnv('VITE_SUPABASE_URL')) &&
    Boolean(readViteEnv('VITE_SUPABASE_ANON_KEY')) &&
    Boolean(readViteEnv('VITE_GOOGLE_MAPS_API_KEY'))
  )
}

/** Reset cached env (tests only). */
export function resetEnvCache(): void {
  cachedEnv = null
}
