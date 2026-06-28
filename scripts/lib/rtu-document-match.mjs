/**
 * RTU document PDF filename → portfolio building / RTU matching.
 * Filenames like: 100 Leek Cres-Unit6-V1-2023.pdf, 130-146 Sparks Ave-Applied-RTU-4-Start-Up-2023.pdf
 */
import {
  buildRtuCatalog,
  normalizeRtuUnitCore,
  rtuPictureKey,
} from './rtu-picture-match.mjs'

const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|zip)$/i

export function isDocumentFileName(fileName) {
  return DOCUMENT_EXT.test(fileName)
}

function normalizeAddressKey(text) {
  return text
    .toLowerCase()
    .replace(/\b(cres|crescent|rd|road|ave|avenue|st|street|dr|drive|way|blvd|ct|court|bl|boulevard)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function leadingStreetNumbers(buildingNum) {
  if (!buildingNum) return []
  if (buildingNum.includes('-')) {
    const [a, b] = buildingNum.split('-').map((n) => Number(n))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const nums = []
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nums.push(String(i))
      return nums
    }
  }
  return [buildingNum]
}

function uniqueBuildings(catalog) {
  const map = new Map()
  for (const entry of catalog) {
    if (!map.has(entry.building.address)) map.set(entry.building.address, entry.building)
  }
  return [...map.values()]
}

/** Match abbreviated doc label (e.g. "100 Leek Cres") to portfolio building address. */
export function matchBuildingFromDocLabel(catalog, buildingNum, buildingLabel) {
  const nums = leadingStreetNumbers(buildingNum)
  const labelKey = normalizeAddressKey(buildingLabel)

  const candidates = uniqueBuildings(catalog).filter((building) => {
    const bNum = building.address.match(/^(\d+(?:-\d+)?)/)?.[1] ?? building.address.match(/\d+/)?.[0]
    if (!bNum || !nums.some((n) => bNum === n || bNum.startsWith(`${n}-`) || bNum.includes(n))) {
      const streetOnly = building.address.match(/\d+/)?.[0]
      if (!streetOnly || !nums.includes(streetOnly)) return false
    }
    const addrKey = normalizeAddressKey(building.address)
    if (addrKey.includes(labelKey) || labelKey.includes(addrKey.slice(0, Math.min(labelKey.length, addrKey.length)))) {
      return true
    }
    const labelWords = buildingLabel.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const addrWords = building.address.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const overlap = labelWords.filter((w) => addrWords.some((aw) => aw.startsWith(w.slice(0, 4)) || w.startsWith(aw.slice(0, 4))))
    return overlap.length >= 1
  })

  if (candidates.length === 1) return candidates[0]
  if (!candidates.length) return null

  let best = candidates[0]
  let bestScore = -1
  for (const building of candidates) {
    const addrKey = normalizeAddressKey(building.address)
    let score = 0
    if (addrKey.startsWith(normalizeAddressKey(buildingNum))) score += 10
    for (const n of nums) {
      if (building.address.startsWith(n)) score += 5
    }
    const lenDiff = Math.abs(addrKey.length - labelKey.length)
    score -= lenDiff * 0.01
    if (score > bestScore) {
      bestScore = score
      best = building
    }
  }
  return best
}

export function parseRtuDocumentFileName(fileName) {
  const base = fileName.replace(/^.*[/\\]/, '').replace(DOCUMENT_EXT, '')
  if (!base) return null

  const dash = base.indexOf('-')
  if (dash <= 0) return null

  const buildingLabel = base.slice(0, dash).trim()
  const docPart = base.slice(dash + 1).trim()
  const buildingNum = buildingLabel.match(/^(\d+(?:-\d+)?)/)?.[1]
  if (!buildingNum) return null

  const unitCores = new Set()

  for (const match of docPart.matchAll(/\bRTU[-_\s#]?0*(\d+)([A-Za-z])?\b/gi)) {
    const core = normalizeRtuUnitCore(`RTU-${match[1]}${match[2] ?? ''}`)
    if (core) unitCores.add(core)
  }

  for (const match of docPart.matchAll(/\bUnit\s*(\d+)(?:\s*-\s*(\d+))?\b/gi)) {
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (!Number.isFinite(start)) continue
    const lo = Math.min(start, end)
    const hi = Math.max(start, end)
    for (let i = lo; i <= hi && i <= lo + 20; i++) {
      unitCores.add(String(i))
    }
  }

  return {
    buildingLabel,
    buildingNum,
    docPart,
    unitCores: [...unitCores],
    buildingWide: unitCores.size === 0,
  }
}

export function matchDocumentToRtus(catalog, fileName) {
  const parsed = parseRtuDocumentFileName(fileName)
  if (!parsed) return { error: 'Unrecognized document filename' }

  const building = matchBuildingFromDocLabel(catalog, parsed.buildingNum, parsed.buildingLabel)
  if (!building) return { error: 'No building match in portfolio', parsed }

  const buildingEntries = catalog.filter((e) => e.building.address === building.address)

  if (parsed.buildingWide) {
    return {
      parsed,
      building,
      targets: buildingEntries.map((e) => ({ entry: e, scope: 'building' })),
    }
  }

  const targets = []
  for (const core of parsed.unitCores) {
    const matches = buildingEntries.filter((e) => e.unitCore === core)
    if (matches.length === 1) {
      targets.push({ entry: matches[0], scope: 'unit', unitCore: core })
    } else if (matches.length > 1) {
      return { error: `Ambiguous unit ${core} (${matches.length} RTUs)`, parsed, building }
    }
  }

  if (!targets.length) {
    return {
      error: `Building matched but RTU unit(s) ${parsed.unitCores.join(', ')} not found`,
      parsed,
      building,
    }
  }

  return { parsed, building, targets }
}

export { buildRtuCatalog, rtuPictureKey }
