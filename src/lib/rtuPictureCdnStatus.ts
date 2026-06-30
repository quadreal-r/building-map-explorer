import { manifestEntryToCloudFileName } from '@/lib/rtuPictureAssignNaming'
import { parseBulkRtuPictureFileName } from '@/lib/rtuPictureMatch'
import { parseRtuPictureIndex } from '@/lib/rtuPictures'
import { rtuPictureFileUrl } from '@/lib/rtuPictureUrls'
import { isRtuPictureReachableOnCdn } from '@/lib/rtuPictureReachability'

export interface PictureCdnRow {
  rtuKey: string
  buildingAddress: string
  rtuName: string
  pictureIndex: number | null
  installYear: number | null
  manifestFileName: string
  cloudFileName: string
  cdnUrl: string
  cdnStatus: 'On CDN' | 'Missing from CDN'
}

function splitRtuKey(rtuKey: string): { buildingAddress: string; rtuName: string } {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return { buildingAddress: rtuKey, rtuName: '' }
  return { buildingAddress: rtuKey.slice(0, pipe), rtuName: rtuKey.slice(pipe + 1) }
}

function pictureSlotFromFileName(fileName: string): {
  pictureIndex: number | null
  installYear: number | null
} {
  const bulk = parseBulkRtuPictureFileName(fileName)
  if (bulk) {
    return {
      pictureIndex: bulk.pictureIndex,
      installYear: bulk.installYear ?? null,
    }
  }
  return { pictureIndex: parseRtuPictureIndex(fileName), installYear: null }
}

/** HEAD-check each filename on the RTU pictures CDN (batched). */
export async function verifyRtuPicturesOnCdn(
  fileNames: Iterable<string>,
  concurrency = 24,
): Promise<Map<string, boolean>> {
  const unique = [...new Set(fileNames)]
  const status = new Map<string, boolean>()
  if (!unique.length) return status

  const queue = [...unique]
  const workers = Math.min(concurrency, unique.length)

  async function worker(): Promise<void> {
    while (queue.length) {
      const fileName = queue.shift()
      if (!fileName) continue
      try {
        const reachable = await isRtuPictureReachableOnCdn(fileName)
        status.set(fileName, reachable)
      } catch {
        status.set(fileName, false)
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return status
}

export function buildPictureCdnRows(
  manifest: { entries?: Record<string, string[]> },
  cdnStatusByFile: Map<string, boolean>,
): PictureCdnRow[] {
  const rows: PictureCdnRow[] = []
  for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      const cloudFileName = manifestEntryToCloudFileName(fileName, buildingAddress, rtuName)
      const onCdn =
        cdnStatusByFile.get(cloudFileName) === true || cdnStatusByFile.get(fileName) === true
      const { pictureIndex, installYear } = pictureSlotFromFileName(fileName)
      rows.push({
        rtuKey,
        buildingAddress,
        rtuName,
        pictureIndex,
        installYear,
        manifestFileName: fileName,
        cloudFileName,
        cdnUrl: rtuPictureFileUrl(cloudFileName),
        cdnStatus: onCdn ? 'On CDN' : 'Missing from CDN',
      })
    }
  }
  rows.sort((a, b) => {
    const keyCmp = a.rtuKey.localeCompare(b.rtuKey)
    if (keyCmp !== 0) return keyCmp
    return (a.pictureIndex ?? 0) - (b.pictureIndex ?? 0)
  })
  return rows
}

export function pictureCdnRowToSheetRow(row: PictureCdnRow): (string | number)[] {
  return [
    row.rtuKey,
    row.buildingAddress,
    row.rtuName,
    row.pictureIndex ?? '',
    row.installYear ?? '',
    row.manifestFileName,
    row.cloudFileName,
    row.cdnStatus,
    row.cdnUrl,
  ]
}

export const PICTURE_CDN_HEADER = [
  'RTU key',
  'Building',
  'RTU name',
  'Picture index',
  'Install year',
  'Manifest filename',
  'CDN filename',
  'CDN status',
  'CDN URL',
] as const
