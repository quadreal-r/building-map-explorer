/**
 * Clear all RTU picture references from git + Cloudflare JSON (empty manifest).
 * Does not delete R2 image objects — use reset-rtu-pictures-from-folder for that.
 *
 * Usage:
 *   npm run clear-rtu-pictures
 *   npm run clear-rtu-pictures -- --yes
 */
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'
import {
  buildSyncMetaFromDataDir,
  writeSyncMetaFile,
  appendSyncHistoryEntry,
} from './lib/sync-meta.mjs'

const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')
const MANIFEST_PATH = join(PICS_DIR, 'manifest.json')
const HIDDEN_PATH = join(PICS_DIR, 'hidden.json')
const DATA_DIR = join(ROOT, 'supabase', 'data')
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i

function parseArgs(argv) {
  let yes = false
  for (const arg of argv.slice(2)) {
    if (arg === '--yes') yes = true
  }
  return { yes }
}

function removeLocalPictureFiles() {
  if (!existsSync(PICS_DIR)) return 0
  let removed = 0
  for (const name of readdirSync(PICS_DIR)) {
    if (!IMAGE_EXT.test(name)) continue
    unlinkSync(join(PICS_DIR, name))
    removed += 1
  }
  return removed
}

function main() {
  loadDotEnvLocal()
  const { yes } = parseArgs(process.argv)

  if (!yes) {
    console.error('This clears manifest.json, hidden.json, and local picture copies in the repo.')
    console.error('Re-run with --yes to proceed.')
    process.exit(1)
  }

  writeFileSync(MANIFEST_PATH, '{\n  "entries": {}\n}\n', 'utf8')
  writeFileSync(HIDDEN_PATH, '[]\n', 'utf8')
  const localRemoved = removeLocalPictureFiles()

  const meta = buildSyncMetaFromDataDir(DATA_DIR, PICS_DIR, {
    preserveExportedAt: false,
    source: 'manifest-cleared',
  })
  writeSyncMetaFile(join(DATA_DIR, 'sync-meta.json'), meta)
  appendSyncHistoryEntry(DATA_DIR, meta)

  console.log('Cleared local manifest (0 pictures) and hidden.json')
  if (localRemoved) console.log(`Removed ${localRemoved} local image file(s) from ${PICS_DIR}`)
  console.log(`sync-meta manifestPictureCount: ${meta.summary.manifestPictureCount}`)

  const upload = spawnSync(process.execPath, [join(ROOT, 'scripts', 'upload-json-to-r2.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (upload.status !== 0) {
    throw new Error('upload-json-to-r2 failed')
  }

  console.log('\nDone. In the browser: hard-refresh, then use Settings → discard unsynced changes')
  console.log('(or bulk upload only on a fresh tab) to clear IndexedDB copies on this PC.')
  console.log('Then Settings → Upload RTU Pictures in Bulk → Sync to Cloudflare.')
}

main()
