import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ID = 'wyiymdtlncperqpwriuk'
const start = Number(process.argv[2] || 1)
const end = Number(process.argv[3] || 11)

const results = []
for (let i = start; i <= end; i++) {
  const file = path.join(root, 'supabase', '.seed-chunks', '_batches', `batch-${String(i).padStart(2, '0')}.sql`)
  const sql = fs.readFileSync(file, 'utf8')
  const out = path.join(root, '.tmp-mcp-query.json')
  fs.writeFileSync(out, JSON.stringify({ project_id: PROJECT_ID, query: sql, batch: i, bytes: sql.length }))
  results.push({ batch: i, bytes: sql.length, file: path.basename(file), payload: out })
}
console.log(JSON.stringify(results, null, 2))
