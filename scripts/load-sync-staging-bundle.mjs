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
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }
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

const picturesText = gitShow('sync/deploy-pictures.json')
if (picturesText?.trim()) {
  try {
    bundle.pictures = JSON.parse(picturesText)
  } catch {
    const preview = picturesText.slice(0, 80).replace(/\s+/g, ' ')
    fail(
      `sync/deploy-pictures.json is not valid JSON (${picturesText.length} bytes; starts with "${preview}").`,
    )
  }
}

if (!Array.isArray(bundle.pictures)) {
  bundle.pictures = []
}

writeFileSync(outPath, `${JSON.stringify(bundle)}\n`)
console.log(
  `Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings, ${bundle.pictures.length} picture(s) → ${outPath}`,
)
