#!/usr/bin/env node
/**
 * Push local app code to GitHub main, then trigger Manual deploy on GitHub Actions.
 *
 * Default: commit with [skip ci] (avoids duplicate deploy.yml on push) and runs
 * "Manual deploy (commit, push & Pages)" — R2 JSON, build, RTU picture sync, Pages.
 *
 * Map data / IndexedDB pictures: Settings → Sync to Cloudflare & GitHub.
 *
 * Usage:
 *   npm run push-live
 *   npm run push-live -- "feat: RTU picture count report"
 *   npm run push-live -- --push-only "fix: typo"
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANUAL_DEPLOY_WORKFLOW = 'manual-deploy.yml'
const ACTIONS_URL =
  'https://github.com/quadreal-r/building-map-explorer/actions/workflows/manual-deploy.yml'

const EXCLUDE_FROM_COMMIT = [
  '.env.local',
  'deploy-bundle.json',
  'nogps-list.txt',
  'nogps-not-on-cdn.txt',
]

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true })
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', shell: true }).trim()
}

function tryCapture(cmd) {
  try {
    return runCapture(cmd)
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const flags = new Set()
  const messageParts = []
  for (const arg of argv) {
    if (arg === '--push-only') flags.add('push-only')
    else if (arg.startsWith('-')) flags.add(arg)
    else messageParts.push(arg)
  }
  return {
    pushOnly: flags.has('--push-only'),
    message: messageParts.join(' ').trim() || 'chore: push local app build to live site',
  }
}

function shellQuote(value) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function triggerManualDeploy(note) {
  if (!tryCapture('gh --version')) {
    console.log('\ngh CLI not found — open GitHub Actions and run Manual deploy manually:')
    console.log(ACTIONS_URL)
    return false
  }

  const fields = note ? `-f commit_message=${shellQuote(note)}` : ''
  run(`gh workflow run ${MANUAL_DEPLOY_WORKFLOW} ${fields}`.trim())
  console.log(`\nTriggered Manual deploy (commit, push & Pages).`)
  console.log(`Watch: ${ACTIONS_URL}`)
  return true
}

const { pushOnly, message: rawMessage } = parseArgs(process.argv.slice(2))
const useManualDeploy = !pushOnly
let commitMessage = rawMessage
if (useManualDeploy && !commitMessage.includes('[skip ci]')) {
  commitMessage = `${commitMessage} [skip ci]`
}

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
    run(`git commit -m ${shellQuote(commitMessage)}`)
  } else {
    console.log('Nothing to commit after excluding secrets and local list files.')
  }
} else {
  console.log('No local changes to commit — pushing current branch to main.')
}

run('git pull --rebase origin main')
run('git push origin main')

console.log('\nPushed to main.')
if (useManualDeploy) {
  triggerManualDeploy(rawMessage)
  console.log('\nManual deploy uploads JSON to R2, builds, syncs manifest pictures, and publishes Pages.')
} else {
  console.log('Push-only mode — Deploy to GitHub Pages will run from the push hook.')
}
console.log('For map data / pictures from the app: Settings → Sync to Cloudflare & GitHub')
