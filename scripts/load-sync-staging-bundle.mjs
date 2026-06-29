/**
 * Read deploy bundle from the sync staging branch (used by sync-deploy CI).
 *
 * Writes lean deploy-bundle.json (no picture base64) and deploy-pictures-N.json
 * chunk files locally so apply-deploy-bundle can process photos without hitting
 * JavaScript's max string size when many chunks accumulated on staging.
 *
 * Env: STAGING_REF — git ref, e.g. origin/bme-sync-staging
 * Usage: node scripts/load-sync-staging-bundle.mjs
 */
import { execSync } from 'node:child_process'
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'

const stagingRef = process.env.STAGING_REF?.trim()
const outPath = 'deploy-bundle.json'
const chunkFilePrefix = 'deploy-pictures-'

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

if (!stagingRef) {
  fail('STAGING_REF is missing. Use Settings → Sync to Cloudflare & GitHub.')
}

function gitShow(path) {
  try {
    return execSync(`git show "${stagingRef}:${path}"`, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }
}

function parsePictureChunk(text, label) {
  try {
    const chunk = JSON.parse(text)
    if (!Array.isArray(chunk)) {
      fail(`${label} is not a JSON array.`)
    }
    return chunk
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, ' ')
    fail(`${label} is not valid JSON (${text.length} bytes; starts with "${preview}").`)
  }
}

function clearLocalPictureChunks() {
  for (const name of readdirSync('.')) {
    if (name.startsWith(chunkFilePrefix) && name.endsWith('.json')) {
      unlinkSync(name)
    }
  }
}

function writePictureChunksFromStaging() {
  clearLocalPictureChunks()
  let pictureCount = 0
  let pictureChunkCount = 0
  let index = 0

  while (true) {
    const stagingPath = `sync/deploy-pictures-${index}.json`
    const chunkText = gitShow(stagingPath)
    if (!chunkText?.trim()) break
    const chunk = parsePictureChunk(chunkText, stagingPath)
    writeFileSync(`${chunkFilePrefix}${index}.json`, `${JSON.stringify(chunk)}\n`)
    pictureCount += chunk.length
    pictureChunkCount += 1
    index += 1
  }

  if (pictureChunkCount === 0) {
    const legacyText = gitShow('sync/deploy-pictures.json')
    if (legacyText?.trim()) {
      const chunk = parsePictureChunk(legacyText, 'sync/deploy-pictures.json')
      writeFileSync(`${chunkFilePrefix}0.json`, `${JSON.stringify(chunk)}\n`)
      pictureCount = chunk.length
      pictureChunkCount = 1
    }
  }

  return { pictureCount, pictureChunkCount }
}

const bundleText = gitShow('sync/deploy-bundle.json')
if (!bundleText) {
  fail(`sync/deploy-bundle.json not found on ${stagingRef}. Re-run Settings → Sync.`)
}

let bundle
try {
  bundle = JSON.parse(bundleText)
} catch {
  fail('sync/deploy-bundle.json is not valid JSON.')
}

if (!bundle.portfolio?.buildings?.length) {
  fail('Deploy bundle is missing portfolio.buildings.')
}

const { pictureCount, pictureChunkCount } = writePictureChunksFromStaging()
bundle.pictures = []
if (pictureChunkCount > 0) {
  bundle.pictureChunkCount = pictureChunkCount
}

writeFileSync(outPath, `${JSON.stringify(bundle)}\n`)
console.log(
  `Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings, ${pictureCount} picture(s) in ${pictureChunkCount} chunk file(s) → ${outPath}`,
)
