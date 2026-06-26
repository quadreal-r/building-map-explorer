import exifr from 'exifr'

export interface ImageGps {
  lat: number
  lng: number
}

/** Read GPS coordinates from image EXIF when present (full decimal precision). */
export async function readImageGps(file: File): Promise<ImageGps | null> {
  try {
    const data = await exifr.parse(file, { gps: true })
    const lat = data?.latitude
    const lng = data?.longitude
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return { lat, lng }
    }
  } catch {
    /* no EXIF or unsupported format */
  }
  return null
}
