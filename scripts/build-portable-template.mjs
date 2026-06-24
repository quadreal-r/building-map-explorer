/**
 * Builds public/portable-template.html — current React app as a single self-contained file.
 * Save to HTML injects portfolio JSON into this template at download time.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PLACEHOLDER = 'window.__BME_EMBEDDED_PORTFOLIO__=null'
const SETTINGS_PLACEHOLDER = 'window.__BME_EMBEDDED_SETTINGS__=null'

execSync('npx vite build --config vite.config.portable.ts', {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
})

const built = readFileSync(join(ROOT, 'dist-portable', 'index.html'), 'utf8')
if (!built.includes(PLACEHOLDER)) {
  throw new Error(`Built HTML is missing portfolio placeholder: ${PLACEHOLDER}`)
}
if (!built.includes(SETTINGS_PLACEHOLDER)) {
  throw new Error(`Built HTML is missing settings placeholder: ${SETTINGS_PLACEHOLDER}`)
}

const outPublic = join(ROOT, 'public', 'portable-template.html')
writeFileSync(outPublic, built, 'utf8')

const distDir = join(ROOT, 'dist')
mkdirSync(distDir, { recursive: true })
copyFileSync(outPublic, join(distDir, 'portable-template.html'))

console.log('Wrote', outPublic)
