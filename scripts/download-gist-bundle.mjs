/**
 * Download deploy-bundle.json from a private GitHub gist (used by sync-deploy CI).
 *
 * Env: GIST_ID, BME_SYNC_PAT
 * Usage: node scripts/download-gist-bundle.mjs [output-path]
 */
import { writeFileSync } from 'node:fs'

const gistId = process.env.GIST_ID?.trim()
const token = process.env.BME_SYNC_PAT?.trim()
const outPath = process.argv[2] ?? 'deploy-bundle.json'

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

if (!token) {
  fail(
    'BME_SYNC_PAT is missing. Add a personal access token with repo, workflow, and gist scopes (same token as in Settings).',
  )
}
if (!gistId) {
  fail(
    'gist_id is required. Use Settings → Sync to Cloudflare & GitHub (do not run sync-deploy manually).',
  )
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

const gistRes = await fetch(`https://api.github.com/gists/${gistId}`, { headers })
if (!gistRes.ok) {
  const body = await gistRes.text().catch(() => '')
  fail(
    `Failed to fetch gist ${gistId} (HTTP ${gistRes.status}). Check BME_SYNC_PAT has Gists read access and matches the token in Settings. ${body.slice(0, 200)}`,
  )
}

const gist = await gistRes.json()
const file = gist.files?.['deploy-bundle.json']
if (!file?.raw_url) {
  fail('deploy-bundle.json not found in gist.')
}

const rawRes = await fetch(file.raw_url, { headers })
if (!rawRes.ok) {
  fail(`Failed to download deploy-bundle.json (HTTP ${rawRes.status}).`)
}

const text = await rawRes.text()
let bundle
try {
  bundle = JSON.parse(text)
} catch {
  fail('Gist file is not valid JSON.')
}

if (!bundle.portfolio?.buildings?.length) {
  fail('Deploy bundle is missing portfolio.buildings.')
}

writeFileSync(outPath, text)
console.log(`Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings → ${outPath}`)
