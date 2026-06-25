/**
 * Strip legacy tenant suite markers from supabase/data/buildings.json.
 * Run: node scripts/strip-legacy-suite-markers.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUILDINGS_PATH = join(__dirname, '..', 'supabase', 'data', 'buildings.json')

const SUITE_MARKER_RE = /^(Suite|Unit)\s*#?\s*\d/i

const buildings = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8'))
let removedTenants = 0
let removedRtus = 0

for (const building of buildings) {
  if (Array.isArray(building.tenants) && building.tenants.length) {
    removedTenants += building.tenants.length
    delete building.tenants
  }

  if (!Array.isArray(building.rtus)) continue
  const before = building.rtus.length
  building.rtus = building.rtus.filter((rtu) => !SUITE_MARKER_RE.test(rtu.name ?? ''))
  removedRtus += before - building.rtus.length
}

writeFileSync(BUILDINGS_PATH, `${JSON.stringify(buildings, null, 2)}\n`, 'utf8')
console.log(`Removed ${removedTenants} legacy tenant entries and ${removedRtus} suite/unit RTU markers.`)
