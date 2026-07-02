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
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  guessPictureContentType,
  guessDocumentContentType,
  isR2Configured,
  isR2DocumentsConfigured,
  uploadRtuDocumentToR2,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'
import { parseBulkRtuPictureFileName } from './lib/rtu-picture-filename.mjs'
import { buildSyncMetaFromBundle, writeSyncMetaFile, appendSyncHistoryEntry } from './lib/sync-meta.mjs'
import { readBuildVersionLabel } from './lib/read-build-version.mjs'
import { uploadPortfolioJsonToR2 } from './upload-json-to-r2.mjs'
import {
  findRtuInPortfolio,
  parseRtuPictureKey,
} from './lib/rtu-gps-validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'supabase', 'data')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const DOCS_DIR = join(ROOT, 'public', 'database', 'rtu-documents')
const buildingsPath = join(DATA_DIR, 'buildings.json')

function parsePictureIndex(fileName) {
  const stored = fileName.match(/_\((\d+)\)\.[^.]+$/i)
  if (stored) return Number(stored[1])
  const bulk = parseBulkRtuPictureFileName(fileName)
  return bulk?.pictureIndex ?? null
}

/** Inline bundle pictures, or deploy-pictures-N.json from load-sync-staging-bundle.mjs */
function* iterateDeployPictures(bundle) {
  if (bundle.pictures?.length) {
    yield* bundle.pictures
    return
  }
  const chunkFiles = readdirSync(process.cwd())
    .filter((name) => /^deploy-pictures-\d+\.json$/.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/(\d+)/)?.[1] ?? 0)
      const bi = Number(b.match(/(\d+)/)?.[1] ?? 0)
      return ai - bi
    })
  for (const fileName of chunkFiles) {
    const chunk = JSON.parse(readFileSync(join(process.cwd(), fileName), 'utf8'))
    if (!Array.isArray(chunk)) {
      console.error(`Warning: ${fileName} is not a JSON array — skipped`)
      continue
    }
    yield* chunk
  }
}

/** Inline bundle documents, or deploy-documents-N.json from load-sync-staging-bundle.mjs */
function* iterateDeployDocuments(bundle) {
  if (bundle.documents?.length) {
    yield* bundle.documents
    return
  }
  const chunkFiles = readdirSync(process.cwd())
    .filter((name) => /^deploy-documents-\d+\.json$/.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/(\d+)/)?.[1] ?? 0)
      const bi = Number(b.match(/(\d+)/)?.[1] ?? 0)
      return ai - bi
    })
  for (const fileName of chunkFiles) {
    const chunk = JSON.parse(readFileSync(join(process.cwd(), fileName), 'utf8'))
    if (!Array.isArray(chunk)) {
      console.error(`Warning: ${fileName} is not a JSON array — skipped`)
      continue
    }
    yield* chunk
  }
}

function mergeManifestEntries(manifest, overlay) {
  if (!overlay?.entries) return 0
  let added = 0
  for (const [rtuKey, files] of Object.entries(overlay.entries)) {
    if (!Array.isArray(files) || !files.length) continue
    const existing = new Set(manifest.entries[rtuKey] ?? [])
    const next = [...(manifest.entries[rtuKey] ?? [])]
    for (const fileName of files) {
      if (typeof fileName !== 'string' || !fileName.trim() || existing.has(fileName)) continue
      existing.add(fileName)
      next.push(fileName)
      added += 1
    }
    next.sort((a, b) => a.localeCompare(b))
    manifest.entries[rtuKey] = next
  }
  return added
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

function parsePictureHideKey(hideKey) {
  const sep = hideKey.lastIndexOf('|')
  if (sep <= 0) return null
  const fileName = hideKey.slice(sep + 1)
  const rtuKey = hideKey.slice(0, sep)
  if (!rtuKey || !fileName) return null
  return { rtuKey, fileName }
}

function applyHiddenPicturesToManifest(manifest, hiddenKeys) {
  let removed = 0
  for (const hideKey of hiddenKeys) {
    const parsed = parsePictureHideKey(hideKey)
    if (!parsed) continue
    const files = manifest.entries[parsed.rtuKey]
    if (!Array.isArray(files)) continue
    const next = files.filter((name) => name !== parsed.fileName)
    if (next.length === files.length) continue
    removed += 1
    if (next.length) manifest.entries[parsed.rtuKey] = next
    else delete manifest.entries[parsed.rtuKey]
  }
  return removed
}

function readHiddenJson(path) {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string')
  } catch {
    return []
  }
}

function manifestEntryKeys(manifest) {
  const keys = new Set()
  for (const [rtuKey, files] of Object.entries(manifest?.entries ?? {})) {
    if (!Array.isArray(files)) continue
    for (const fileName of files) keys.add(`${rtuKey}\0${fileName}`)
  }
  return keys
}

function diffManifestKeys(before, after) {
  const beforeKeys = manifestEntryKeys(before)
  const afterKeys = manifestEntryKeys(after)
  let added = 0
  let removed = 0
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) added += 1
  }
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) removed += 1
  }
  return { added, removed }
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
const manifestBefore = JSON.parse(JSON.stringify(manifest))

let r2Uploads = 0
let localWrites = 0
let pictureCount = 0

for (const pic of iterateDeployPictures(bundle)) {
  pictureCount += 1
  if (!pic.fileName || !pic.base64) continue
  const buffer = Buffer.from(pic.base64, 'base64')

  if (pic.rtuKey) {
    const parsed = parseRtuPictureKey(pic.rtuKey)
    const match = parsed
      ? findRtuInPortfolio(legacy.buildings, parsed.buildingAddress, parsed.rtuName)
      : null
    if (!match) {
      console.warn(`Warning: bundle RTU not in portfolio — ${pic.fileName} → ${pic.rtuKey}`)
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

const hiddenPath = join(PICS_DIR, 'hidden.json')
const hiddenBefore = new Set(readHiddenJson(hiddenPath))
const bundleHidden = (bundle.hiddenRtuPictures ?? []).filter((item) => typeof item === 'string')
const picturesHidden = bundleHidden.filter((key) => !hiddenBefore.has(key)).length
const mergedHidden = [...new Set([...hiddenBefore, ...bundleHidden])]
writeJson(hiddenPath, mergedHidden)
if (mergedHidden.length) {
  const removed = applyHiddenPicturesToManifest(manifest, mergedHidden)
  console.log(
    `RTU pictures: ${mergedHidden.length} hidden in hidden.json` +
      (removed ? ` (${removed} removed from manifest)` : ''),
  )
}

writeJson(manifestPath, manifest)

mkdirSync(DOCS_DIR, { recursive: true })
const documentsManifestPath = join(DOCS_DIR, 'documents-manifest.json')
let documentsManifest = { entries: {} }
if (existsSync(documentsManifestPath)) {
  try {
    documentsManifest = JSON.parse(readFileSync(documentsManifestPath, 'utf8'))
    if (!documentsManifest.entries) documentsManifest.entries = {}
  } catch {
    documentsManifest = { entries: {} }
  }
}

let documentR2Uploads = 0
let documentLocalWrites = 0
let documentCount = 0

for (const doc of iterateDeployDocuments(bundle)) {
  documentCount += 1
  if (!doc.fileName || !doc.base64) continue
  const buffer = Buffer.from(doc.base64, 'base64')

  if (isR2DocumentsConfigured()) {
    await uploadRtuDocumentToR2(
      doc.fileName,
      buffer,
      doc.mimeType ?? guessDocumentContentType(doc.fileName),
    )
    documentR2Uploads += 1
  } else {
    writeFileSync(join(DOCS_DIR, doc.fileName), buffer)
    documentLocalWrites += 1
  }

  const key = doc.rtuKey
  if (!key) continue
  const files = documentsManifest.entries[key] ?? []
  if (!files.includes(doc.fileName)) {
    documentsManifest.entries[key] = [...files, doc.fileName].sort((a, b) => a.localeCompare(b))
  }
}

const manifestLinksAdded = mergeManifestEntries(documentsManifest, bundle.documentsManifest)
writeJson(documentsManifestPath, documentsManifest)
if (documentCount || manifestLinksAdded) {
  console.log(
    `RTU documents: ${documentCount} file(s) in bundle` +
      (manifestLinksAdded ? `, ${manifestLinksAdded} manifest link(s) added` : ''),
  )
}
if (isR2DocumentsConfigured() && documentR2Uploads) {
  console.log(`RTU documents: uploaded ${documentR2Uploads} file(s) to Cloudflare R2`)
} else if (documentLocalWrites) {
  console.log(`RTU documents: wrote ${documentLocalWrites} file(s) to ${DOCS_DIR}`)
}

const { added: picturesAdded, removed: picturesRemoved } = diffManifestKeys(manifestBefore, manifest)
const buildVersionLabel = readBuildVersionLabel(ROOT)

const syncMeta = buildSyncMetaFromBundle(bundle, {
  manifest,
  picturesUploaded: r2Uploads + localWrites,
  pictureChunkCount: bundle.pictureChunkCount ?? 0,
  picturesAdded,
  picturesRemoved,
  picturesHidden,
  buildVersionLabel,
})
writeSyncMetaFile(join(DATA_DIR, 'sync-meta.json'), syncMeta)
appendSyncHistoryEntry(DATA_DIR, syncMeta)
console.log(`Sync meta: exported ${syncMeta.exportedAt}`)
if (buildVersionLabel) {
  console.log(`App build version (repo): ${buildVersionLabel}`)
}
if (bundle.clientBuildVersionLabel && bundle.clientBuildVersionLabel !== buildVersionLabel) {
  console.log(
    `Browser build when exported: ${bundle.clientBuildVersionLabel} (push code with npm run push-live to match live UI)`,
  )
}
if (picturesAdded || picturesRemoved || picturesHidden) {
  console.log(
    `Picture manifest: +${picturesAdded} added, -${picturesRemoved} removed, ${picturesHidden} newly hidden`,
  )
}

if (isR2Configured()) {
  console.log(
    `RTU pictures: uploaded ${r2Uploads} file(s) to Cloudflare R2` +
      (localWrites ? `; wrote ${localWrites} locally` : ''),
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
