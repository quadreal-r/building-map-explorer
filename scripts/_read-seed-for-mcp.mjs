import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  path.join(__dirname, '..', 'supabase', '.seed-chunks', '_full-seed.sql'),
  path.join(__dirname, '..', 'supabase', 'seed.sql'),
]

for (const file of candidates) {
  if (fs.existsSync(file)) {
    const query = fs.readFileSync(file, 'utf8')
    const out = path.join(__dirname, '..', 'supabase', '.seed-chunks', '_mcp-payload.json')
    fs.writeFileSync(out, JSON.stringify({ project_id: 'wyiymdtlncperqpwriuk', query, source: file, bytes: query.length }))
    console.log(JSON.stringify({ source: file, bytes: query.length, out }))
    process.exit(0)
  }
}
console.error('No seed file found')
process.exit(1)
