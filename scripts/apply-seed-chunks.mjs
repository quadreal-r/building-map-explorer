/**
 * Applies supabase/seed.sql (or chunked files) via Supabase MCP execute_sql.
 * Run from project root after authenticating the Supabase MCP server.
 *
 * Usage: node scripts/apply-seed-chunks.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const seedPath = path.join(root, 'supabase', 'seed.sql')

if (!fs.existsSync(seedPath)) {
  console.error('Missing supabase/seed.sql — run npm run extract first.')
  process.exit(1)
}

const lines = fs.readFileSync(seedPath, 'utf8').split(/\r?\n/)
const chunkSize = 200
const chunks = []

for (let i = 0; i < lines.length; i += chunkSize) {
  const slice = lines.slice(i, i + chunkSize)
  const sql = (i > 0 ? 'BEGIN;\n' : '') + slice.join('\n')
  chunks.push(sql)
}

const outDir = path.join(root, 'supabase', '.seed-chunks')
fs.mkdirSync(outDir, { recursive: true })
chunks.forEach((sql, index) => {
  fs.writeFileSync(path.join(outDir, `chunk-${String(index + 1).padStart(2, '0')}.sql`), sql)
})

console.log(`Wrote ${chunks.length} chunks to supabase/.seed-chunks/`)
console.log('Apply each file with Supabase SQL editor or MCP execute_sql (project wyiymdtlncperqpwriuk).')
