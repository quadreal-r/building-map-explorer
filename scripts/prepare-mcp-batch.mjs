import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const n = Number(process.argv[2])
if (!n || n < 1 || n > 11) {
  console.error('Usage: node prepare-mcp-batch.mjs <1-11>')
  process.exit(1)
}
const sql = fs.readFileSync(
  path.join(root, 'supabase', '.seed-chunks', '_batches', `batch-${String(n).padStart(2, '0')}.sql`),
  'utf8',
)
const out = path.join(root, '.tmp-mcp-query.json')
fs.writeFileSync(out, JSON.stringify({ project_id: 'wyiymdtlncperqpwriuk', query: sql, batch: n, bytes: sql.length }))
console.log(JSON.stringify({ batch: n, bytes: sql.length, out }))
