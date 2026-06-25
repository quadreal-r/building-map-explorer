import { distanceFeet, RTU_GPS_MATCH_FEET } from '@/lib/geo'
import { readImageGps } from '@/lib/imageGps'
import { buildBulkRtuPictureFileName } from '@/lib/rtuPictureAssignNaming'
import { isExcludedOldRtuPicture } from '@/lib/rtuBulkPictureImport'
import {
  importRtuPictureAtIndex,
  listRtuPictures,
} from '@/lib/rtuPictures'
import type { Building, Rtu } from '@/types/domain'

const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i

/** Max distance to accept a picture drop onto an RTU marker. */
export const RTU_PICTURE_DROP_FEET = RTU_GPS_MATCH_FEET

export interface NearestRtuMatch {
  building: Building
  rtu: Rtu
  feet: number
}

export interface StagedGpsPicture {
  id: string
  file: File
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

function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  const mime = file.type.split('/')[1]
  return mime === 'jpeg' ? 'jpg' : mime || 'jpg'
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
  const ext = fileExtension(file)
  const fileName = buildBulkRtuPictureFileName(buildingAddress, rtuName, index, ext)
  await importRtuPictureAtIndex(buildingAddress, rtuName, file, index, { fileName })
  return { fileName, pictureIndex: index }
}
