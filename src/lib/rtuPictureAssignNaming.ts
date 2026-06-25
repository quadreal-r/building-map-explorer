import { buildingStreetNumber } from '@/lib/rtuPictures'

/** Keep RTU name as shown in the app; only strip unsafe filename characters. */
export function formatRtuNameForPictureFile(rtuName: string): string {
  return rtuName
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '')
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
  const rtuLabel = formatRtuNameForPictureFile(rtuName)
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'jpg'
  return `${buildingNum}-${rtuLabel} (${pictureIndex}).${safeExt}`
}
