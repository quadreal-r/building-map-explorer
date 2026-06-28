/**
 * RTU picture filename → portfolio RTU matching (review criteria 2026-06-25).
 * Mirrors scripts/lib/rtu-picture-match.mjs for app bulk import.
 */

import type { Building, Rtu } from '@/types/domain'

const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i
const RTU_PREFIX_RE = /^(?:RTU?s?|RTU#|RT|S)[-_\s#]*/i
const YEAR_TOKEN_RE = /(?:^|[-_\s])(19\d{2}|20\d{2})(?=$|[-_\s])/g

const DESCRIPTOR_PATTERNS = [
  /\s+hybrid\b/gi,
  /\s+cooling\s+only\b/gi,
  /\s*\(\s*air\s+heater\s*\)/gi,
  /\s*\(\s*no\s+label\s*\)/gi,
  /\s*\(\s*split\s+ac\s+unit\s*\)/gi,
  /\s*\(\s*tenant\s*\)/gi,
  /\s+ml\b/gi,
  /\s+dx\s+cooling.*$/gi,
  /\s+electric\s+only.*$/gi,
  /\s+heat\s+pump.*$/gi,
]

export interface ParsedBulkRtuFileName {
  buildingNum: string
  rtuToken: string
  unitId: string
  unitCore: string | null
  pictureIndex: number
  requiresReview: boolean
  installYear?: number
}

export interface RtuCatalogEntry {
  building: Building
  rtu: Rtu
  streetNumber: string
  unitId: string
  unitCore: string | null
}

export function stripRtuDescriptors(text: string): string {
  let value = text.trim()
  for (const pattern of DESCRIPTOR_PATTERNS) {
    value = value.replace(pattern, '')
  }
  return value.trim()
}

export function normalizeRtuUnitCore(input: string): string | null {
  if (!input.trim()) return null

  let token = stripRtuDescriptors(input)
  token = token.replace(RTU_PREFIX_RE, '')
  token = token.replace(/\([^)]*\)/g, ' ')
  token = token.replace(YEAR_TOKEN_RE, ' ')
  token = token.replace(/[-_\s]+/g, ' ').trim()

  if (!token) return null
  if (/^0+$/i.test(token.replace(/\s/g, ''))) return null

  const match =
    token.match(/^0*(\d+)([A-Za-z]\w*)?$/) ?? token.match(/^(\d+[A-Za-z]\w*)$/)
  if (!match) return null

  const numeric = String(Number(match[1]))
  const suffix = (match[2] ?? '').toUpperCase()
  return `${numeric}${suffix}`
}

export function extractRtuUnitId(token: string): string {
  const trimmed = token.trim()
  const prefixed = trimmed.match(/^(?:RTU?s?|RTU#|RT|S)[-_\s#]?(.+)$/i)
  const core = (prefixed?.[1] ?? trimmed).trim()
  return core.toUpperCase().replace(/\s+/g, '')
}

export function isUnlabeledBulkUnitCore(core: string | null): boolean {
  return core == null
}

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

  if (!/^(?:RTU?s?|RTU#|RT|S)/i.test(rest)) return null

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

  const unitCore = normalizeRtuUnitCore(rtuToken)

  return {
    buildingNum: buildingMatch[1]!,
    rtuToken,
    unitId: extractRtuUnitId(rtuToken),
    unitCore,
    pictureIndex,
    requiresReview: unitCore == null,
    ...(installYear != null ? { installYear } : {}),
  }
}

export function buildRtuCatalog(
  buildings: Building[],
): RtuCatalogEntry[] {
  const entries: RtuCatalogEntry[] = []
  for (const building of buildings) {
    const streetNumber = building.address.match(/\d+/)?.[0] ?? 'unknown'
    for (const rtu of building.rtus ?? []) {
      entries.push({
        building,
        rtu,
        streetNumber,
        unitId: extractRtuUnitId(rtu.name),
        unitCore: normalizeRtuUnitCore(rtu.name),
      })
    }
  }
  return entries
}

export function findRtuCandidates(
  catalog: RtuCatalogEntry[],
  parsed: ParsedBulkRtuFileName,
): RtuCatalogEntry[] {
  if (parsed.requiresReview || parsed.unitCore == null) return []

  const buildingExists = catalog.some((entry) => entry.streetNumber === parsed.buildingNum)
  if (!buildingExists) return []

  return catalog.filter(
    (entry) => entry.streetNumber === parsed.buildingNum && entry.unitCore === parsed.unitCore,
  )
}

export function matchFileToRtu(
  catalog: RtuCatalogEntry[],
  fileName: string,
): { entry?: RtuCatalogEntry; pictureIndex?: number; error?: string } {
  const bulk = parseBulkRtuPictureFileName(fileName)
  if (!bulk) return { error: 'Unrecognized filename' }
  if (bulk.requiresReview || bulk.unitCore == null) {
    return { error: 'Unlabeled bulk unit (RTU-0) requires manual review' }
  }

  const candidates = findRtuCandidates(catalog, bulk)
  if (candidates.length === 1) {
    return { entry: candidates[0], pictureIndex: bulk.pictureIndex }
  }
  if (!candidates.length) return { error: 'No RTU match in portfolio' }
  return { error: `Ambiguous bulk name (${candidates.length} RTUs)` }
}
