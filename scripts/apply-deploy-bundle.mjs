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

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'supabase', 'data')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')

function parsePictureIndex(fileName) {
  const match = fileName.match(/_\((\d+)\)\.[^.]+$/i)
  return match ? Number(match[1]) : null
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

function portfolioToLegacyFiles(portfolio, existingBuildings) {
  const tenantsByAddress = new Map()
  for (const building of existingBuildings ?? []) {
    if (building.tenants?.length) {
      tenantsByAddress.set(building.address, building.tenants)
    }
  }

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
    ...(tenantsByAddress.has(b.address)
      ? { tenants: tenantsByAddress.get(b.address) }
      : {}),
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

let existingBuildings = []
const buildingsPath = join(DATA_DIR, 'buildings.json')
if (existsSync(buildingsPath)) {
  existingBuildings = JSON.parse(readFileSync(buildingsPath, 'utf8'))
}

const legacy = portfolioToLegacyFiles(bundle.portfolio, existingBuildings)
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
for (const pic of pictures) {
  if (!pic.fileName || !pic.base64) continue
  const filePath = join(PICS_DIR, pic.fileName)
  writeFileSync(filePath, Buffer.from(pic.base64, 'base64'))
  const key = pic.rtuKey
  if (!key) continue
  let files = manifest.entries[key] ?? []
  files = files.filter((name) => parsePictureIndex(name) !== pic.index)
  files.push(pic.fileName)
  files.sort((a, b) => (parsePictureIndex(a) ?? 0) - (parsePictureIndex(b) ?? 0))
  manifest.entries[key] = files
}
writeJson(manifestPath, manifest)
console.log(`RTU pictures: wrote ${pictures.length} IndexedDB uploads to ${PICS_DIR}`)

console.log('\nDone. Review changes, then commit and push to update GitHub Pages.')
