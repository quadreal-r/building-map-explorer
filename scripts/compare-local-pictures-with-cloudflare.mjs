/**
 * Compare image filenames in a local RTU pictures folder with Cloudflare R2.
 *
 * Usage:
 *   node scripts/compare-local-pictures-with-cloudflare.mjs
 *   node scripts/compare-local-pictures-with-cloudflare.mjs --folder "C:/path/_RTU-Pictures-All"
 *
 * Writes:
 *   reports/local-vs-cloudflare-pictures-YYYY-MM-DD.xlsx
 *   <folder>/Local-vs-Cloudflare-Pictures.xlsx
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { collectManifestFileNames } from './lib/build-manifest-from-files.mjs'
import { getProjectRoot, loadDotEnvLocal } from './lib/load-dotenv-local.mjs'
import { isImageFileName } from './lib/rtu-picture-filename.mjs'
import { isR2Configured, listR2PictureFileNames } from './lib/r2-client.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = getProjectRoot()
const REPORT_DIR = join(ROOT, 'reports')
const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')
const DEFAULT_FOLDER =
  'C:/Users/Robert/OneDrive - Quadreal Property Group/#OI-Industrial East - @(RTU) Roof Top Units (All Industrial)/RTUs per Building/_RTU-Pictures-All'

function parseArgs(argv) {
  let folder = DEFAULT_FOLDER
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--folder') folder = argv[++i] ?? folder
    else if (!argv[i].startsWith('-')) folder = argv[i]
  }
  return { folder }
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function collectLocalImages(folderPath) {
  /** @type {Map<string, { sizeBytes: number, filePath: string, subfolder: string }>} */
  const byName = new Map()

  function walk(dir, subfolder = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (/^old$/i.test(entry.name)) continue
        const nextSub = subfolder ? `${subfolder}/${entry.name}` : entry.name
        walk(full, nextSub)
      } else if (entry.isFile() && isImageFileName(entry.name)) {
        const sizeBytes = statSync(full).size
        const existing = byName.get(entry.name)
        if (!existing || sizeBytes > existing.sizeBytes) {
          byName.set(entry.name, { sizeBytes, filePath: full, subfolder })
        }
      }
    }
  }

  walk(folderPath)
  return byName
}

async function loadCloudflareFileNames() {
  if (isR2Configured()) {
    const names = await listR2PictureFileNames()
    return { names: new Set(names), source: 'R2 API (live bucket listing)' }
  }

  const manifestNames = collectManifestFileNames(MANIFEST_PATH)
  return {
    names: new Set(manifestNames),
    source: 'manifest.json only (R2 credentials not configured — may include files not on CDN)',
  }
}

function compareSets(localByName, cloudNames) {
  const localOnly = []
  const cloudOnly = []
  const both = []

  for (const [fileName, info] of localByName) {
    if (cloudNames.has(fileName)) {
      both.push({ fileName, ...info })
    } else {
      localOnly.push({ fileName, ...info })
    }
  }

  for (const fileName of cloudNames) {
    if (!localByName.has(fileName)) {
      cloudOnly.push({ fileName })
    }
  }

  localOnly.sort((a, b) => a.fileName.localeCompare(b.fileName))
  cloudOnly.sort((a, b) => a.fileName.localeCompare(b.fileName))
  both.sort((a, b) => a.fileName.localeCompare(b.fileName))

  return { localOnly, cloudOnly, both }
}

function sheetFromRows(rows, headers) {
  return XLSX.utils.aoa_to_sheet([headers, ...rows])
}

function buildWorkbook({ folder, cloudSource, totals, localOnly, cloudOnly, both }) {
  const wb = XLSX.utils.book_new()
  const generatedAt = new Date().toISOString()

  const summary = XLSX.utils.aoa_to_sheet([
    ['Local folder vs Cloudflare RTU pictures'],
    ['Generated', generatedAt],
    ['Local folder', folder],
    ['Cloudflare source', cloudSource],
    [],
    ['Metric', 'Count'],
    ['Local image files (unique names)', totals.local],
    ['Cloudflare files', totals.cloud],
    ['On both (same filename)', totals.both],
    ['Local only (not on Cloudflare)', totals.localOnly],
    ['Cloudflare only (not in local folder)', totals.cloudOnly],
  ])
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')

  const comparisonRows = []
  for (const row of both) {
    comparisonRows.push([
      row.fileName,
      'Both',
      row.subfolder ?? '',
      formatBytes(row.sizeBytes),
      row.filePath ?? '',
      'Yes',
      'Yes',
    ])
  }
  for (const row of localOnly) {
    comparisonRows.push([
      row.fileName,
      'Local only',
      row.subfolder ?? '',
      formatBytes(row.sizeBytes),
      row.filePath ?? '',
      'Yes',
      'No',
    ])
  }
  for (const row of cloudOnly) {
    comparisonRows.push([row.fileName, 'Cloudflare only', '', '', '', 'No', 'Yes'])
  }
  comparisonRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(comparisonRows, [
      'Filename',
      'Status',
      'Local subfolder',
      'Local size',
      'Local path',
      'In local folder',
      'On Cloudflare',
    ]),
    'All files',
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      localOnly.map((row) => [
        row.fileName,
        row.subfolder ?? '',
        formatBytes(row.sizeBytes),
        row.filePath ?? '',
      ]),
      ['Filename', 'Subfolder', 'Size', 'Full path'],
    ),
    'Local only',
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      cloudOnly.map((row) => [row.fileName]),
      ['Filename'],
    ),
    'Cloudflare only',
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      both.map((row) => [
        row.fileName,
        row.subfolder ?? '',
        formatBytes(row.sizeBytes),
        row.filePath ?? '',
      ]),
      ['Filename', 'Subfolder', 'Size', 'Full path'],
    ),
    'On both',
  )

  return wb
}

async function main() {
  loadDotEnvLocal()
  const { folder } = parseArgs(process.argv)

  if (!existsSync(folder)) {
    console.error(`Folder not found: ${folder}`)
    process.exit(1)
  }

  console.log(`Scanning local folder:\n  ${folder}`)
  const localByName = collectLocalImages(folder)
  console.log(`  ${localByName.size} unique image filenames`)

  console.log('Loading Cloudflare file list…')
  const { names: cloudNames, source: cloudSource } = await loadCloudflareFileNames()
  console.log(`  ${cloudNames.size} files (${cloudSource})`)

  const { localOnly, cloudOnly, both } = compareSets(localByName, cloudNames)
  const totals = {
    local: localByName.size,
    cloud: cloudNames.size,
    both: both.length,
    localOnly: localOnly.length,
    cloudOnly: cloudOnly.length,
  }

  const wb = buildWorkbook({
    folder,
    cloudSource,
    totals,
    localOnly,
    cloudOnly,
    both,
  })

  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const reportPath = join(REPORT_DIR, `local-vs-cloudflare-pictures-${stamp}.xlsx`)
  const folderPath = join(folder, 'Local-vs-Cloudflare-Pictures.xlsx')

  XLSX.writeFile(wb, reportPath)
  XLSX.writeFile(wb, folderPath)

  const summary = {
    generatedAt: new Date().toISOString(),
    folder,
    cloudSource,
    totals,
    reportPath,
    folderCopyPath: folderPath,
  }
  writeFileSync(
    join(REPORT_DIR, `local-vs-cloudflare-pictures-${stamp}.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  )

  console.log('\nComparison complete:')
  console.log(`  Local only:      ${totals.localOnly}`)
  console.log(`  Cloudflare only: ${totals.cloudOnly}`)
  console.log(`  On both:         ${totals.both}`)
  console.log(`\nExcel:\n  ${reportPath}\n  ${folderPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
