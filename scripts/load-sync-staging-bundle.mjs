/**
 * Read deploy bundle from the sync staging branch (used by sync-deploy CI).
 *
 * Writes lean deploy-bundle.json (no picture/document base64) and chunk files locally
 * so apply-deploy-bundle can process photos without hitting JavaScript's max string size.
 *
 * Env: STAGING_REF — git ref, e.g. origin/bme-sync-staging
 * Usage: node scripts/load-sync-staging-bundle.mjs
 */
import { execSync } from 'node:child_process'
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'

const stagingRef = process.env.STAGING_REF?.trim()
const outPath = 'deploy-bundle.json'
const pictureChunkFilePrefix = 'deploy-pictures-'
const documentChunkFilePrefix = 'deploy-documents-'

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

function parseChunk(text, label) {
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

function clearLocalChunks(prefix) {
  for (const name of readdirSync('.')) {
    if (name.startsWith(prefix) && name.endsWith('.json')) {
      unlinkSync(name)
    }
  }
}

function writeChunksFromStaging(stagingPrefix, localPrefix) {
  clearLocalChunks(localPrefix)
  let itemCount = 0
  let chunkCount = 0
  let index = 0

  while (true) {
    const stagingPath = `${stagingPrefix}${index}.json`
    const chunkText = gitShow(stagingPath)
    if (!chunkText?.trim()) break
    const chunk = parseChunk(chunkText, stagingPath)
    writeFileSync(`${localPrefix}${index}.json`, `${JSON.stringify(chunk)}\n`)
    itemCount += chunk.length
    chunkCount += 1
    index += 1
  }

  return { itemCount, chunkCount }
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

const pictures = writeChunksFromStaging('sync/deploy-pictures-', pictureChunkFilePrefix)
if (pictures.chunkCount === 0) {
  const legacyText = gitShow('sync/deploy-pictures.json')
  if (legacyText?.trim()) {
    const chunk = parseChunk(legacyText, 'sync/deploy-pictures.json')
    writeFileSync(`${pictureChunkFilePrefix}0.json`, `${JSON.stringify(chunk)}\n`)
    pictures.itemCount = chunk.length
    pictures.chunkCount = 1
  }
}
const documents = writeChunksFromStaging('sync/deploy-documents-', documentChunkFilePrefix)

bundle.pictures = []
bundle.documents = []
if (pictures.chunkCount > 0) {
  bundle.pictureChunkCount = pictures.chunkCount
}
if (documents.chunkCount > 0) {
  bundle.documentChunkCount = documents.chunkCount
}

writeFileSync(outPath, `${JSON.stringify(bundle)}\n`)
console.log(
  `Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings, ` +
    `${pictures.itemCount} picture(s) in ${pictures.chunkCount} chunk file(s), ` +
    `${documents.itemCount} document(s) in ${documents.chunkCount} chunk file(s) → ${outPath}`,
)
