/**
 * Delete RTU pictures listed in a text file from Cloudflare R2, manifest.json, and hidden.json.
 *
 * Usage:
 *   node scripts/delete-rtu-pictures-from-list.mjs --list nogps-list.txt --dry-run
 *   node scripts/delete-rtu-pictures-from-list.mjs --list nogps-list.txt --yes
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alternateCdnFileNames } from './lib/cloud-picture-filename.mjs'
import {
  collectManifestFileNames,
  diffManifestFileNames,
} from './lib/build-manifest-from-files.mjs'
import { getProjectRoot, loadDotEnvLocal } from './lib/load-dotenv-local.mjs'
import { buildRtuCatalog, matchFileToRtu, rtuPictureKey } from './lib/rtu-picture-filename.mjs'
import {
  deleteR2PicturesByFileNames,
  isR2Configured,
  listR2PictureFileNames,
} from './lib/r2-client.mjs'
import { uploadPortfolioJsonToR2 } from './upload-json-to-r2.mjs'
import {
  appendSyncHistoryEntry,
  buildSyncMetaFromDataDir,
  writeSyncMetaFile,
} from './lib/sync-meta.mjs'

const ROOT = getProjectRoot()
const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')
const HIDDEN_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'hidden.json')
const DATA_DIR = join(ROOT, 'supabase', 'data')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const REPORT_DIR = join(ROOT, 'reports')

function parseArgs(argv) {
  let listPath = join(ROOT, 'nogps-list.txt')
  let dryRun = false
  let yes = false
  let skipUpload = false

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--list') listPath = argv[++i] ?? listPath
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--yes') yes = true
    else if (arg === '--skip-upload') skipUpload = true
    else if (!arg.startsWith('-')) listPath = arg
  }

  return { listPath, dryRun, yes, skipUpload }
}

function loadTargetFileNames(listPath) {
  if (!existsSync(listPath)) {
    throw new Error(`List file not found: ${listPath}`)
  }
  const names = []
  for (const rawLine of readFileSync(listPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (/^\d+$/.test(line) && names.length === 0) continue
    names.push(line)
  }
  return [...new Set(names)]
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

function findRtuKeyForFile(manifest, fileName) {
  const lower = fileName.toLowerCase()
  for (const [key, files] of Object.entries(manifest.entries ?? {})) {
    if (!Array.isArray(files)) continue
    if (files.includes(fileName)) return key
    if (files.some((name) => name.toLowerCase() === lower)) return key
  }
  return null
}

function resolveRtuKey(manifest, fileName, catalog) {
  const fromManifest = findRtuKeyForFile(manifest, fileName)
  if (fromManifest) return fromManifest
  const match = matchFileToRtu(catalog, fileName)
  if (!match.entry) return null
  return rtuPictureKey(match.entry.building.address, match.entry.rtu.name)
}

function collectDeleteNames(targets, manifest, catalog, r2Names) {
  const deleteNames = new Set()
  const r2Lower = new Map()
  for (const name of r2Names) {
    const key = name.toLowerCase()
    if (!r2Lower.has(key)) r2Lower.set(key, name)
  }

  for (const fileName of targets) {
    const rtuKey = resolveRtuKey(manifest, fileName, catalog)
    const candidates = rtuKey ? alternateCdnFileNames(fileName, rtuKey) : [fileName]
    for (const candidate of candidates) {
      deleteNames.add(candidate)
      const onR2 = r2Lower.get(candidate.toLowerCase())
      if (onR2) deleteNames.add(onR2)
    }
  }

  return [...deleteNames].sort()
}

function removeFromManifest(manifest, targets) {
  const targetLower = new Set(targets.map((name) => name.toLowerCase()))
  let removed = 0
  const nextEntries = {}

  for (const [key, files] of Object.entries(manifest.entries ?? {})) {
    if (!Array.isArray(files)) continue
    const kept = files.filter((fileName) => {
      if (targetLower.has(fileName.toLowerCase())) {
        removed += 1
        return false
      }
      return true
    })
    if (kept.length) nextEntries[key] = kept
  }

  return { manifest: { entries: nextEntries }, removed }
}

function removeFromHidden(hiddenKeys, targets, manifest) {
  const targetLower = new Set(targets.map((name) => name.toLowerCase()))
  const keysToDrop = new Set()

  for (const hideKey of hiddenKeys) {
    const pipe = hideKey.lastIndexOf('|')
    if (pipe < 0) continue
    const fileName = hideKey.slice(pipe + 1)
    if (targetLower.has(fileName.toLowerCase())) keysToDrop.add(hideKey)
  }

  for (const fileName of targets) {
    const rtuKey = findRtuKeyForFile(manifest, fileName)
    if (rtuKey) keysToDrop.add(`${rtuKey}|${fileName}`)
  }

  return hiddenKeys.filter((key) => !keysToDrop.has(key))
}

async function main() {
  loadDotEnvLocal()
  const { listPath, dryRun, yes, skipUpload } = parseArgs(process.argv)

  if (!isR2Configured()) {
    console.error('R2 is not configured. Set credentials in .env.local')
    process.exit(1)
  }

  const targets = loadTargetFileNames(listPath)
  if (!targets.length) {
    console.log('No file names in list.')
    return
  }

  const manifest = readJson(MANIFEST_PATH, { entries: {} })
  const hidden = readJson(HIDDEN_PATH, [])
  const catalog = buildRtuCatalog(loadBuildingsJson())
  const beforeNames = collectManifestFileNames(manifest)

  console.log(`List: ${listPath}`)
  console.log(`Targets: ${targets.length} file name(s)`)

  const r2Names = await listR2PictureFileNames()
  const deleteNames = collectDeleteNames(targets, manifest, catalog, r2Names)
  const onR2 = deleteNames.filter((name) =>
    r2Names.some((r2Name) => r2Name.toLowerCase() === name.toLowerCase()),
  )
  const inManifest = targets.filter((name) =>
    [...beforeNames].some((manifestName) => manifestName.toLowerCase() === name.toLowerCase()),
  )

  console.log(`In manifest: ${inManifest.length}`)
  console.log(`R2 objects to delete (incl. aliases): ${onR2.length}`)

  if (!onR2.length && !inManifest.length) {
    console.log('\nNothing matched manifest or R2.')
    return
  }

  if (!yes && !dryRun) {
    console.error('\nRe-run with --dry-run to preview or --yes to apply.')
    process.exit(1)
  }

  if (dryRun) {
    console.log('\nDry run — sample R2 deletions:')
    for (const name of onR2.slice(0, 20)) console.log(`  ${name}`)
    if (onR2.length > 20) console.log(`  … and ${onR2.length - 20} more`)
    console.log('\nDry run — sample manifest removals:')
    for (const name of inManifest.slice(0, 20)) console.log(`  ${name}`)
    if (inManifest.length > 20) console.log(`  … and ${inManifest.length - 20} more`)
    return
  }

  const { manifest: updatedManifest, removed: manifestRemoved } = removeFromManifest(
    manifest,
    targets,
  )
  const afterNames = collectManifestFileNames(updatedManifest)
  const manifestDiff = diffManifestFileNames(beforeNames, afterNames)
  const updatedHidden = removeFromHidden(
    Array.isArray(hidden) ? hidden : [],
    targets,
    manifest,
  )

  console.log('\nDeleting from R2…')
  const deleteResult = await deleteR2PicturesByFileNames(onR2, {
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) console.log(`  deleted ${done}/${total}`)
    },
  })

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')
  writeFileSync(HIDDEN_PATH, `${JSON.stringify(updatedHidden, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${MANIFEST_PATH} (-${manifestRemoved} picture reference(s))`)
  console.log(`Wrote ${HIDDEN_PATH}`)

  const syncMetaPath = join(DATA_DIR, 'sync-meta.json')
  const syncMeta = buildSyncMetaFromDataDir(DATA_DIR, PICS_DIR, {
    source: 'nogps-picture-prune',
    preserveExportedAt: true,
  })
  syncMeta.summary = {
    ...syncMeta.summary,
    picturesRemoved: manifestDiff.removed.length,
  }
  writeSyncMetaFile(syncMetaPath, syncMeta)
  appendSyncHistoryEntry(DATA_DIR, syncMeta)
  console.log(`Updated ${syncMetaPath}`)

  if (!skipUpload) {
    const jsonUpload = await uploadPortfolioJsonToR2()
    console.log(`Uploaded ${jsonUpload.uploaded} JSON file(s) to R2`)
  }

  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const reportPath = join(REPORT_DIR, `nogps-picture-delete-${stamp}.json`)
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        listPath,
        targets: targets.length,
        manifestRemoved: manifestDiff.removed,
        r2Deleted: onR2,
        r2DeleteCount: deleteResult.deleted,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`Report: ${reportPath}`)
  console.log(`\nDone. Removed ${deleteResult.deleted} object(s) from R2 and ${manifestDiff.removed.length} from manifest.`)
}

function loadBuildingsJson() {
  const path = join(DATA_DIR, 'buildings.json')
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
