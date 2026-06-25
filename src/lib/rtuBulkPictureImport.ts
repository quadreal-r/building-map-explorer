import { distanceFeet, RTU_GPS_MATCH_FEET } from '@/lib/geo'
import { readImageGps } from '@/lib/imageGps'
import {
  buildingStreetNumber,
  importRtuPictureAtIndex,
} from '@/lib/rtuPictures'
import type { Building, Rtu } from '@/types/domain'

const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i

export interface ParsedBulkRtuFileName {
  buildingNum: string
  rtuToken: string
  unitId: string
  pictureIndex: number
  /** Install year from filename suffix, e.g. (2015) or -2015 */
  installYear?: number
}

export interface RtuCatalogEntry {
  building: Building
  rtu: Rtu
  streetNumber: string
  unitId: string
}

export interface BulkRtuPictureImportSuccess {
  file: string
  buildingAddress: string
  rtuName: string
  pictureIndex: number
  storedFileName: string
}

export interface BulkRtuPictureImportResult {
  totalFiles: number
  excluded: { file: string; reason: string }[]
  imported: number
  skipped: number
  successes: BulkRtuPictureImportSuccess[]
  failures: { file: string; reason: string }[]
  warnings: { file: string; message: string }[]
  cancelled?: boolean
  completedAt: string
}

export interface BulkRtuPictureImportProgress {
  processed: number
  total: number
  currentFile: string
}

export interface BulkImportRtuPicturesOptions {
  signal?: AbortSignal
  onProgress?: (progress: BulkRtuPictureImportProgress) => void
}

/** Extract RTU unit id from marker name or bulk filename token (e.g. RTU-04 → 04, RT-3W → 3W). */
export function extractRtuUnitId(token: string): string {
  const trimmed = token.trim()
  const prefixed = trimmed.match(/^(?:RTU?|RT)[-_\s]?(.+)$/i)
  const core = (prefixed?.[1] ?? trimmed).trim()
  return core.toUpperCase().replace(/\s+/g, '')
}

/**
 * Parse bulk picture filenames (RTU_GPS_Audit.xlsx patterns), e.g.:
 * - 1590-RTU-04-2.jpg
 * - 150-RT-3W-1.jpeg
 * - 20-RTU-03.jpg
 * - 20-RTU-01-2015.jpg
 * - 20-RTU-01-1 (2015).jpg
 */
export function parseBulkRtuPictureFileName(fileName: string): ParsedBulkRtuFileName | null {
  const base = fileName.replace(/^.*[/\\]/, '').replace(IMAGE_FILE_RE, '')
  if (!base) return null

  const buildingMatch = base.match(/^(\d+)[-_\s]+(.+)$/)
  if (!buildingMatch) return null

  let rest = buildingMatch[2]!.trim()
  let pictureIndex = 1
  let installYear: number | undefined

  const parenYear = rest.match(/\((\d{4})\)\s*$/)
  if (parenYear) {
    installYear = Number(parenYear[1])
    rest = rest.slice(0, parenYear.index).trim()
  }

  const parenIndex = rest.match(/\((\d+)\)\s*$/)
  if (parenIndex) {
    pictureIndex = Number(parenIndex[1])
    rest = rest.slice(0, parenIndex.index).trim()
  }

  if (!/^(?:RTU?|RT)/i.test(rest)) return null

  const parts = rest.split(/[-_\s]+/)
  if (parts.length < 2) return null

  let rtuToken: string
  if (parts.length === 2) {
    rtuToken = `${parts[0]}-${parts[1]}`
  } else {
    const last = parts[parts.length - 1]!
    const lastNum = Number(last)
    const isYear = last.length === 4 && lastNum >= 1900 && lastNum <= 2100
    const isIndex = !isYear && /^\d+$/.test(last)

    if (isYear) {
      installYear = lastNum
      rtuToken = parts.slice(0, -1).join('-')
      pictureIndex = 1
    } else if (isIndex) {
      pictureIndex = lastNum
      rtuToken = parts.slice(0, -1).join('-')
    } else {
      rtuToken = parts.join('-')
    }
  }

  const unitId = extractRtuUnitId(rtuToken)
  if (!unitId) return null

  return {
    buildingNum: buildingMatch[1]!,
    rtuToken,
    unitId,
    pictureIndex,
    ...(installYear != null ? { installYear } : {}),
  }
}

export function buildRtuCatalog(buildings: Building[]): RtuCatalogEntry[] {
  const entries: RtuCatalogEntry[] = []
  for (const building of buildings) {
    const streetNumber = buildingStreetNumber(building.address)
    for (const rtu of building.rtus ?? []) {
      entries.push({
        building,
        rtu,
        streetNumber,
        unitId: extractRtuUnitId(rtu.name),
      })
    }
  }
  return entries
}

function unitIdsMatch(fileUnitId: string, markerUnitId: string): boolean {
  if (fileUnitId === markerUnitId) return true
  if (/^\d+$/.test(fileUnitId) && /^\d+$/.test(markerUnitId)) {
    return Number(fileUnitId) === Number(markerUnitId)
  }
  return false
}

export function findRtuCandidates(
  catalog: RtuCatalogEntry[],
  parsed: ParsedBulkRtuFileName,
): RtuCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      entry.streetNumber === parsed.buildingNum && unitIdsMatch(parsed.unitId, entry.unitId),
  )
}

export function pickRtuMatch(
  candidates: RtuCatalogEntry[],
  gps: { lat: number; lng: number } | null,
  maxFeet = RTU_GPS_MATCH_FEET,
): {
  entry: RtuCatalogEntry | null
  reason?: string
  gpsFeet?: number
  gpsWarning?: string
} {
  if (!candidates.length) {
    return { entry: null, reason: 'No RTU marker matches building number and unit id' }
  }

  if (candidates.length === 1) {
    const entry = candidates[0]!
    if (!gps) return { entry }
    const feet = distanceFeet(gps.lat, gps.lng, entry.rtu.lat, entry.rtu.lng)
    if (feet > maxFeet) {
      return {
        entry,
        gpsFeet: feet,
        gpsWarning: `GPS is ${Math.round(feet)} ft from ${entry.rtu.name} (expected within ${maxFeet} ft)`,
      }
    }
    return { entry, gpsFeet: feet }
  }

  if (!gps) {
    return {
      entry: null,
      reason: `Multiple RTU markers match — add GPS to the photo or use a unique building number (${candidates.length} matches)`,
    }
  }

  const ranked = candidates
    .map((entry) => ({
      entry,
      feet: distanceFeet(gps.lat, gps.lng, entry.rtu.lat, entry.rtu.lng),
    }))
    .sort((a, b) => a.feet - b.feet)

  const best = ranked[0]!
  const second = ranked[1]
  if (second && Math.abs(second.feet - best.feet) < 5) {
    return {
      entry: null,
      reason: 'GPS is ambiguous between multiple RTU markers within range',
      gpsFeet: best.feet,
    }
  }

  if (best.feet > maxFeet) {
    return {
      entry: best.entry,
      gpsFeet: best.feet,
      gpsWarning: `GPS is ${Math.round(best.feet)} ft from ${best.entry.rtu.name} (expected within ${maxFeet} ft)`,
    }
  }

  return { entry: best.entry, gpsFeet: best.feet }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_FILE_RE.test(file.name)
}

function fileRelativePath(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string }
  return withPath.webkitRelativePath ?? file.name
}

/** Skip photos in folders whose name contains "old", or filenames containing "old". */
export function isExcludedOldRtuPicture(file: File): boolean {
  const relPath = fileRelativePath(file)
  const baseName = relPath.replace(/^.*[/\\]/, '')
  const nameWithoutExt = baseName.replace(IMAGE_FILE_RE, '')
  if (/old/i.test(nameWithoutExt)) return true

  const folderSegments = relPath.split(/[/\\]/).slice(0, -1)
  return folderSegments.some((segment) => /old/i.test(segment))
}

function formatReportLines(title: string, items: { file: string; detail: string }[]): string[] {
  if (!items.length) return []
  return [title, ...items.map(({ file, detail }) => `  ${file} — ${detail}`), '']
}

/** Plain-text report for download or copy after a bulk upload finishes. */
export function formatBulkRtuPictureImportReport(result: BulkRtuPictureImportResult): string {
  const status = result.cancelled ? 'Cancelled' : 'Completed'
  const lines = [
    'RTU Picture Bulk Import Report',
    `Status: ${status}`,
    `Completed: ${result.completedAt}`,
    '',
    'Summary',
    `  Total files in folder: ${result.totalFiles}`,
    `  Excluded before import: ${result.excluded.length}`,
    `  Imported: ${result.imported}`,
    `  Skipped (errors): ${result.skipped}`,
    `  Warnings: ${result.warnings.length}`,
    '',
  ]

  lines.push(
    ...formatReportLines(
      `Imported pictures (${result.successes.length})`,
      result.successes.map((s) => ({
        file: s.file,
        detail: `${s.rtuName} @ ${s.buildingAddress} (#${s.pictureIndex}) → ${s.storedFileName}`,
      })),
    ),
  )

  lines.push(
    ...formatReportLines(
      `Warnings (${result.warnings.length})`,
      result.warnings.map((w) => ({ file: w.file, detail: w.message })),
    ),
  )

  lines.push(
    ...formatReportLines(
      `Skipped / failed (${result.failures.length})`,
      result.failures.map((f) => ({ file: f.file, detail: f.reason })),
    ),
  )

  lines.push(
    ...formatReportLines(
      `Excluded (${result.excluded.length})`,
      result.excluded.map((e) => ({ file: e.file, detail: e.reason })),
    ),
  )

  return lines.join('\n').trimEnd() + '\n'
}

export async function bulkImportRtuPictures(
  buildings: Building[],
  files: File[],
  options: BulkImportRtuPicturesOptions = {},
): Promise<BulkRtuPictureImportResult> {
  const { signal, onProgress } = options
  const catalog = buildRtuCatalog(buildings)
  const excluded: { file: string; reason: string }[] = []
  const eligible: File[] = []

  for (const file of files) {
    const relPath = fileRelativePath(file)
    if (!isImageFile(file)) {
      excluded.push({ file: relPath, reason: 'Not an image file' })
      continue
    }
    if (isExcludedOldRtuPicture(file)) {
      excluded.push({ file: relPath, reason: 'Excluded (path or filename contains "old")' })
      continue
    }
    eligible.push(file)
  }

  const result: BulkRtuPictureImportResult = {
    totalFiles: files.length,
    excluded,
    imported: 0,
    skipped: 0,
    successes: [],
    failures: [],
    warnings: [],
    completedAt: new Date().toISOString(),
  }
  const total = eligible.length

  for (let i = 0; i < eligible.length; i++) {
    if (signal?.aborted) {
      result.cancelled = true
      break
    }

    const file = eligible[i]!
    onProgress?.({ processed: i, total, currentFile: file.name })

    const parsed = parseBulkRtuPictureFileName(file.name)
    if (!parsed) {
      result.skipped += 1
      result.failures.push({
        file: file.name,
        reason: 'Filename does not match bulk RTU pattern (e.g. 1590-RTU-04-1.jpg)',
      })
      onProgress?.({ processed: i + 1, total, currentFile: file.name })
      continue
    }

    if (!parsed.unitId || parsed.pictureIndex < 1) {
      result.skipped += 1
      result.failures.push({ file: file.name, reason: 'Invalid RTU unit or picture index in filename' })
      onProgress?.({ processed: i + 1, total, currentFile: file.name })
      continue
    }

    if (signal?.aborted) {
      result.cancelled = true
      break
    }

    const candidates = findRtuCandidates(catalog, parsed)
    const gps = await readImageGps(file)

    if (signal?.aborted) {
      result.cancelled = true
      break
    }

    const { entry, reason, gpsFeet, gpsWarning } = pickRtuMatch(candidates, gps)

    if (!entry) {
      result.skipped += 1
      result.failures.push({ file: file.name, reason: reason ?? 'No matching RTU marker' })
      onProgress?.({ processed: i + 1, total, currentFile: file.name })
      continue
    }

    if (!gps) {
      result.warnings.push({
        file: file.name,
        message: `Linked to ${entry.rtu.name} at ${entry.building.address} by filename only (no GPS in photo)`,
      })
    } else if (gpsWarning) {
      result.warnings.push({
        file: file.name,
        message: `${gpsWarning} — linked to ${entry.rtu.name} at ${entry.building.address} by filename`,
      })
    } else if (gpsFeet != null) {
      result.warnings.push({
        file: file.name,
        message: `GPS verified within ${Math.round(gpsFeet)} ft of ${entry.rtu.name}`,
      })
    }

    try {
      const storedFileName = await importRtuPictureAtIndex(
        entry.building.address,
        entry.rtu.name,
        file,
        parsed.pictureIndex,
      )
      result.imported += 1
      result.successes.push({
        file: file.name,
        buildingAddress: entry.building.address,
        rtuName: entry.rtu.name,
        pictureIndex: parsed.pictureIndex,
        storedFileName,
      })
    } catch (e) {
      result.skipped += 1
      result.failures.push({
        file: file.name,
        reason: e instanceof Error ? e.message : 'Import failed',
      })
    }

    onProgress?.({ processed: i + 1, total, currentFile: file.name })
  }

  result.completedAt = new Date().toISOString()
  return result
}
