/**
 * Read deploy bundle from the sync staging branch (used by sync-deploy CI).
 *
 * Env: STAGING_REF — git ref, e.g. origin/bme-sync-staging
 * Usage: node scripts/load-sync-staging-bundle.mjs
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const stagingRef = process.env.STAGING_REF?.trim()
const outPath = 'deploy-bundle.json'

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

function loadPictureChunks() {
  const pictures = []
  let index = 0
  while (true) {
    const chunkText = gitShow(`sync/deploy-pictures-${index}.json`)
    if (!chunkText?.trim()) break
    pictures.push(...parsePictureChunk(chunkText, `sync/deploy-pictures-${index}.json`))
    index += 1
  }

  let pictureChunkCount = index

  if (pictures.length === 0) {
    const legacyText = gitShow('sync/deploy-pictures.json')
    if (legacyText?.trim()) {
      pictures.push(...parsePictureChunk(legacyText, 'sync/deploy-pictures.json'))
      pictureChunkCount = 1
    }
  }

  return { pictures, pictureChunkCount }
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

const { pictures, pictureChunkCount } = loadPictureChunks()
bundle.pictures = pictures
if (pictureChunkCount > 0) {
  bundle.pictureChunkCount = pictureChunkCount
}

writeFileSync(outPath, `${JSON.stringify(bundle)}\n`)
console.log(
  `Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings, ${bundle.pictures.length} picture(s) → ${outPath}`,
)
