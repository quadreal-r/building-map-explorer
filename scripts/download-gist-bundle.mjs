/**
 * Download deploy-bundle.json from a private GitHub gist (used by sync-deploy CI).
 * Merges optional deploy-pictures.json into the bundle before writing.
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
const bundleFile = gist.files?.['deploy-bundle.json']
if (!bundleFile?.content && !bundleFile?.raw_url) {
  fail('deploy-bundle.json not found in gist.')
}

async function readGistFile(file) {
  if (file.content != null) return file.content
  if (!file.raw_url) return null
  const rawRes = await fetch(file.raw_url, { headers })
  if (!rawRes.ok) return null
  return rawRes.text()
}

const bundleText = await readGistFile(bundleFile)
if (!bundleText) {
  fail('Failed to read deploy-bundle.json from gist.')
}

let bundle
try {
  bundle = JSON.parse(bundleText)
} catch {
  fail('Gist file is not valid JSON.')
}

if (!bundle.portfolio?.buildings?.length) {
  fail('Deploy bundle is missing portfolio.buildings.')
}

const picturesFile = gist.files?.['deploy-pictures.json']
if (picturesFile) {
  const picturesText = await readGistFile(picturesFile)
  if (!picturesText) {
    fail('Failed to read deploy-pictures.json from gist.')
  }
  try {
    bundle.pictures = JSON.parse(picturesText)
  } catch {
    fail('deploy-pictures.json is not valid JSON.')
  }
}

if (!Array.isArray(bundle.pictures)) {
  bundle.pictures = []
}

const merged = `${JSON.stringify(bundle)}\n`
writeFileSync(outPath, merged)
console.log(
  `Deploy bundle OK: ${bundle.portfolio.buildings.length} buildings, ${bundle.pictures.length} picture(s) → ${outPath}`,
)
