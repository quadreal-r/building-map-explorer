#!/usr/bin/env node
/**
 * Push all local app code to GitHub main (triggers Deploy to GitHub Pages).
 * Map data / IndexedDB pictures: Settings → Sync to Cloudflare & GitHub.
 *
 * Usage:
 *   npm run push-live
 *   npm run push-live -- "fix: remove hide building details toggle"
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXCLUDE_FROM_COMMIT = ['.env.local', 'deploy-bundle.json']

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true })
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', shell: true }).trim()
}

const message =
  process.argv.slice(2).join(' ').trim() || 'chore: push local app build to live site'

run('npm run typecheck')
run('npm run lint')
run('npm run test')

const status = runCapture('git status --porcelain')
if (status) {
  run('git add -A')
  for (const path of EXCLUDE_FROM_COMMIT) {
    try {
      runCapture(`git reset HEAD -- "${path}"`)
    } catch {
      /* not staged */
    }
  }
  const staged = runCapture('git diff --staged --name-only')
  if (staged) {
    const safeMessage = message.replace(/"/g, '\\"')
    run(`git commit -m "${safeMessage}"`)
  } else {
    console.log('Nothing to commit after excluding secrets and deploy-bundle.json.')
  }
} else {
  console.log('No local changes to commit — pushing current branch to main.')
}

run('git pull --rebase origin main')
run('git push origin main')

console.log('\nPushed to main. GitHub Actions → Deploy to GitHub Pages will rebuild the live app.')
console.log('For map data / pictures: Settings → Sync to Cloudflare & GitHub')
