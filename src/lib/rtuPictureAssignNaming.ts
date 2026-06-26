import { buildingStreetNumber } from '@/lib/rtuPictures'

/** Keep RTU name as shown in the app; only strip unsafe filename characters. */
export function formatRtuNameForPictureFile(rtuName: string): string {
  return rtuName
    .trim()
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '')
}

/** RTU label for picture filenames — portfolio name only, not description suffix after "/". */
export function pictureFileRtuLabel(rtuName: string): string {
  const primary = rtuName.split('/')[0]?.trim() ?? rtuName.trim()
  return formatRtuNameForPictureFile(primary)
}

/**
 * Bulk-style filename using the displayed RTU name, e.g. `2320-RTU-06 Hybrid (3).jpg`
 * (not `2320-RTU-06HYBRID (3).jpg`).
 */
export function buildBulkRtuPictureFileName(
  buildingAddress: string,
  rtuName: string,
  pictureIndex: number,
  ext: string,
): string {
  const buildingNum = buildingStreetNumber(buildingAddress)
  const rtuLabel = pictureFileRtuLabel(rtuName)
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'jpg'
  return `${buildingNum}-${rtuLabel} (${pictureIndex}).${safeExt}`
}
