const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i

export interface ParsedBulkRtuFileName {
  buildingNum: string
  rtuToken: string
  unitId: string
  pictureIndex: number
  /** Install year from filename suffix, e.g. (2015) or -2015 */
  installYear?: number
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
