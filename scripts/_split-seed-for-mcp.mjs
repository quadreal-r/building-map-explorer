import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'supabase', '.seed-chunks', '_full-seed.sql')
const outDir = path.join(root, 'supabase', '.seed-chunks', '_mcp-parts')

const sql = fs.readFileSync(src, 'utf8')
const maxBytes = 80000

fs.mkdirSync(outDir, { recursive: true })

// Strip transaction wrappers; apply TRUNCATE first, then INSERT batches
const lines = sql.split(/\r?\n/)
const parts = []
let current = []
let currentBytes = 0

function flush() {
  if (!current.length) return
  const text = current.join('\n')
  parts.push(text)
  current = []
  currentBytes = 0
}

for (const line of lines) {
  if (line === 'BEGIN;' || line === 'COMMIT;') continue
  const add = (current.length ? 1 : 0) + line.length
  if (currentBytes + add > maxBytes && current.length) flush()
  current.push(line)
  currentBytes += add
}
flush()

parts.forEach((text, i) => {
  const file = path.join(outDir, `part-${String(i + 1).padStart(2, '0')}.sql`)
  fs.writeFileSync(file, text)
})

console.log(JSON.stringify({ parts: parts.length, sizes: parts.map((p) => p.length), outDir }))
