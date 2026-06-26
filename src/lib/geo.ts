const EARTH_RADIUS_M = 6_371_000
const FEET_PER_METER = 3.28084

/** Great-circle distance in feet between two WGS84 points. */
export function distanceFeet(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const meters = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return meters * FEET_PER_METER
}

/** Bulk import / R2 upload — warn when photo GPS is farther than this from the RTU marker. */
export const RTU_GPS_MATCH_FEET = 100

/** Map drag-assign — max distance from RTU marker to accept a pending photo drop. */
export const RTU_PICTURE_DROP_FEET = 10

export function isWithinFeet(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  maxFeet: number,
): boolean {
  return distanceFeet(lat1, lng1, lat2, lng2) <= maxFeet
}
