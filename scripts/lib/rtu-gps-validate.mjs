/**
 * Shared RTU ↔ picture GPS validation for Node scripts (R2 upload, audit).
 */
import { readFileSync } from 'node:fs'
import exifr from 'exifr'

export const RTU_GPS_MATCH_FEET = 100

const EARTH_RADIUS_M = 6_371_000
const FEET_PER_METER = 3.28084

export function distanceFeet(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const meters = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return meters * FEET_PER_METER
}

/** Parse manifest rtuKey: "1590 South Gateway Rd.|RTU- 04" */
export function parseRtuPictureKey(rtuKey) {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return null
  return {
    buildingAddress: rtuKey.slice(0, pipe),
    rtuName: rtuKey.slice(pipe + 1),
  }
}

export function findRtuInPortfolio(buildings, buildingAddress, rtuName) {
  const building = buildings.find((b) => b.address === buildingAddress)
  if (!building) return null
  const rtu = (building.rtus ?? []).find((r) => r.name === rtuName)
  if (!rtu) return null
  return { building, rtu }
}

export async function readImageGpsFromBuffer(buffer) {
  try {
    const gps = await exifr.gps(buffer)
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
    /* no EXIF */
  }
  return null
}

export async function readImageGpsFromFile(filePath) {
  return readImageGpsFromBuffer(readFileSync(filePath))
}

/**
 * Compare photo GPS to RTU marker. Returns warning text when beyond RTU_GPS_MATCH_FEET.
 * Missing GPS returns null (no warning).
 */
export function gpsWarningForRtu(photoGps, rtu, maxFeet = RTU_GPS_MATCH_FEET) {
  if (!photoGps || !rtu?.lat || !rtu?.lng) return null
  const feet = distanceFeet(photoGps.lat, photoGps.lng, rtu.lat, rtu.lng)
  if (feet <= maxFeet) return null
  return `GPS is ${Math.round(feet)} ft from ${rtu.name} (expected within ${maxFeet} ft)`
}

export function loadBuildingsJson(rootDir) {
  return JSON.parse(readFileSync(`${rootDir}/supabase/data/buildings.json`, 'utf8'))
}
