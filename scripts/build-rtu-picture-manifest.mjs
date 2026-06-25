/**
 * Build public/database/rtu-pictures/manifest.json from files already on Cloudflare R2
 * (or from a local folder for the same filenames).
 *
 * Usage:
 *   node scripts/build-rtu-picture-manifest.mjs              # list R2 bucket
 *   node scripts/build-rtu-picture-manifest.mjs --from-folder "C:/path/to/RTU-Pictures"
 *   node scripts/build-rtu-picture-manifest.mjs --dry-run      # print stats only
 *
 * Loads .env.local from project root when present.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildRtuCatalog,
  isImageFileName,
  matchFileToRtu,
  rtuPictureKey,
  shouldPreferPictureFile,
} from './lib/rtu-picture-filename.mjs'
import { isR2Configured, listR2PictureFileNames } from './lib/r2-client.mjs'
import { loadBuildingsJson } from './lib/rtu-gps-validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')

function loadDotEnvLocal() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  let fromFolder = null
  let dryRun = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (!arg.startsWith('-')) fromFolder = arg
  }
  return { fromFolder, dryRun }
}

function collectFromFolder(folderPath) {
  const names = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (/old/i.test(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && isImageFileName(entry.name)) {
        names.push(entry.name)
      }
    }
  }
  walk(folderPath)
  return [...new Set(names)].sort()
}

function sortPictureFiles(files) {
  return [...files].sort((a, b) => {
    const indexA = Number(a.match(/_\((\d+)\)\./)?.[1] ?? a.match(/-(\d+)\./)?.[1] ?? 0)
    const indexB = Number(b.match(/_\((\d+)\)\./)?.[1] ?? b.match(/-(\d+)\./)?.[1] ?? 0)
    if (indexA !== indexB) return indexA - indexB
    return a.localeCompare(b)
  })
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, dryRun } = parseArgs(process.argv)

  let fileNames
  let sourceLabel

  if (fromFolder) {
    if (!existsSync(fromFolder)) {
      console.error(`Folder not found: ${fromFolder}`)
      process.exit(1)
    }
    fileNames = collectFromFolder(fromFolder)
    sourceLabel = `folder ${fromFolder}`
  } else {
    if (!isR2Configured()) {
      if (process.env.CI) {
        console.log('R2 not configured in CI — skipping manifest rebuild from R2.')
        return
      }
      console.error(
        'R2 is not configured. Set credentials in .env.local or pass a local folder:\n' +
          '  node scripts/build-rtu-picture-manifest.mjs --from-folder "C:/Users/Robert/Pictures/RTU-Pictures"',
      )
      process.exit(1)
    }
    fileNames = await listR2PictureFileNames()
    sourceLabel = 'Cloudflare R2 bucket'
  }

  const imageFiles = fileNames.filter(isImageFileName)
  console.log(`Found ${imageFiles.length} image file(s) in ${sourceLabel}`)

  const buildings = loadBuildingsJson(ROOT)
  const catalog = buildRtuCatalog(buildings)

  const entries = {}
  const matched = []
  const unmatched = []
  const slotConflicts = []

  for (const fileName of imageFiles) {
    const result = matchFileToRtu(catalog, fileName)
    if (!result.entry) {
      unmatched.push({ fileName, reason: result.error ?? 'No match' })
      continue
    }

    const key = rtuPictureKey(result.entry.building.address, result.entry.rtu.name)
    const list = entries[key] ?? []
    if (list.includes(fileName)) continue

    const sameIndex = list.find((existing) => {
      const existingIndex = Number(
        existing.match(/_\((\d+)\)\./)?.[1] ?? existing.match(/-(\d+)\./)?.[1] ?? 0,
      )
      return existingIndex === result.pictureIndex && existingIndex > 0
    })
    if (sameIndex) {
      if (shouldPreferPictureFile(fileName, sameIndex)) {
        const idx = list.indexOf(sameIndex)
        list[idx] = fileName
        entries[key] = sortPictureFiles(list)
        slotConflicts.push({
          fileName: sameIndex,
          key,
          index: result.pictureIndex,
          existing: fileName,
          resolution: 'replaced with more explicit filename',
        })
        matched.push({ fileName, key, rtu: result.entry.rtu.name })
      } else {
        slotConflicts.push({ fileName, key, index: result.pictureIndex, existing: sameIndex })
      }
      continue
    }

    list.push(fileName)
    entries[key] = sortPictureFiles(list)
    matched.push({ fileName, key, rtu: result.entry.rtu.name })
  }

  const manifest = { entries }
  const rtuCount = Object.keys(entries).length
  const pictureCount = matched.length

  console.log(`\nMatched ${pictureCount} picture(s) to ${rtuCount} RTU(s)`)
  console.log(`Unmatched: ${unmatched.length}`)
  if (slotConflicts.length) console.log(`Index conflicts (skipped): ${slotConflicts.length}`)

  if (unmatched.length) {
    console.log('\nUnmatched samples (up to 15):')
    for (const row of unmatched.slice(0, 15)) {
      console.log(`  ${row.fileName} — ${row.reason}`)
    }
  }

  if (dryRun) {
    console.log('\nDry run — manifest not written.')
    return
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${MANIFEST_PATH}`)
  console.log('\nNext steps:')
  console.log('  1. git add public/database/rtu-pictures/manifest.json')
  console.log('  2. git commit -m "Add RTU picture manifest for Cloudflare R2"')
  console.log('  3. Upload images to R2 (one-time or when adding new photos):')
  console.log(
    '     node scripts/upload-rtu-pictures-r2.mjs --from-folder "C:/path/to/RTU-Pictures"',
  )
  console.log('  4. git push')
  console.log('  5. Open the live site in incognito and check an RTU photo')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
