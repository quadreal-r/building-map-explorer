/**
 * Apply a deploy bundle exported from local dev (Settings → Export data for GitHub).
 *
 * Usage:
 *   node scripts/apply-deploy-bundle.mjs [path/to/deploy-bundle.json]
 *
 * Default search paths: ./deploy-bundle.json, ./supabase/data/deploy-bundle.json
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  guessPictureContentType,
  isR2Configured,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'
import { parseBulkRtuPictureFileName } from './lib/rtu-picture-filename.mjs'
import { uploadPortfolioJsonToR2 } from './upload-json-to-r2.mjs'
import {
  RTU_GPS_MATCH_FEET,
  findRtuInPortfolio,
  gpsWarningForRtu,
  parseRtuPictureKey,
  readImageGpsFromBuffer,
} from './lib/rtu-gps-validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'supabase', 'data')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const buildingsPath = join(DATA_DIR, 'buildings.json')

function parsePictureIndex(fileName) {
  const stored = fileName.match(/_\((\d+)\)\.[^.]+$/i)
  if (stored) return Number(stored[1])
  const bulk = parseBulkRtuPictureFileName(fileName)
  return bulk?.pictureIndex ?? null
}

function resolveBundlePath() {
  const arg = process.argv[2]
  if (arg) {
    const resolved = join(process.cwd(), arg)
    if (!existsSync(resolved)) {
      console.error(`Bundle not found: ${resolved}`)
      process.exit(1)
    }
    return resolved
  }
  for (const candidate of [
    join(ROOT, 'deploy-bundle.json'),
    join(DATA_DIR, 'deploy-bundle.json'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  console.error(
    'No deploy bundle found. Export from Settings in local dev, then run:\n' +
      '  node scripts/apply-deploy-bundle.mjs path/to/deploy-bundle.json',
  )
  process.exit(1)
}

function portfolioToLegacyFiles(portfolio) {
  const buildings = portfolio.buildings.map((b) => ({
    park: b.park,
    address: b.address,
    bu: b.bu,
    lat: b.lat,
    lng: b.lng,
    sqft: b.sqft,
    cluster: b.cluster,
    manager: b.manager,
    ...(b.notes ? { notes: b.notes } : {}),
    ...(b.sold !== undefined ? { sold: b.sold } : {}),
    rtus: (b.rtus ?? []).map((r) => ({
      name: r.name,
      desc: r.description,
      lat: r.lat,
      lng: r.lng,
    })),
  }))

  const utilities = portfolio.utilities.map((u) => ({
    type: u.utility_type,
    name: u.name,
    desc: u.description,
    lat: u.lat,
    lng: u.lng,
  }))

  const polygons = portfolio.polygons.map((p) => ({
    name: p.name,
    desc: p.description,
    color: p.color,
    paths: p.paths,
  }))

  return { buildings, utilities, polygons }
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const bundlePath = resolveBundlePath()
console.log(`Reading ${bundlePath}`)
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))

if (bundle.version !== 1) {
  console.error(`Unsupported bundle version: ${bundle.version}`)
  process.exit(1)
}

if (!bundle.portfolio?.buildings?.length) {
  console.error('Bundle is missing portfolio.buildings')
  process.exit(1)
}

const legacy = portfolioToLegacyFiles(bundle.portfolio)
writeJson(buildingsPath, legacy.buildings)
writeJson(join(DATA_DIR, 'utilities.json'), legacy.utilities)
writeJson(join(DATA_DIR, 'polygons.json'), legacy.polygons)
console.log(
  `Portfolio: ${legacy.buildings.length} buildings, ${legacy.utilities.length} utilities, ${legacy.polygons.length} polygons`,
)

const schedule = {
  replacementYears: bundle.schedule?.replacementYears ?? {},
  notes: bundle.schedule?.notes ?? {},
  sourceFile: bundle.schedule?.sourceFile ?? null,
}
writeJson(join(DATA_DIR, 'rtu-schedule.json'), schedule)
const yearCount = Object.keys(schedule.replacementYears).length
const noteCount = Object.keys(schedule.notes).length
console.log(`RTU schedule: ${yearCount} replacement years, ${noteCount} notes`)

const pricing = {
  version: bundle.pricing?.version ?? null,
  rows: bundle.pricing?.rows ?? [],
}
writeJson(join(DATA_DIR, 'rtu-pricing-rows.json'), pricing)
console.log(`RTU pricing: ${pricing.rows.length} rows (version ${pricing.version ?? 'n/a'})`)

mkdirSync(PICS_DIR, { recursive: true })
const manifestPath = join(PICS_DIR, 'manifest.json')
let manifest = { entries: {} }
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest.entries) manifest.entries = {}
  } catch {
    manifest = { entries: {} }
  }
}

const pictures = bundle.pictures ?? []
let r2Uploads = 0
let localWrites = 0
let gpsWarnings = 0

for (const pic of pictures) {
  if (!pic.fileName || !pic.base64) continue
  const buffer = Buffer.from(pic.base64, 'base64')

  if (pic.rtuKey) {
    const parsed = parseRtuPictureKey(pic.rtuKey)
    const match = parsed
      ? findRtuInPortfolio(legacy.buildings, parsed.buildingAddress, parsed.rtuName)
      : null
    if (!match) {
      console.warn(`Warning: bundle RTU not in portfolio — ${pic.fileName} → ${pic.rtuKey}`)
    } else {
      const photoGps = await readImageGpsFromBuffer(buffer)
      const warning = gpsWarningForRtu(photoGps, match.rtu)
      if (warning) {
        gpsWarnings += 1
        console.warn(`GPS warning: ${pic.fileName} @ ${parsed.buildingAddress} — ${warning}`)
      }
    }
  }

  if (isR2Configured()) {
    await uploadRtuPictureToR2(
      pic.fileName,
      buffer,
      guessPictureContentType(pic.fileName),
    )
    r2Uploads += 1
  } else {
    const filePath = join(PICS_DIR, pic.fileName)
    writeFileSync(filePath, buffer)
    localWrites += 1
  }

  const key = pic.rtuKey
  if (!key) continue
  let files = manifest.entries[key] ?? []
  files = files.filter((name) => parsePictureIndex(name) !== pic.index)
  files.push(pic.fileName)
  files.sort((a, b) => (parsePictureIndex(a) ?? 0) - (parsePictureIndex(b) ?? 0))
  manifest.entries[key] = files
}
writeJson(manifestPath, manifest)

if (isR2Configured()) {
  console.log(
    `RTU pictures: uploaded ${r2Uploads} file(s) to Cloudflare R2` +
      (gpsWarnings ? ` (${gpsWarnings} GPS warning(s) beyond ${RTU_GPS_MATCH_FEET} ft)` : ''),
  )
} else if (localWrites) {
  console.log(`RTU pictures: wrote ${localWrites} file(s) to ${PICS_DIR} (R2 not configured)`)
} else {
  console.log('RTU pictures: no picture files in bundle')
}

const jsonUpload = await uploadPortfolioJsonToR2()
if (jsonUpload.uploaded > 0) {
  console.log(`Portfolio JSON: uploaded ${jsonUpload.uploaded} file(s) to R2 JSON bucket`)
}

console.log('\nDone. Review changes, then commit and push to update GitHub Pages.')
