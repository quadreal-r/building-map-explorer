/**
 * Apply seed chunks sequentially via reading SQL and printing chunk info.
 * Used by agent to drive MCP execute_sql calls.
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

const action = process.argv[2] || 'list'

if (action === 'list') {
  for (const f of files) {
    const sql = fs.readFileSync(path.join(chunksDir, f), 'utf8')
    console.log(`${f}\t${sql.length}`)
  }
} else if (action === 'combined') {
  const parts = files.map((file, i) => {
    let sql = fs.readFileSync(path.join(chunksDir, file), 'utf8')
    if (i > 0) sql = sql.replace(/^BEGIN;\r?\n/, '')
    return sql
  })
  process.stdout.write(parts.join(''))
} else if (action.startsWith('chunk:')) {
  const num = Number(action.split(':')[1])
  const file = `chunk-${String(num).padStart(2, '0')}.sql`
  const sql = fs.readFileSync(path.join(chunksDir, file), 'utf8')
  process.stdout.write(sql)
} else if (action === 'cumulative') {
  const upto = Number(process.argv[3])
  const parts = files.slice(0, upto).map((file, i) => {
    let sql = fs.readFileSync(path.join(chunksDir, file), 'utf8')
    if (i > 0) sql = sql.replace(/^BEGIN;\r?\n/, '')
    return sql
  })
  process.stdout.write(parts.join(''))
}
