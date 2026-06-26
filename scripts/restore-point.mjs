/**
 * Save / list / restore working-tree snapshots without touching main branch history.
 *
 * Each snapshot is a git commit-tree (orphan) referenced in restore-points.json.
 *
 * Usage:
 *   node scripts/restore-point.mjs save "description"
 *   node scripts/restore-point.mjs list
 *   node scripts/restore-point.mjs show <id>
 *   node scripts/restore-point.mjs restore <id> [--dry-run]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MANIFEST = join(ROOT, 'restore-points.json')

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function loadManifest() {
  try {
    const data = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    if (!Array.isArray(data.points)) return { points: [] }
    return data
  } catch {
    return { points: [] }
  }
}

function saveManifest(data) {
  writeFileSync(MANIFEST, `${JSON.stringify(data, null, 2)}\n`)
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function makeId() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
}

function statusSummary() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  const porcelain = git('status', '--porcelain')
  const changed = porcelain ? porcelain.split('\n').filter(Boolean).length : 0
  return { branch, changed }
}

function save(description) {
  const desc = description?.trim() || 'manual snapshot'
  const { branch, changed } = statusSummary()

  git('add', '-A')
  const tree = git('write-tree')
  git('reset')

  const message = `restore-point: ${desc}`
  const commit = git('commit-tree', tree, '-m', message)
  const id = makeId()
  const tag = `restore/${id.replace(/:/g, '')}-${slugify(desc) || 'snapshot'}`
  try {
    git('tag', '-f', tag, commit)
  } catch {
    /* tag optional */
  }

  const manifest = loadManifest()
  manifest.points.unshift({
    id,
    commit,
    tag,
    description: desc,
    createdAt: new Date().toISOString(),
    branch,
    filesChanged: changed,
  })
  saveManifest(manifest)

  console.log(`Saved restore point: ${id}`)
  console.log(`  commit: ${commit}`)
  console.log(`  tag:    ${tag}`)
  console.log(`  branch: ${branch} (${changed} changed paths)`)
  console.log(`\nRestore with: npm run restore-point -- restore ${id}`)
}

function list() {
  const manifest = loadManifest()
  if (manifest.points.length === 0) {
    console.log('No restore points saved yet.')
    console.log('Create one: npm run restore-point -- save "before big change"')
    return
  }
  for (const point of manifest.points) {
    console.log(`${point.id}  ${point.description}`)
    console.log(`  commit ${point.commit.slice(0, 12)}  branch ${point.branch}  files ${point.filesChanged}`)
  }
}

function findPoint(id) {
  const manifest = loadManifest()
  const point = manifest.points.find((p) => p.id === id || p.id.startsWith(id))
  if (!point) {
    console.error(`Restore point not found: ${id}`)
    process.exit(1)
  }
  return point
}

function show(id) {
  const point = findPoint(id)
  console.log(JSON.stringify(point, null, 2))
  console.log('\nFiles in snapshot:')
  console.log(git('diff-tree', '--no-commit-id', '--name-status', '-r', point.commit))
}

function restore(id, dryRun) {
  const point = findPoint(id)
  if (dryRun) {
    console.log(`Would restore tree from ${point.id} (${point.commit})`)
    console.log(git('diff-tree', '--no-commit-id', '--name-status', '-r', point.commit))
    return
  }

  git('checkout', point.commit, '--', '.')
  console.log(`Restored files from ${point.id} (${point.description})`)
  console.log('Review with: git status')
  console.log('Undo this restore: save a new restore point first, or git checkout -- <file>')
}

const [command, ...rest] = process.argv.slice(2)

switch (command) {
  case 'save':
    save(rest.join(' '))
    break
  case 'list':
    list()
    break
  case 'show':
    show(rest[0])
    break
  case 'restore':
    restore(rest[0], rest.includes('--dry-run'))
    break
  default:
    console.log(`Usage:
  node scripts/restore-point.mjs save "description"
  node scripts/restore-point.mjs list
  node scripts/restore-point.mjs show <id>
  node scripts/restore-point.mjs restore <id> [--dry-run]`)
    process.exit(command ? 1 : 0)
}
