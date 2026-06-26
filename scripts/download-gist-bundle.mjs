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

const publicHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function fetchGist() {
  const authRes = await fetch(`https://api.github.com/gists/${gistId}`, { headers })
  if (authRes.ok) return authRes.json()

  if (authRes.status === 404) {
    const publicRes = await fetch(`https://api.github.com/gists/${gistId}`, { headers: publicHeaders })
    if (publicRes.ok) return publicRes.json()
  }

  const body = await authRes.text().catch(() => '')
  fail(
    `Failed to fetch gist ${gistId} (HTTP ${authRes.status}). ` +
      'If this persists, re-run Settings → Sync. For secret gists, set repo secret BME_SYNC_PAT to the same token as Settings (gist + repo + workflow scopes). ' +
      body.slice(0, 200),
  )
}

const gist = await fetchGist()
const bundleFile = gist.files?.['deploy-bundle.json']
if (!bundleFile?.content && !bundleFile?.raw_url) {
  fail('deploy-bundle.json not found in gist.')
}

async function readGistFile(fileName, file) {
  if (!file) return null

  const rawHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.raw',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (file.raw_url) {
    const rawRes = await fetch(file.raw_url, { headers: rawHeaders, redirect: 'follow' })
    if (rawRes.ok) {
      const text = await rawRes.text()
      if (!file.truncated || text.length >= (file.size ?? 0)) return text
    }
  }

  const apiRawRes = await fetch(
    `https://api.github.com/gists/${gistId}/files/${encodeURIComponent(fileName)}/raw`,
    { headers: rawHeaders, redirect: 'follow' },
  )
  if (apiRawRes.ok) return apiRawRes.text()

  if (file.content != null && file.content !== '' && !file.truncated) {
    return file.content
  }

  if (file.truncated) {
    fail(
      `${fileName} is too large for the gist API preview and the raw download failed. Check BME_SYNC_PAT gist read access, or sync fewer/smaller pictures per run.`,
    )
  }

  return null
}

const bundleText = await readGistFile('deploy-bundle.json', bundleFile)
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
  const picturesText = await readGistFile('deploy-pictures.json', picturesFile)
  if (!picturesText?.trim()) {
    fail('Failed to read deploy-pictures.json from gist.')
  }
  try {
    bundle.pictures = JSON.parse(picturesText)
  } catch {
    const preview = picturesText.slice(0, 80).replace(/\s+/g, ' ')
    fail(
      `deploy-pictures.json is not valid JSON (${picturesText.length} bytes; starts with "${preview}"). The gist file may be truncated — sync fewer or smaller pictures.`,
    )
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
