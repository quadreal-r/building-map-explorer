import { distanceFeet, RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { readImageGps } from '@/lib/imageGps'
import { isExcludedOldRtuPicture } from '@/lib/rtuBulkPictureImport'
import {
  importRtuPictureAtIndex,
  listRtuPictures,
} from '@/lib/rtuPictures'
import type { Building, Rtu } from '@/types/domain'

const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i

/** Max distance to accept a picture drop onto an RTU marker. */
export { RTU_PICTURE_DROP_FEET } from '@/lib/geo'

export interface NearestRtuMatch {
  building: Building
  rtu: Rtu
  feet: number
}

export interface StagedGpsPicture {
  id: string
  file: File
  /** Original EXIF latitude — marker is placed here on upload. */
  gpsLat: number
  /** Original EXIF longitude — marker is placed here on upload. */
  gpsLng: number
  /** Current map position (starts at GPS; updates only when dragged). */
  lat: number
  lng: number
  originalName: string
  previewUrl: string
}

export interface StageGpsPicturesResult {
  staged: StagedGpsPicture[]
  skipped: { file: string; reason: string }[]
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_FILE_RE.test(file.name)
}

export function findNearestRtuAt(
  buildings: Building[],
  lat: number,
  lng: number,
  maxFeet = RTU_PICTURE_DROP_FEET,
): NearestRtuMatch | null {
  let best: NearestRtuMatch | null = null

  for (const building of buildings) {
    for (const rtu of building.rtus ?? []) {
      const feet = distanceFeet(lat, lng, rtu.lat, rtu.lng)
      if (feet > maxFeet) continue
      if (!best || feet < best.feet) {
        best = { building, rtu, feet }
      }
    }
  }

  return best
}

export interface NearestPendingPictureMatch {
  item: StagedGpsPicture
  feet: number
}

/** Pending photo closest to an RTU pin (for click-to-assign on the RTU popup). */
export function findNearestPendingPictureToRtu(
  items: StagedGpsPicture[],
  rtuLat: number,
  rtuLng: number,
  maxFeet = RTU_PICTURE_DROP_FEET,
): NearestPendingPictureMatch | null {
  let best: NearestPendingPictureMatch | null = null

  for (const item of items) {
    const feet = distanceFeet(item.lat, item.lng, rtuLat, rtuLng)
    if (feet > maxFeet) continue
    if (!best || feet < best.feet) {
      best = { item, feet }
    }
  }

  return best
}

export function countPendingPicturesNearRtu(
  items: StagedGpsPicture[],
  rtuLat: number,
  rtuLng: number,
  maxFeet = RTU_PICTURE_DROP_FEET,
): number {
  return items.filter((item) => distanceFeet(item.lat, item.lng, rtuLat, rtuLng) <= maxFeet).length
}

const STACK_SPREAD_METERS = 5

/** Fan out markers that share identical GPS so each thumbnail can be grabbed. */
export function spreadStackedGpsPictures(staged: StagedGpsPicture[]): StagedGpsPicture[] {
  const groups = new Map<string, number[]>()

  staged.forEach((item, index) => {
    const key = `${item.gpsLat.toFixed(7)},${item.gpsLng.toFixed(7)}`
    const group = groups.get(key) ?? []
    group.push(index)
    groups.set(key, group)
  })

  const result = staged.map((item) => ({ ...item }))

  for (const indices of groups.values()) {
    if (indices.length <= 1) continue
    const centerLat = result[indices[0]!]!.gpsLat
    const centerLng = result[indices[0]!]!.gpsLng
    const lngScale = 111_320 * Math.cos((centerLat * Math.PI) / 180)

    indices.forEach((index, stackIndex) => {
      if (stackIndex === 0) return
      const angle = (2 * Math.PI * stackIndex) / indices.length
      const northM = STACK_SPREAD_METERS * Math.cos(angle)
      const eastM = STACK_SPREAD_METERS * Math.sin(angle)
      result[index]!.lat = centerLat + northM / 111_320
      result[index]!.lng = centerLng + eastM / lngScale
    })
  }

  return result
}

export async function stageGpsPicturesFromFiles(files: File[]): Promise<StageGpsPicturesResult> {
  const staged: StagedGpsPicture[] = []
  const skipped: { file: string; reason: string }[] = []

  for (const file of files) {
    if (!isImageFile(file)) {
      skipped.push({ file: file.name, reason: 'Not an image file' })
      continue
    }
    if (isExcludedOldRtuPicture(file)) {
      skipped.push({ file: file.name, reason: 'Excluded (path or filename contains "old")' })
      continue
    }

    const gps = await readImageGps(file)
    if (!gps) {
      skipped.push({ file: file.name, reason: 'No GPS in photo — cannot place on map' })
      continue
    }

    staged.push({
      id: crypto.randomUUID(),
      file,
      gpsLat: gps.lat,
      gpsLng: gps.lng,
      lat: gps.lat,
      lng: gps.lng,
      originalName: file.name,
      previewUrl: URL.createObjectURL(file),
    })
  }

  return { staged, skipped }
}

export async function computeNextPictureIndex(
  buildingAddress: string,
  rtuName: string,
): Promise<number> {
  const existing = await listRtuPictures(buildingAddress, rtuName)
  return existing.reduce((max, pic) => Math.max(max, pic.index), 0) + 1
}

export async function assignPictureFileToRtu(
  file: File,
  buildingAddress: string,
  rtuName: string,
  pictureIndex?: number,
): Promise<{ fileName: string; pictureIndex: number }> {
  const index = pictureIndex ?? (await computeNextPictureIndex(buildingAddress, rtuName))
  const fileName = await importRtuPictureAtIndex(buildingAddress, rtuName, file, index)
  return { fileName, pictureIndex: index }
}
