/**
 * Concatenate seed chunks into one SQL transaction for MCP execute_sql.
 * Strips redundant BEGIN; from chunks 2..N, keeps COMMIT from final chunk.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chunksDir = path.join(__dirname, '..', 'supabase', '.seed-chunks')

const files = fs
  .readdirSync(chunksDir)
  .filter((f) => /^chunk-\d+\.sql$/.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

const parts = files.map((file, i) => {
  let sql = fs.readFileSync(path.join(chunksDir, file), 'utf8')
  if (i > 0) sql = sql.replace(/^BEGIN;\r?\n/, '')
  return sql
})

const full = parts.join('')
const out = path.join(chunksDir, '_full-seed.sql')
fs.writeFileSync(out, full)
console.log(JSON.stringify({ chunks: files.length, bytes: full.length, out }))
