/**
 * Loads all supabase/.seed-chunks/*.sql via Supabase execute_sql MCP.
 * This file documents the chunk list for manual or agent-driven loading.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chunksDir = path.join(__dirname, '..', 'supabase', '.seed-chunks')

if (!fs.existsSync(chunksDir)) {
  console.error('Run: node scripts/apply-seed-chunks.mjs')
  process.exit(1)
}

const files = fs
  .readdirSync(chunksDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

console.log(`Seed chunks (${files.length}):`)
for (const file of files) {
  const bytes = fs.statSync(path.join(chunksDir, file)).size
  console.log(`  ${file} (${Math.round(bytes / 1024)} KB)`)
}
