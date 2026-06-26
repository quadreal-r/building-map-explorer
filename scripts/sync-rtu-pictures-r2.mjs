/**
 * Compare manifest.json with Cloudflare R2 and upload only missing pictures.
 *
 * Usage:
 *   node scripts/sync-rtu-pictures-r2.mjs
 *   node scripts/sync-rtu-pictures-r2.mjs --verify-cdn
 *   node scripts/sync-rtu-pictures-r2.mjs --upload --from-folder "C:/Users/Robert/Pictures/RTU-Pictures"
 *   node scripts/sync-rtu-pictures-r2.mjs --dry-run --upload
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getR2KeyPrefix,
  getR2PublicBaseUrl,
  guessPictureContentType,
  isR2Configured,
  listR2PictureFileNames,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'

const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const REPORT_DIR = join(ROOT, 'reports')
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i
const DEFAULT_FOLDER = 'C:/Users/Robert/Pictures/RTU-Pictures'

function parseArgs(argv) {
  let fromFolder = null
  let upload = false
  let dryRun = false
  let verifyCdn = false

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (arg === '--upload') upload = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--verify-cdn') verifyCdn = true
    else if (!arg.startsWith('-')) fromFolder = arg
  }

  return { fromFolder, upload, dryRun, verifyCdn }
}

function loadManifestFileNames() {
  if (!existsSync(MANIFEST_PATH)) return []
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const names = new Set()
  for (const files of Object.values(manifest.entries ?? {})) {
    if (!Array.isArray(files)) continue
    for (const fileName of files) {
      if (typeof fileName === 'string' && fileName) names.add(fileName)
    }
  }
  return [...names].sort()
}

function buildCaseInsensitiveMap(names) {
  const byLower = new Map()
  for (const name of names) {
    const key = name.toLowerCase()
    if (!byLower.has(key)) byLower.set(key, name)
  }
  return byLower
}

function findR2Name(manifestName, r2Exact, r2ByLower) {
  if (r2Exact.has(manifestName)) return { r2Name: manifestName, match: 'exact' }
  const alt = r2ByLower.get(manifestName.toLowerCase())
  if (alt) return { r2Name: alt, match: 'case' }
  return null
}

function buildFolderFileIndex(rootDir) {
  const index = new Map()
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (/old/i.test(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && IMAGE_EXT.test(entry.name) && !index.has(entry.name)) {
        index.set(entry.name, full)
      }
    }
  }
  walk(rootDir)
  return index
}

function resolveLocalPath(fileName, fromFolder, folderIndex) {
  if (fromFolder && folderIndex) {
    return folderIndex.get(fileName) ?? null
  }
  const local = join(PICS_DIR, fileName)
  return existsSync(local) ? local : null
}

async function verifyPublicUrl(fileName, publicBase) {
  const url = `${publicBase}${encodeURIComponent(fileName)}`
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return { url, status: response.status, ok: response.ok }
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, upload, dryRun, verifyCdn } = parseArgs(process.argv)

  if (!isR2Configured()) {
    console.error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env.local.',
    )
    process.exit(1)
  }

  const manifestNames = loadManifestFileNames()
  if (!manifestNames.length) {
    console.log('No files in manifest.json.')
    return
  }

  console.log(`Manifest: ${manifestNames.length} file(s)`)
  console.log(`Listing R2 bucket (prefix: "${getR2KeyPrefix() || '(root)'}")…`)

  const r2Names = await listR2PictureFileNames()
  const r2Exact = new Set(r2Names)
  const r2ByLower = buildCaseInsensitiveMap(r2Names)

  console.log(`R2 bucket: ${r2Names.length} image file(s)`)

  const matched = []
  const caseMismatches = []
  const missingOnR2 = []

  for (const manifestName of manifestNames) {
    const hit = findR2Name(manifestName, r2Exact, r2ByLower)
    if (!hit) {
      missingOnR2.push(manifestName)
    } else if (hit.match === 'case') {
      caseMismatches.push({ manifest: manifestName, r2: hit.r2Name })
      matched.push(manifestName)
    } else {
      matched.push(manifestName)
    }
  }

  const manifestLower = new Set(manifestNames.map((n) => n.toLowerCase()))
  const extraOnR2 = r2Names.filter((name) => !manifestLower.has(name.toLowerCase()))

  const publicBase = getR2PublicBaseUrl()
  const cdnChecks = []
  if (verifyCdn && publicBase) {
    const sample = missingOnR2.slice(0, 50)
    console.log(`Checking public CDN for ${sample.length} missing file(s)…`)
    for (const fileName of sample) {
      cdnChecks.push({ fileName, ...(await verifyPublicUrl(fileName, publicBase)) })
    }
  }

  const cdnReachableDespiteMissing = cdnChecks.filter((c) => c.ok)
  const report = {
    generatedAt: new Date().toISOString(),
    manifestCount: manifestNames.length,
    r2Count: r2Names.length,
    matchedCount: matched.length,
    missingOnR2Count: missingOnR2.length,
    caseMismatchCount: caseMismatches.length,
    extraOnR2Count: extraOnR2.length,
    r2KeyPrefix: getR2KeyPrefix(),
    publicBaseUrl: publicBase,
    missingOnR2,
    caseMismatches,
    extraOnR2: extraOnR2.slice(0, 200),
    cdnChecks,
    cdnReachableDespiteMissing: cdnReachableDespiteMissing.map((c) => c.fileName),
  }

  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const reportPath = join(REPORT_DIR, `rtu-picture-r2-sync-${stamp}.json`)
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`\nCompare results:`)
  console.log(`  Matched (manifest ∩ R2):     ${matched.length}`)
  console.log(`  Missing on R2:               ${missingOnR2.length}`)
  console.log(`  Case mismatch (same file):   ${caseMismatches.length}`)
  console.log(`  On R2 but not in manifest:   ${extraOnR2.length}`)
  if (cdnReachableDespiteMissing.length) {
    console.log(
      `  CDN reachable but not in list: ${cdnReachableDespiteMissing.length} (check R2_KEY_PREFIX / bucket)`,
    )
  }
  console.log(`\nReport: ${reportPath}`)

  if (missingOnR2.length) {
    console.log('\nFirst missing on R2:')
    for (const name of missingOnR2.slice(0, 15)) console.log(`  ${name}`)
    if (missingOnR2.length > 15) console.log(`  … and ${missingOnR2.length - 15} more`)
  }

  if (caseMismatches.length) {
    console.log('\nCase mismatches (manifest vs R2):')
    for (const row of caseMismatches.slice(0, 10)) {
      console.log(`  manifest: ${row.manifest}  →  R2: ${row.r2}`)
    }
  }

  if (!upload) {
    if (missingOnR2.length) {
      console.log(
        '\nTo upload only missing files:\n  npm run sync-rtu-pictures-r2 -- --upload --from-folder "C:/Users/Robert/Pictures/RTU-Pictures"',
      )
    }
    return
  }

  if (!missingOnR2.length) {
    console.log('\nNothing to upload — manifest and R2 are in sync.')
    return
  }

  const sourceFolder = fromFolder ?? DEFAULT_FOLDER
  if (!existsSync(sourceFolder)) {
    console.error(`\nLocal source folder not found: ${sourceFolder}`)
    console.error('Pass --from-folder with pictures to upload missing files.')
    process.exit(1)
  }

  const folderIndex = buildFolderFileIndex(sourceFolder)
  const toUpload = missingOnR2.filter((name) => folderIndex.has(name))
  const noLocal = missingOnR2.filter((name) => !folderIndex.has(name))

  console.log(`\nUpload plan: ${toUpload.length} file(s) from ${sourceFolder}`)
  if (noLocal.length) {
    console.log(`  ${noLocal.length} missing on R2 and not found locally`)
  }

  if (dryRun) {
    console.log('\nDry run — no uploads performed.')
    for (const name of toUpload.slice(0, 20)) console.log(`  would upload: ${name}`)
    return
  }

  let uploaded = 0
  for (const fileName of toUpload) {
    const filePath = folderIndex.get(fileName)
    const body = readFileSync(filePath)
    await uploadRtuPictureToR2(fileName, body, guessPictureContentType(fileName))
    uploaded += 1
    if (uploaded % 25 === 0 || uploaded === 1 || uploaded === toUpload.length) {
      console.log(`Uploaded ${uploaded}/${toUpload.length}: ${fileName}`)
    }
  }

  console.log(`\nDone. Uploaded ${uploaded} missing file(s) to R2.`)
  if (publicBase && uploaded) {
    console.log(`Sample URL: ${publicBase}${encodeURIComponent(toUpload[0])}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
