import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const PROJECT_ID = 'wyiymdtlncperqpwriuk'

const candidates = [
  path.join(root, 'supabase', '.seed-chunks', '_full-seed.sql'),
  path.join(root, 'supabase', 'seed.sql'),
]

let query = null
let source = null
for (const file of candidates) {
  if (fs.existsSync(file)) {
    query = fs.readFileSync(file, 'utf8')
    source = file
    break
  }
}

if (!query) {
  console.error(JSON.stringify({ success: false, error: 'No seed SQL file found' }))
  process.exit(1)
}

// Write payload for MCP execute_sql (parent agent reads and calls MCP)
const out = path.join(root, 'supabase', '.seed-chunks', '_execute-payload.json')
fs.writeFileSync(out, JSON.stringify({ project_id: PROJECT_ID, query, source, bytes: query.length }))
console.log(JSON.stringify({ success: true, source, bytes: query.length, payload: out }))
