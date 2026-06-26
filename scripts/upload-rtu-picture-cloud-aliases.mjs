/**
 * Upload cloud-style RTU picture filenames to R2 when only legacy manifest names exist.
 *
 * The app loads pictures via manifestEntryToCloudFileName (e.g. 20-RTU-1-2015.jpg) but
 * many files on R2 still use bulk/manifest names (e.g. 20-RTU-01-1 (2015).jpg).
 * This script copies/uploads each missing cloud alias.
 *
 * Usage:
 *   npm run upload-rtu-picture-cloud-aliases -- --dry-run
 *   npm run upload-rtu-picture-cloud-aliases
 *   npm run upload-rtu-picture-cloud-aliases -- --from-folder "C:/Users/Robert/Pictures/RTU-Pictures"
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { manifestEntryToCloudFileName } from './lib/cloud-picture-filename.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'
import {
  copyRtuPictureOnR2,
  getR2PublicBaseUrl,
  guessPictureContentType,
  isR2Configured,
  listR2PictureFileNames,
  readRtuPictureFromR2,
  uploadRtuPictureToR2,
} from './lib/r2-client.mjs'

const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')
const DEFAULT_FOLDER = 'C:/Users/Robert/Pictures/RTU-Pictures'
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i

function parseArgs(argv) {
  let fromFolder = null
  let dryRun = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (arg === '--dry-run') dryRun = true
    else if (!arg.startsWith('-')) fromFolder = arg
  }
  return { fromFolder, dryRun }
}

function splitRtuKey(rtuKey) {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return { buildingAddress: rtuKey, rtuName: '' }
  return { buildingAddress: rtuKey.slice(0, pipe), rtuName: rtuKey.slice(pipe + 1) }
}

function loadManifestEntries() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const rows = []
  for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const manifestFileName of files) {
      if (typeof manifestFileName !== 'string' || !manifestFileName) continue
      const cloudFileName = manifestEntryToCloudFileName(
        manifestFileName,
        buildingAddress,
        rtuName,
      )
      rows.push({ rtuKey, manifestFileName, cloudFileName })
    }
  }
  return rows
}

function buildCaseInsensitiveFolderIndex(rootDir) {
  const byLower = new Map()
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (/old/i.test(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && IMAGE_EXT.test(entry.name)) {
        const key = entry.name.toLowerCase()
        if (!byLower.has(key)) byLower.set(key, full)
      }
    }
  }
  walk(rootDir)
  return byLower
}

function findR2Name(fileName, r2Exact, r2ByLower) {
  if (r2Exact.has(fileName)) return fileName
  return r2ByLower.get(fileName.toLowerCase()) ?? null
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, dryRun } = parseArgs(process.argv)

  if (!isR2Configured()) {
    console.error('R2 is not configured in .env.local')
    process.exit(1)
  }

  const r2Names = await listR2PictureFileNames()
  const r2Exact = new Set(r2Names)
  const r2ByLower = new Map()
  for (const name of r2Names) {
    const key = name.toLowerCase()
    if (!r2ByLower.has(key)) r2ByLower.set(key, name)
  }

  const folderIndex =
    fromFolder && existsSync(fromFolder) ? buildCaseInsensitiveFolderIndex(fromFolder) : null
  const sourceFolder = fromFolder ?? DEFAULT_FOLDER

  const aliases = []
  for (const row of loadManifestEntries()) {
    if (row.cloudFileName === row.manifestFileName) continue
    if (findR2Name(row.cloudFileName, r2Exact, r2ByLower)) continue
    aliases.push(row)
  }

  console.log(`Cloud aliases needed: ${aliases.length}`)
  if (!aliases.length) {
    console.log('All cloud filenames already exist on R2.')
    return
  }

  if (dryRun) {
    console.log('\nDry run — would upload:')
    for (const row of aliases.slice(0, 20)) {
      const onR2 = findR2Name(row.manifestFileName, r2Exact, r2ByLower)
      const local = folderIndex?.get(row.manifestFileName.toLowerCase())
      console.log(
        `  ${row.cloudFileName}  ←  ${onR2 ? `R2:${onR2}` : local ? `local:${local.split(/[/\\]/).pop()}` : 'NO SOURCE'}`,
      )
    }
    if (aliases.length > 20) console.log(`  … and ${aliases.length - 20} more`)
    return
  }

  let uploaded = 0
  let fromR2 = 0
  let fromLocal = 0
  const failures = []

  for (const row of aliases) {
    const { manifestFileName, cloudFileName } = row
    try {
      const r2Source = findR2Name(manifestFileName, r2Exact, r2ByLower)
      if (r2Source) {
        await copyRtuPictureOnR2(r2Source, cloudFileName)
        fromR2 += 1
      } else {
        const localPath = folderIndex?.get(manifestFileName.toLowerCase())
        if (!localPath) {
          failures.push({ ...row, reason: 'not on R2 or in local folder' })
          continue
        }
        const body = readFileSync(localPath)
        await uploadRtuPictureToR2(
          cloudFileName,
          body,
          guessPictureContentType(manifestFileName),
        )
        fromLocal += 1
      }
      uploaded += 1
      r2Exact.add(cloudFileName)
      if (uploaded % 25 === 0 || uploaded === 1 || uploaded === aliases.length) {
        console.log(`Uploaded ${uploaded}/${aliases.length}: ${cloudFileName}`)
      }
    } catch (error) {
      failures.push({
        ...row,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(
    `\nDone. ${uploaded} cloud alias(es) on R2 (${fromR2} copied from R2, ${fromLocal} from local folder).`,
  )
  if (failures.length) {
    console.log(`\nFailed (${failures.length}):`)
    for (const row of failures.slice(0, 15)) {
      console.log(`  ${row.cloudFileName}: ${row.reason}`)
    }
  }

  const publicBase = getR2PublicBaseUrl()
  if (publicBase && uploaded) {
    console.log(`\nPublic base: ${publicBase}`)
    console.log(`Sample: ${publicBase}${encodeURIComponent(aliases[0].cloudFileName)}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
