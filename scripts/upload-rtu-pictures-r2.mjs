/**
 * Upload RTU picture files to Cloudflare R2.
 * Validates EXIF GPS against RTU marker positions (100 ft) before upload.
 *
 * Usage:
 *   node scripts/upload-rtu-pictures-r2.mjs
 *   node scripts/upload-rtu-pictures-r2.mjs --skip-existing --from-folder "C:/Users/Robert/Pictures/RTU-Pictures"
 *
 * By default reads files from public/database/rtu-pictures/ (manifest-listed names only).
 * With --from-folder, uploads manifest entries found anywhere under that folder tree.
 *
 * Loads .env.local from project root when present.
 * Env: see scripts/lib/r2-client.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getR2PublicBaseUrl,
  guessPictureContentType,
  isR2Configured,
  listR2PictureFileNames,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'
import {
  RTU_GPS_MATCH_FEET,
  findRtuInPortfolio,
  gpsWarningForRtu,
  loadBuildingsJson,
  parseRtuPictureKey,
  readImageGpsFromFile,
} from './lib/rtu-gps-validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const MANIFEST_PATH = join(PICS_DIR, 'manifest.json')

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i

function parseArgs(argv) {
  let fromFolder = null
  let skipExisting = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (arg === '--skip-existing') skipExisting = true
    else if (!arg.startsWith('-')) fromFolder = arg
  }
  return { fromFolder, skipExisting }
}

function loadManifestFileMap() {
  /** @type {Map<string, string>} fileName → rtuKey */
  const map = new Map()
  if (!existsSync(MANIFEST_PATH)) return map

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
      for (const fileName of files) {
        if (typeof fileName === 'string' && fileName) map.set(fileName, rtuKey)
      }
    }
  } catch (error) {
    console.warn(`Could not parse manifest: ${error instanceof Error ? error.message : error}`)
  }
  return map
}

function collectFileNames(manifestMap) {
  const names = new Set(manifestMap.keys())
  if (existsSync(PICS_DIR)) {
    for (const entry of readdirSync(PICS_DIR)) {
      if (IMAGE_EXT.test(entry)) names.add(entry)
    }
  }
  return [...names].sort()
}

/** basename → absolute path (first match wins; skips folders named "old"). */
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

function resolveSourcePath(fileName, fromFolder, folderIndex) {
  if (fromFolder) {
    return folderIndex.get(fileName) ?? null
  }
  const local = join(PICS_DIR, fileName)
  return existsSync(local) ? local : null
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, skipExisting } = parseArgs(process.argv)

  if (!isR2Configured()) {
    if (fromFolder) {
      console.error(
        'R2 is not configured. Set credentials in .env.local (see .env.example) or GitHub secrets.',
      )
      process.exit(1)
    }
    console.log('R2 not configured — skipping RTU picture upload.')
    return
  }

  if (fromFolder && !existsSync(fromFolder)) {
    console.error(`Folder not found: ${fromFolder}`)
    process.exit(1)
  }

  const buildings = loadBuildingsJson(ROOT)
  const manifestMap = loadManifestFileMap()
  const publicBase = getR2PublicBaseUrl()
  const fileNames = collectFileNames(manifestMap)
  if (!fileNames.length) {
    console.log('No RTU picture files listed in manifest.')
    return
  }

  const folderIndex = fromFolder ? buildFolderFileIndex(fromFolder) : null
  const sourceLabel = fromFolder ? `folder ${fromFolder}` : PICS_DIR

  const r2Existing = skipExisting ? new Set(await listR2PictureFileNames()) : null
  const r2ByLower = skipExisting
    ? new Map([...r2Existing].map((n) => [n.toLowerCase(), n]))
    : null

  console.log(
    `Uploading up to ${fileNames.length} manifest file(s) from ${sourceLabel}${skipExisting ? ' (skip existing on R2)' : ''}`,
  )

  let uploaded = 0
  let skipped = 0
  let skippedOnR2 = 0
  let gpsWarnings = 0
  let noGps = 0
  const warningLines = []

  for (const fileName of fileNames) {
    if (
      r2Existing &&
      (r2Existing.has(fileName) || r2ByLower.has(fileName.toLowerCase()))
    ) {
      skippedOnR2 += 1
      continue
    }

    const filePath = resolveSourcePath(fileName, fromFolder, folderIndex)
    if (!filePath) {
      skipped += 1
      console.warn(`Skip (missing locally): ${fileName}`)
      continue
    }

    const rtuKey = manifestMap.get(fileName)
    if (rtuKey) {
      const parsed = parseRtuPictureKey(rtuKey)
      const match = parsed
        ? findRtuInPortfolio(buildings, parsed.buildingAddress, parsed.rtuName)
        : null
      if (!match) {
        console.warn(`Warning: manifest RTU not in portfolio — ${fileName} → ${rtuKey}`)
      } else {
        const photoGps = await readImageGpsFromFile(filePath)
        if (!photoGps) {
          noGps += 1
        } else {
          const warning = gpsWarningForRtu(photoGps, match.rtu)
          if (warning) {
            gpsWarnings += 1
            const line = `${fileName} @ ${parsed.buildingAddress} — ${warning}`
            warningLines.push(line)
            console.warn(`GPS warning: ${line}`)
          }
        }
      }
    }

    const body = readFileSync(filePath)
    await uploadRtuPictureToR2(fileName, body, guessPictureContentType(fileName))
    uploaded += 1
    if (uploaded % 50 === 0 || uploaded === 1) {
      console.log(`Uploaded ${uploaded}: ${fileName}`)
    }
  }

  console.log(
    `\nDone. Uploaded ${uploaded} file(s) to R2${skipped ? `, skipped ${skipped} missing locally` : ''}${skippedOnR2 ? `, skipped ${skippedOnR2} already on R2` : ''}.`,
  )
  console.log(
    `GPS check (${RTU_GPS_MATCH_FEET} ft): ${gpsWarnings} warning(s), ${noGps} without EXIF GPS.`,
  )
  if (warningLines.length) {
    console.log('\nGPS warnings (upload continued):')
    for (const line of warningLines) console.log(`  ${line}`)
  }
  if (publicBase) {
    console.log(`\nPublic base URL: ${publicBase}`)
    if (uploaded) {
      const sample = fileNames.find((name) => resolveSourcePath(name, fromFolder, folderIndex))
      if (sample) console.log(`Sample image URL: ${publicBase}${encodeURIComponent(sample)}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
