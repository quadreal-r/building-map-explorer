/**
 * Prepares seed chunk SQL for MCP execute_sql application.
 * Usage: node scripts/mcp-seed-runner.mjs <chunk-number>
 * Prints JSON { project_id, query } to stdout.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const PROJECT_ID = 'wyiymdtlncperqpwriuk'

const chunkNum = Number(process.argv[2])
if (!chunkNum || chunkNum < 1 || chunkNum > 62) {
  console.error('Usage: node scripts/mcp-seed-runner.mjs <1-62>')
  process.exit(1)
}

const file = path.join(
  root,
  'supabase',
  '.seed-chunks',
  `chunk-${String(chunkNum).padStart(2, '0')}.sql`,
)

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`)
  process.exit(1)
}

const query = fs.readFileSync(file, 'utf8')
process.stdout.write(JSON.stringify({ project_id: PROJECT_ID, query }))
