/**
 * Wipe RTU pictures on Cloudflare R2, rebuild manifest from a local folder, and re-upload.
 *
 * Usage:
 *   node scripts/reset-rtu-pictures-from-folder.mjs --dry-run --from-folder "C:/path/_RTU-Pictures-All"
 *   node scripts/reset-rtu-pictures-from-folder.mjs --yes --from-folder "C:/path/_RTU-Pictures-All"
 *
 * Steps:
 *   1. Delete all objects in the RTU pictures R2 bucket
 *   2. Reset hidden.json and manifest.json locally
 *   3. Build a fresh manifest from the folder
 *   4. Upload all manifest pictures to R2
 *   5. Upload cloud filename aliases
 *   6. Upload manifest.json (and sync-meta) to the R2 JSON bucket
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  buildManifestFromFileNames,
} from './lib/build-manifest-from-files.mjs'
import { isImageFileName } from './lib/rtu-picture-filename.mjs'
import {
  deleteAllR2PictureObjects,
  isR2Configured,
  listR2PictureFileNames,
} from './lib/r2-client.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'

const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const MANIFEST_PATH = join(PICS_DIR, 'manifest.json')
const HIDDEN_PATH = join(PICS_DIR, 'hidden.json')

const DEFAULT_FOLDER =
  'C:/Users/Robert/OneDrive - Quadreal Property Group/#OI-Industrial East - @(RTU) Roof Top Units (All Industrial)/RTUs per Building/_RTU-Pictures-All'

function parseArgs(argv) {
  let fromFolder = null
  let dryRun = false
  let yes = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--yes') yes = true
    else if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (!arg.startsWith('-')) fromFolder = arg
  }
  return { fromFolder: fromFolder ?? DEFAULT_FOLDER, dryRun, yes }
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

function runNodeScript(scriptName, args) {
  const scriptPath = join(ROOT, 'scripts', scriptName)
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status ?? 'unknown'}`)
  }
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, dryRun, yes } = parseArgs(process.argv)

  if (!existsSync(fromFolder)) {
    console.error(`Folder not found: ${fromFolder}`)
    process.exit(1)
  }

  if (!isR2Configured()) {
    console.error('R2 is not configured. Set credentials in .env.local (see .env.example).')
    process.exit(1)
  }

  const fileNames = collectFromFolder(fromFolder)
  console.log(`Source folder: ${fromFolder}`)
  console.log(`Found ${fileNames.length} image file(s)`)

  const build = buildManifestFromFileNames(fileNames, ROOT)
  console.log(
    `Manifest preview: ${build.pictureCount} picture(s) on ${build.rtuCount} RTU(s); unmatched ${build.unmatched.length}; index conflicts ${build.slotConflicts.length}`,
  )

  if (!yes && !dryRun) {
    console.error('\nThis will DELETE all RTU pictures on Cloudflare R2 and rebuild from scratch.')
    console.error('Re-run with --yes to proceed, or --dry-run to preview only.')
    process.exit(1)
  }

  const beforeCount = (await listR2PictureFileNames()).length
  console.log(`\nR2 bucket currently has ${beforeCount} image file(s)`)

  if (dryRun) {
    console.log('\nDry run — no changes written.')
    console.log(`Would delete ${beforeCount} object(s) from R2`)
    console.log(`Would write manifest with ${build.pictureCount} entries`)
    console.log(`Would upload from ${fromFolder}`)
    return
  }

  console.log('\n1/6 Deleting all objects from RTU pictures R2 bucket…')
  const deleted = await deleteAllR2PictureObjects({
    onProgress: (done, total) => {
      if (done % 500 === 0 || done === total) console.log(`  deleted ${done}/${total}`)
    },
  })
  console.log(`  removed ${deleted.deleted} object(s)`)

  console.log('\n2/6 Resetting hidden.json and manifest.json locally…')
  writeFileSync(HIDDEN_PATH, '[]\n', 'utf8')
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(build.manifest, null, 2)}\n`, 'utf8')
  console.log(`  wrote manifest: ${build.pictureCount} picture(s), ${build.rtuCount} RTU(s)`)

  console.log('\n3/6 Uploading pictures to R2…')
  runNodeScript('upload-rtu-pictures-r2.mjs', ['--from-folder', fromFolder])

  console.log('\n4/6 Uploading cloud filename aliases…')
  runNodeScript('upload-rtu-picture-cloud-aliases.mjs', ['--from-folder', fromFolder])

  console.log('\n5/6 Uploading manifest to R2 JSON bucket…')
  runNodeScript('upload-json-to-r2.mjs', [])

  console.log('\n6/6 Verifying R2 bucket…')
  runNodeScript('sync-rtu-pictures-r2.mjs', ['--verify-cdn'])

  const afterCount = (await listR2PictureFileNames()).length
  console.log(`\nDone. R2 bucket now has ${afterCount} image file(s).`)
  console.log('\nNext: git add public/database/rtu-pictures/manifest.json public/database/rtu-pictures/hidden.json')
  console.log('      git commit && git push && Settings sync (or wait for CI)')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
