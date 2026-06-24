import exifr from 'exifr'

export interface ImageGps {
  lat: number
  lng: number
}

/** Read GPS coordinates from image EXIF when present. */
export async function readImageGps(file: File): Promise<ImageGps | null> {
  try {
    const gps = await exifr.gps(file)
    if (
      gps &&
      typeof gps.latitude === 'number' &&
      typeof gps.longitude === 'number' &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      return { lat: gps.latitude, lng: gps.longitude }
    }
  } catch {
    /* no EXIF or unsupported format */
  }
  return null
}
