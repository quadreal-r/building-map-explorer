/**
 * Outputs batch SQL files as JSON lines for agent MCP application.
 * Usage: node scripts/list-batches.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', '.seed-chunks', '_batches')
const files = fs.readdirSync(dir).filter((f) => f.startsWith('batch-') && f.endsWith('.sql')).sort()
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')
  console.log(JSON.stringify({ file: f, bytes: sql.length, has_commit: sql.includes('COMMIT;'), has_truncate: sql.includes('TRUNCATE') }))
}
