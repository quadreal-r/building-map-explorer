/**
 * Delete RTU pictures on Cloudflare R2 that are not on an allowlist (Excel new_name column).
 *
 * Usage:
 *   node scripts/prune-r2-pictures-by-allowlist.mjs --dry-run
 *   node scripts/prune-r2-pictures-by-allowlist.mjs --yes --mapping "C:/path/renamed_mapping.xlsx"
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'
import {
  deleteR2PicturesByFileNames,
  isR2Configured,
  listR2PictureFileNames,
} from './lib/r2-client.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'

const DEFAULT_MAPPING =
  'C:/Users/Robert/OneDrive - Quadreal Property Group/#OI-Industrial East - @(RTU) Roof Top Units (All Industrial)/RTUs per Building/_RTU-Pictures-All/renamed_mapping_30.06.2026.xlsx'
const REPORT_DIR = join(ROOT, 'reports')

function parseArgs(argv) {
  let mappingPath = DEFAULT_MAPPING
  let dryRun = false
  let yes = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--yes') yes = true
    else if (arg === '--mapping') mappingPath = argv[++i] ?? mappingPath
    else if (!arg.startsWith('-')) mappingPath = arg
  }
  return { mappingPath, dryRun, yes }
}

function loadAllowlist(mappingPath) {
  const wb = XLSX.readFile(mappingPath)
  const sheetName = wb.SheetNames.includes('_rename_mapping')
    ? '_rename_mapping'
    : wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName])
  const allow = new Set()
  for (const row of rows) {
    const name = row.new_name ?? row.newName ?? row['New name']
    if (typeof name === 'string' && name.trim()) allow.add(name.trim())
  }
  return allow
}

async function main() {
  loadDotEnvLocal()
  const { mappingPath, dryRun, yes } = parseArgs(process.argv)

  if (!existsSync(mappingPath)) {
    console.error(`Mapping file not found: ${mappingPath}`)
    process.exit(1)
  }
  if (!isR2Configured()) {
    console.error('R2 is not configured. Set credentials in .env.local')
    process.exit(1)
  }

  const allowlist = loadAllowlist(mappingPath)
  const onR2 = await listR2PictureFileNames()
  const toDelete = onR2.filter((name) => !allowlist.has(name))
  const toKeep = onR2.filter((name) => allowlist.has(name))

  const hyphenRe = /^\d+-RTU-[\w]+-\d+\.(jpe?g|png|webp)$/i
  const hyphenDeletes = toDelete.filter((name) => hyphenRe.test(name))

  console.log(`Mapping: ${mappingPath}`)
  console.log(`Allowlist: ${allowlist.size} file name(s)`)
  console.log(`On R2: ${onR2.length} → keep ${toKeep.length}, delete ${toDelete.length}`)
  console.log(`  (${hyphenDeletes.length} hyphen-style cloud aliases, e.g. 100-RTU-01-1.jpg)`)

  if (!toDelete.length) {
    console.log('\nNothing to delete.')
    return
  }

  if (!yes && !dryRun) {
    console.error('\nRe-run with --dry-run to preview or --yes to delete from R2.')
    process.exit(1)
  }

  if (dryRun) {
    console.log('\nDry run — sample files that would be deleted:')
    for (const name of toDelete.slice(0, 20)) console.log(`  ${name}`)
    if (toDelete.length > 20) console.log(`  … and ${toDelete.length - 20} more`)
    return
  }

  console.log('\nDeleting from R2…')
  const result = await deleteR2PicturesByFileNames(toDelete, {
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) console.log(`  deleted ${done}/${total}`)
    },
  })
  console.log(`\nDone. Removed ${result.deleted} object(s). ${toKeep.length} remain on R2.`)

  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const reportPath = join(REPORT_DIR, `r2-prune-${stamp}.json`)
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mappingPath,
        allowlistSize: allowlist.size,
        kept: toKeep.length,
        deleted: result.deleted,
        deletedFiles: toDelete,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`Report: ${reportPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
