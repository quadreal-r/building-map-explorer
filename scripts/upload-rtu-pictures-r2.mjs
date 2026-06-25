/**
 * Upload RTU picture files from public/database/rtu-pictures/ to Cloudflare R2.
 * Validates EXIF GPS against RTU marker positions (100 ft) before upload.
 *
 * Usage:
 *   node scripts/upload-rtu-pictures-r2.mjs
 *
 * Env: see scripts/lib/r2-client.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getR2PublicBaseUrl,
  guessPictureContentType,
  isR2Configured,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'
import {
  RTU_GPS_MATCH_FEET,
  findRtuInPortfolio,
  gpsWarningForRtu,
  loadBuildingsJson,
  parseRtuPictureKey,
  readImageGpsFromFile,
} from './lib/rtu-gps-validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const MANIFEST_PATH = join(PICS_DIR, 'manifest.json')

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i

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

async function main() {
  if (!isR2Configured()) {
    console.log('R2 not configured — skipping RTU picture upload.')
    return
  }

  const buildings = loadBuildingsJson(ROOT)
  const manifestMap = loadManifestFileMap()
  const publicBase = getR2PublicBaseUrl()
  const fileNames = collectFileNames(manifestMap)
  if (!fileNames.length) {
    console.log('No RTU picture files to upload.')
    return
  }

  let uploaded = 0
  let skipped = 0
  let gpsWarnings = 0
  let noGps = 0
  const warningLines = []

  for (const fileName of fileNames) {
    const filePath = join(PICS_DIR, fileName)
    if (!existsSync(filePath)) {
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
    console.log(`Uploaded: ${fileName}`)
  }

  console.log(
    `\nDone. Uploaded ${uploaded} file(s) to R2${skipped ? `, skipped ${skipped} missing locally` : ''}.`,
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
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
