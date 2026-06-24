import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', '.seed-chunks', '_batches')
const n = Number(process.argv[2] || 1)
const file = path.join(dir, `batch-${String(n).padStart(2, '0')}.sql`)
process.stdout.write(fs.readFileSync(file, 'utf8'))
