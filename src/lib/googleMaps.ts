import { Loader } from '@googlemaps/js-api-loader'

export interface GoogleMapsEnv {
  apiKey: string | undefined
  mapId: string
  isConfigured: boolean
}

export function readGoogleMapsEnv(): GoogleMapsEnv {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  const mapId =
    import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() ?? '8e5479ffab76936efa73ede6'
  return {
    apiKey,
    mapId,
    isConfigured: Boolean(apiKey),
  }
}

let loadPromise: Promise<typeof google> | null = null

/** Load the Google Maps JS API once; rejects when `VITE_GOOGLE_MAPS_API_KEY` is unset. */
export function loadGoogleMaps(): Promise<typeof google> {
  const { apiKey, mapId } = readGoogleMapsEnv()
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured'))
  }

  if (!loadPromise) {
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['drawing', 'geometry', 'marker'],
      mapIds: [mapId],
    })
    loadPromise = loader.load()
  }

  return loadPromise
}

export function resetGoogleMapsLoader(): void {
  loadPromise = null
}
