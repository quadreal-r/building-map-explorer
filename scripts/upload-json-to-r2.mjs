/**
 * Upload portfolio JSON files to the Cloudflare R2 "json" bucket.
 *
 * Usage:
 *   node scripts/upload-json-to-r2.mjs
 *
 * Env: see scripts/lib/r2-client.mjs (R2_JSON_BUCKET defaults to "json")
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  buildSyncMetaFromDataDir,
  SYNC_META_FILE,
  writeSyncMetaFile,
} from './lib/sync-meta.mjs'
import { getR2JsonBucket, isR2JsonConfigured, uploadJsonFileToR2 } from './lib/r2-client.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

export const PORTFOLIO_JSON_FILES = [
  { localPath: join(ROOT, 'supabase', 'data', 'buildings.json'), objectKey: 'buildings.json' },
  { localPath: join(ROOT, 'supabase', 'data', 'utilities.json'), objectKey: 'utilities.json' },
  { localPath: join(ROOT, 'supabase', 'data', 'polygons.json'), objectKey: 'polygons.json' },
  {
    localPath: join(ROOT, 'supabase', 'data', 'rtu-schedule.json'),
    objectKey: 'rtu-schedule.json',
  },
  {
    localPath: join(ROOT, 'supabase', 'data', 'rtu-pricing-rows.json'),
    objectKey: 'rtu-pricing-rows.json',
  },
  {
    localPath: join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json'),
    objectKey: 'manifest.json',
  },
  {
    localPath: join(ROOT, 'supabase', 'data', 'sync-meta.json'),
    objectKey: 'sync-meta.json',
  },
]

const DATA_DIR = join(ROOT, 'supabase', 'data')
const PICS_DIR = join(ROOT, 'public', 'database', 'rtu-pictures')

export async function uploadPortfolioJsonToR2() {
  if (!isR2JsonConfigured()) {
    console.log('R2 JSON bucket not configured — skipping portfolio JSON upload.')
    return { uploaded: 0, skipped: PORTFOLIO_JSON_FILES.length }
  }

  const syncMetaPath = join(DATA_DIR, SYNC_META_FILE)
  if (!existsSync(syncMetaPath)) {
    const meta = buildSyncMetaFromDataDir(DATA_DIR, PICS_DIR, { preserveExportedAt: false })
    writeSyncMetaFile(syncMetaPath, meta)
    console.log(`Wrote ${SYNC_META_FILE} from current data files`)
  }

  const bucket = getR2JsonBucket()
  let uploaded = 0
  let skipped = 0

  for (const { localPath, objectKey } of PORTFOLIO_JSON_FILES) {
    if (!existsSync(localPath)) {
      console.warn(`Skipping missing file: ${localPath}`)
      skipped += 1
      continue
    }
    const body = readFileSync(localPath)
    await uploadJsonFileToR2(objectKey, body)
    uploaded += 1
    console.log(`Uploaded ${objectKey} → r2://${bucket}/${objectKey}`)
  }

  return { uploaded, skipped }
}

async function main() {
  const { uploaded, skipped } = await uploadPortfolioJsonToR2()
  if (uploaded > 0) {
    console.log(`\nDone. Uploaded ${uploaded} JSON file(s) to R2 bucket "${getR2JsonBucket()}".`)
    return
  }
  if (skipped > 0) {
    console.log(`\nDone. No JSON files uploaded (${skipped} skipped).`)
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
