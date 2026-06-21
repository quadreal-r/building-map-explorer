import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(
  join(process.env.USERPROFILE ?? '', 'Downloads', 'building_map_explorer_v2026_06_20_3.html'),
  'utf8',
)
const start = html.indexOf("@import url('https://fonts.googleapis.com")
const end = html.indexOf('</style>', start)
const css = html.slice(start, end)
mkdirSync(join(root, 'src/styles'), { recursive: true })
writeFileSync(join(root, 'src/styles/legacy.css'), css)
console.log('CSS bytes:', css.length)
