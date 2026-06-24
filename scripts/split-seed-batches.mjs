/**
 * Split full seed SQL into batches at complete INSERT statement boundaries.
 * Each batch is a standalone transaction (BEGIN/COMMIT) for separate MCP calls.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.join(__dirname, '..', 'supabase', 'seed.sql')
const outDir = path.join(__dirname, '..', 'supabase', '.seed-chunks', '_batches')

const sql = fs.readFileSync(seedPath, 'utf8')
const lines = sql.split(/\r?\n/)

const maxBatchBytes = 90000
const batches = []
let current = []
let currentBytes = 0
let sawTruncate = false

function flush() {
  if (!current.length) return
  let body = current.join('\n')
  if (!body.includes('BEGIN;')) body = 'BEGIN;\n' + body
  if (!body.includes('COMMIT;')) body = body + '\nCOMMIT;'
  batches.push(body)
  current = []
  currentBytes = 0
}

for (const line of lines) {
  if (line.startsWith('--')) continue
  if (line === 'BEGIN;' || line === 'COMMIT;') continue

  current.push(line)
  currentBytes += line.length + 1

  const isStatementEnd = /\);$/.test(line.trim())
  if (isStatementEnd && currentBytes >= maxBatchBytes) {
    flush()
  }
}

flush()

fs.mkdirSync(outDir, { recursive: true })
batches.forEach((b, i) => {
  const file = path.join(outDir, `batch-${String(i + 1).padStart(2, '0')}.sql`)
  fs.writeFileSync(file, b)
})

console.log(JSON.stringify({ batches: batches.length, sizes: batches.map((b) => b.length) }))
