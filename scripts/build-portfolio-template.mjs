/**
 * Builds public/portfolio-template.html from the legacy single-file HTML export.
 * Run after updating the source HTML: node scripts/build-portfolio-template.mjs [path-to-html]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT = join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Downloads',
  'building_map_explorer_v2026_06_20_3_2.html',
)
const src = process.argv[2] ?? DEFAULT
const out = join(ROOT, 'public', 'portfolio-template.html')

let html = readFileSync(src, 'utf8')
html = html.replace(/const BUILDINGS = \[[\s\S]*?\];/, 'const BUILDINGS = __BUILDINGS__;')
html = html.replace(/const UTILITIES = \[[\s\S]*?\];/, 'const UTILITIES = __UTILITIES__;')
html = html.replace(/const POLYGONS = \[[\s\S]*?\];/, 'const POLYGONS = __POLYGONS__;')
writeFileSync(out, html, 'utf8')
console.log('Wrote', out)
