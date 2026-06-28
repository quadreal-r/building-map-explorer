/**
 * Draft documents-manifest.json from RTU-Documents folder filenames.
 *
 * Usage:
 *   npm run build-rtu-documents-manifest
 *   npm run build-rtu-documents-manifest -- --from-folder "C:/path/RTU-Documents"
 *   npm run build-rtu-documents-manifest -- --write
 *   npm run build-rtu-documents-manifest -- --from-folder "C:/path" --write --report
 *
 * Writes:
 *   public/database/rtu-documents/documents-manifest.json  (--write)
 *   reports/rtu-documents-manifest-YYYY-MM-DD.xlsx       (--report)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'
import {
  buildDocumentsManifestFromFileNames,
  collectDocumentFilesFromDir,
  getProjectRoot,
} from './lib/build-documents-manifest-from-files.mjs'
import { loadDotEnvLocal } from './lib/load-dotenv-local.mjs'

const ROOT = getProjectRoot()
const DEFAULT_FOLDER =
  'C:/Users/Robert/OneDrive - Quadreal Property Group/#OI-Industrial East - @(RTU) Roof Top Units (All Industrial)/RTUs per Building/RTU-Documents'
const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-documents', 'documents-manifest.json')
const REPORT_DIR = join(ROOT, 'reports')

function parseArgs(argv) {
  let fromFolder = DEFAULT_FOLDER
  let write = false
  let report = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from-folder') fromFolder = argv[++i] ?? fromFolder
    else if (arg === '--write') write = true
    else if (arg === '--report') report = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/build-rtu-documents-manifest.mjs [options]
  --from-folder <path>  Source folder (default: OneDrive RTU-Documents)
  --write               Write public/database/rtu-documents/documents-manifest.json
  --report              Write reports/rtu-documents-manifest-YYYY-MM-DD.xlsx`)
      process.exit(0)
    }
  }
  return { fromFolder, write, report: report || write }
}

function buildWorkbook(result) {
  const wb = XLSX.utils.book_new()
  const { matched, unmatched, buildingWide, manifest } = result

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['RTU documents manifest draft'],
      ['Total PDF/files scanned', result.documentCount],
      ['RTU keys with documents', result.rtuCount],
      ['File → RTU links created', result.linkedCount],
      ['Unmatched files', unmatched.length],
      ['Building-wide docs (copied to all RTUs at address)', buildingWide.length],
      [],
      ['Next steps'],
      ['1', 'Review Unmatched tab and fix filenames or portfolio'],
      ['2', 'Run with --write to save documents-manifest.json'],
      ['3', 'npm run upload-json-to-r2'],
    ]),
    'Summary',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['RTU key', 'Building', 'RTU name', 'Scope', 'Unit core', 'Filename'],
      ...matched.map((row) => [
        row.rtuKey,
        row.buildingAddress,
        row.rtuName,
        row.scope,
        row.unitCore,
        row.fileName,
      ]),
    ]),
    'Matched',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Filename', 'Reason', 'Doc building label', 'Street #', 'Unit cores', 'Best building guess'],
      ...unmatched.map((row) => [
        row.fileName,
        row.reason,
        row.buildingLabel,
        row.buildingNum,
        row.unitCores,
        row.matchedBuilding,
      ]),
    ]),
    'Unmatched',
  )

  const byRtu = new Map()
  for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
    byRtu.set(rtuKey, files.length)
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['RTU key', 'Document count'],
      ...[...byRtu.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ]),
    'By RTU',
  )

  return wb
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, write, report } = parseArgs(process.argv)

  if (!existsSync(fromFolder)) {
    console.error(`Folder not found: ${fromFolder}`)
    process.exit(1)
  }

  const fileNames = collectDocumentFilesFromDir(fromFolder)
  if (!fileNames.length) {
    console.log(`No document files in ${fromFolder}`)
    return
  }

  console.log(`Scanning ${fileNames.length} file(s) in ${fromFolder}…`)
  const result = buildDocumentsManifestFromFileNames(fileNames, ROOT)

  console.log(
    `Matched ${result.linkedCount} link(s) across ${result.rtuCount} RTU(s); ${result.unmatched.length} unmatched.`,
  )

  if (write) {
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(result.manifest, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${MANIFEST_PATH}`)
  }

  if (report) {
    mkdirSync(REPORT_DIR, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    const reportPath = join(REPORT_DIR, `rtu-documents-manifest-${date}.xlsx`)
    XLSX.writeFile(buildWorkbook(result), reportPath)
    console.log(`Wrote ${reportPath}`)
  }

  if (!write && !report) {
    console.log('\nDry run only. Add --write and/or --report to save outputs.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
