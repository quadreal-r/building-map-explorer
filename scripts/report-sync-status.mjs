/**
 * Excel report: Cloudflare sync-meta, manifest CDN status, and remaining gaps.
 *
 * Usage:
 *   npm run report-sync-status
 *
 * Writes: reports/sync-status-YYYY-MM-DD.xlsx (+ .json summary)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'
import {
  collectManifestFileNames,
  diffManifestFileNames,
} from './lib/build-manifest-from-files.mjs'
import {
  buildDocumentsManifestFromFileNames,
  collectDocumentFilesFromDir,
  collectDocumentsManifestFileNames,
} from './lib/build-documents-manifest-from-files.mjs'
import { manifestEntryToCloudFileName } from './lib/cloud-picture-filename.mjs'
import { getProjectRoot, loadDotEnvLocal } from './lib/load-dotenv-local.mjs'
import { countManifestPictures } from './lib/portfolio-stats.mjs'
import {
  parseBulkRtuPictureFileName,
  parseStoredRtuPictureFileName,
} from './lib/rtu-picture-match.mjs'
import { isR2Configured, listR2PictureFileNames, listR2DocumentFileNames, getR2DocumentsPublicBaseUrl } from './lib/r2-client.mjs'
import { SYNC_META_FILE, SYNC_HISTORY_FILE } from './lib/sync-meta.mjs'
import { buildSyncHistorySheetRows } from './lib/sync-history-sheet.mjs'

const ROOT = getProjectRoot()
const REPORT_DIR = join(ROOT, 'reports')
const MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-pictures', 'manifest.json')
const DOCUMENTS_MANIFEST_PATH = join(ROOT, 'public', 'database', 'rtu-documents', 'documents-manifest.json')
const DEFAULT_DOCS_FOLDER =
  'C:/Users/Robert/OneDrive - Quadreal Property Group/#OI-Industrial East - @(RTU) Roof Top Units (All Industrial)/RTUs per Building/RTU-Documents'
const LOCAL_SYNC_META_PATH = join(ROOT, 'supabase', 'data', SYNC_META_FILE)
const LOCAL_SYNC_HISTORY_PATH = join(ROOT, 'supabase', 'data', SYNC_HISTORY_FILE)

function normalizeBaseUrl(url) {
  if (!url) return ''
  return url.endsWith('/') ? url : `${url}/`
}

function readJsonFile(path) {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function parsePictureSlot(fileName) {
  const stored = parseStoredRtuPictureFileName(fileName)
  if (stored) {
    return { pictureIndex: stored.pictureIndex, installYear: null }
  }
  const bulk = parseBulkRtuPictureFileName(fileName)
  if (bulk) {
    return {
      pictureIndex: bulk.pictureIndex,
      installYear: bulk.installYear ?? null,
    }
  }
  return { pictureIndex: null, installYear: null }
}

function splitRtuKey(rtuKey) {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return { buildingAddress: rtuKey, rtuName: '' }
  return { buildingAddress: rtuKey.slice(0, pipe), rtuName: rtuKey.slice(pipe + 1) }
}

async function verifyOnCdn(fileNames, cdnBase, concurrency = 32) {
  const onCdn = new Set()
  const missing = []
  const queue = [...fileNames]

  async function worker() {
    while (queue.length) {
      const fileName = queue.shift()
      if (!fileName) continue
      const url = `${cdnBase}${encodeURIComponent(fileName)}`
      try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
        if (response.ok) onCdn.add(fileName)
        else missing.push(fileName)
      } catch {
        missing.push(fileName)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { onCdn, missing }
}

function buildPictureRows(manifest, cdnStatusByFile) {
  const rows = []
  for (const [rtuKey, files] of Object.entries(manifest?.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      const cloudFileName = manifestEntryToCloudFileName(fileName, buildingAddress, rtuName)
      const onCdn =
        Boolean(cdnStatusByFile.get(cloudFileName)) || Boolean(cdnStatusByFile.get(fileName))
      const { pictureIndex, installYear } = parsePictureSlot(fileName)
      rows.push({
        rtuKey,
        buildingAddress,
        rtuName,
        pictureIndex,
        installYear,
        manifestFileName: fileName,
        cloudFileName,
        syncStatus: onCdn ? 'Synced on CDN' : 'Missing from CDN',
      })
    }
  }
  rows.sort((a, b) => {
    const keyCmp = a.rtuKey.localeCompare(b.rtuKey)
    if (keyCmp !== 0) return keyCmp
    return (a.pictureIndex ?? 0) - (b.pictureIndex ?? 0)
  })
  return rows
}

function buildDocumentRows(manifest, cdnStatusByFile) {
  const rows = []
  for (const [rtuKey, files] of Object.entries(manifest?.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      const onCdn = Boolean(cdnStatusByFile.get(fileName))
      rows.push({
        rtuKey,
        buildingAddress,
        rtuName,
        fileName,
        syncStatus: onCdn ? 'Synced on CDN' : 'Missing from CDN',
      })
    }
  }
  rows.sort((a, b) => a.rtuKey.localeCompare(b.rtuKey) || a.fileName.localeCompare(b.fileName))
  return rows
}

function buildWorkbook({
  generatedAt,
  cloudSyncMeta,
  localSyncMeta,
  syncHistory,
  pictureRows,
  manifestDiff,
  cdnBase,
  jsonBase,
  documentRows = [],
  documentDraft = null,
  documentsManifestDiff = { added: [], removed: [] },
  docsCdnBase = '',
}) {
  const wb = XLSX.utils.book_new()
  const synced = pictureRows.filter((row) => row.syncStatus === 'Synced on CDN')
  const missing = pictureRows.filter((row) => row.syncStatus === 'Missing from CDN')
  const docsSynced = documentRows.filter((row) => row.syncStatus === 'Synced on CDN')
  const docsMissing = documentRows.filter((row) => row.syncStatus === 'Missing from CDN')

  const summaryRows = [
    ['RTU picture sync status report'],
    ['Generated', generatedAt],
    ['Cloudflare JSON base', jsonBase || '(not configured)'],
    ['Cloudflare pictures CDN', cdnBase || '(not configured)'],
    [],
    ['Metric', 'Value'],
    ['Pictures in Cloudflare manifest', pictureRows.length],
    ['Synced on CDN', synced.length],
    ['Missing from CDN (remaining unsync)', missing.length],
    ['GitHub-only manifest files', manifestDiff.removed.length],
    ['Cloudflare-only manifest files', manifestDiff.added.length],
    [],
    ['RTU documents (rtu-documents bucket)'],
    ['Documents CDN base', docsCdnBase || '(not configured)'],
    ['Documents in manifest', documentRows.length],
    ['Documents synced on CDN', docsSynced.length],
    ['Documents missing from CDN', docsMissing.length],
    ['GitHub-only document manifest files', documentsManifestDiff.removed.length],
    ['Cloudflare-only document manifest files', documentsManifestDiff.added.length],
  ]

  if (documentDraft) {
    summaryRows.push(
      ['Folder draft: files scanned', documentDraft.documentCount],
      ['Folder draft: matched links', documentDraft.linkedCount],
      ['Folder draft: RTU keys', documentDraft.rtuCount],
      ['Folder draft: unmatched files', documentDraft.unmatched.length],
    )
  }

  summaryRows.push([])

  if (cloudSyncMeta) {
    summaryRows.push(['Cloudflare sync-meta', ''])
    summaryRows.push(['exportedAt', cloudSyncMeta.exportedAt ?? ''])
    summaryRows.push(['syncedAt', cloudSyncMeta.syncedAt ?? ''])
    summaryRows.push(['source', cloudSyncMeta.source ?? ''])
    const s = cloudSyncMeta.summary ?? {}
    summaryRows.push(['buildings', s.buildingCount ?? ''])
    summaryRows.push(['RTUs', s.rtuCount ?? ''])
    summaryRows.push(['manifest pictures', s.manifestPictureCount ?? ''])
    summaryRows.push(['pictures uploaded last sync', s.picturesUploaded ?? ''])
    if (s.picturesAdded != null && s.picturesAdded > 0) {
      summaryRows.push(['pictures added (manifest)', s.picturesAdded])
    }
    if (s.picturesRemoved != null && s.picturesRemoved > 0) {
      summaryRows.push(['pictures removed (manifest)', s.picturesRemoved])
    }
    if (s.picturesHidden != null && s.picturesHidden > 0) {
      summaryRows.push(['pictures hidden last sync', s.picturesHidden])
    }
    if (s.pictureChunkCount != null && s.pictureChunkCount > 0) {
      summaryRows.push(['picture upload batches last sync', s.pictureChunkCount])
    }
    if (s.buildVersionLabel) {
      summaryRows.push(['app build on live (repo)', s.buildVersionLabel])
    }
    if (s.clientBuildVersionLabel) {
      summaryRows.push(['app build when exported', s.clientBuildVersionLabel])
    }
    summaryRows.push(['pricing rows', s.pricingRowCount ?? ''])
    summaryRows.push(['schedule replacement years', s.scheduleYearCount ?? ''])
    summaryRows.push(['schedule notes', s.scheduleNoteCount ?? ''])
  }

  if (localSyncMeta) {
    summaryRows.push([])
    summaryRows.push(['Local sync-meta (git copy)', ''])
    summaryRows.push(['exportedAt', localSyncMeta.exportedAt ?? ''])
    summaryRows.push(['syncedAt', localSyncMeta.syncedAt ?? ''])
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary')

  const pictureHeader = [
    'RTU key',
    'Building',
    'RTU name',
    'Picture index',
    'Install year',
    'Manifest filename',
    'CDN filename',
    'CDN status',
  ]
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      pictureHeader,
      ...synced.map((row) => [
        row.rtuKey,
        row.buildingAddress,
        row.rtuName,
        row.pictureIndex ?? '',
        row.installYear ?? '',
        row.manifestFileName,
        row.cloudFileName,
        row.syncStatus,
      ]),
    ]),
    'Synced on CDN',
  )

  const missingPictureHeader = [
    'RTU key',
    'Building',
    'RTU name',
    'Picture index',
    'Install year',
    'Manifest filename',
    'Filename',
    'CDN status',
  ]
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      missingPictureHeader,
      ...missing.map((row) => [
        row.rtuKey,
        row.buildingAddress,
        row.rtuName,
        row.pictureIndex ?? '',
        row.installYear ?? '',
        row.manifestFileName,
        row.manifestFileName,
        row.syncStatus,
      ]),
    ]),
    'Missing from CDN',
  )

  if (manifestDiff.removed.length || manifestDiff.added.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Filename', 'In GitHub manifest', 'In Cloudflare manifest'],
        ...manifestDiff.removed.map((name) => [name, 'Yes', 'No']),
        ...manifestDiff.added.map((name) => [name, 'No', 'Yes']),
      ]),
      'Manifest diff',
    )
  }

  const byRtu = new Map()
  for (const row of pictureRows) {
    const entry = byRtu.get(row.rtuKey) ?? { synced: 0, missing: 0 }
    if (row.syncStatus === 'Synced on CDN') entry.synced += 1
    else entry.missing += 1
    byRtu.set(row.rtuKey, entry)
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['RTU key', 'Synced on CDN', 'Missing from CDN'],
      ...[...byRtu.entries()]
        .sort((a, b) => b[1].missing - a[1].missing || a[0].localeCompare(b[0]))
        .map(([rtuKey, counts]) => [rtuKey, counts.synced, counts.missing]),
    ]),
    'By RTU',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildSyncHistorySheetRows(syncHistory)),
    'Sync history',
  )

  if (documentRows.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['RTU key', 'Building', 'RTU name', 'Filename', 'CDN status'],
        ...documentRows.map((row) => [
          row.rtuKey,
          row.buildingAddress,
          row.rtuName,
          row.fileName,
          row.syncStatus,
        ]),
      ]),
      'RTU documents',
    )
  }

  if (documentDraft?.unmatched?.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Filename', 'Reason', 'Doc building label', 'Street #', 'Unit cores'],
        ...documentDraft.unmatched.map((row) => [
          row.fileName,
          row.reason,
          row.buildingLabel,
          row.buildingNum,
          row.unitCores,
        ]),
      ]),
      'Doc draft unmatched',
    )
  }

  if (documentsManifestDiff.removed.length || documentsManifestDiff.added.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Filename', 'In GitHub manifest', 'In Cloudflare manifest'],
        ...documentsManifestDiff.removed.map((name) => [name, 'Yes', 'No']),
        ...documentsManifestDiff.added.map((name) => [name, 'No', 'Yes']),
      ]),
      'Documents manifest diff',
    )
  }

  return wb
}

async function main() {
  loadDotEnvLocal()
  const jsonBase = normalizeBaseUrl(process.env.VITE_JSON_DATA_BASE_URL)
  const cdnBase = normalizeBaseUrl(process.env.VITE_RTU_PICTURES_BASE_URL)

  const githubManifest = readJsonFile(MANIFEST_PATH) ?? { entries: {} }
  const localSyncMeta = readJsonFile(LOCAL_SYNC_META_PATH)
  const localSyncHistory = readJsonFile(LOCAL_SYNC_HISTORY_PATH)
  const cloudManifest = jsonBase ? await fetchJson(`${jsonBase}manifest.json`) : null
  const cloudSyncMeta = jsonBase ? await fetchJson(`${jsonBase}sync-meta.json`) : null
  const cloudSyncHistory = jsonBase ? await fetchJson(`${jsonBase}${SYNC_HISTORY_FILE}`) : null
  const syncHistory = cloudSyncHistory ?? localSyncHistory

  const authoritativeManifest = cloudManifest ?? githubManifest

  console.log('Building picture list from Cloudflare manifest…')
  const allCloudNames = new Set()
  for (const [rtuKey, files] of Object.entries(authoritativeManifest.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      const cloudFileName = manifestEntryToCloudFileName(fileName, buildingAddress, rtuName)
      allCloudNames.add(cloudFileName)
      allCloudNames.add(fileName)
    }
  }

  const cdnStatusByFile = new Map()
  let onCdnSet = new Set()
  if (isR2Configured()) {
    try {
      console.log('Listing R2 bucket…')
      const listed = await listR2PictureFileNames()
      onCdnSet = new Set(listed)
    } catch (error) {
      console.warn(`R2 list failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (!onCdnSet.size && cdnBase) {
    console.log(`Verifying ${allCloudNames.size} filenames on CDN (HEAD)…`)
    const { onCdn } = await verifyOnCdn([...allCloudNames], cdnBase)
    onCdnSet = onCdn
  }

  for (const name of allCloudNames) {
    cdnStatusByFile.set(name, onCdnSet.has(name))
  }

  const pictureRows = buildPictureRows(authoritativeManifest, cdnStatusByFile)

  const githubNames = collectManifestFileNames(githubManifest)
  const cloudNames = collectManifestFileNames(authoritativeManifest)
  const manifestDiff = diffManifestFileNames(githubNames, cloudNames)

  const docsCdnBase = normalizeBaseUrl(getR2DocumentsPublicBaseUrl())
  const githubDocumentsManifest = readJsonFile(DOCUMENTS_MANIFEST_PATH) ?? { entries: {} }
  const cloudDocumentsManifest = jsonBase
    ? await fetchJson(`${jsonBase}documents-manifest.json`)
    : null
  const authoritativeDocumentsManifest = cloudDocumentsManifest ?? githubDocumentsManifest

  let documentDraft = null
  if (existsSync(DEFAULT_DOCS_FOLDER)) {
    const draftFiles = collectDocumentFilesFromDir(DEFAULT_DOCS_FOLDER)
    if (draftFiles.length) {
      console.log(`Drafting documents manifest from ${draftFiles.length} folder file(s)…`)
      documentDraft = buildDocumentsManifestFromFileNames(draftFiles, ROOT)
    }
  }

  const allDocNames = new Set(collectDocumentsManifestFileNames(authoritativeDocumentsManifest))
  let docsOnCdnSet = new Set()
  if (isR2Configured()) {
    try {
      console.log('Listing R2 documents bucket…')
      docsOnCdnSet = new Set(await listR2DocumentFileNames())
    } catch (error) {
      console.warn(`R2 documents list failed: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (!docsOnCdnSet.size && docsCdnBase && allDocNames.size) {
    console.log(`Verifying ${allDocNames.size} document filenames on CDN (HEAD)…`)
    const { onCdn } = await verifyOnCdn([...allDocNames], docsCdnBase)
    docsOnCdnSet = onCdn
  }
  const docsCdnStatusByFile = new Map(
    [...allDocNames].map((name) => [name, docsOnCdnSet.has(name)]),
  )
  const documentRows = buildDocumentRows(authoritativeDocumentsManifest, docsCdnStatusByFile)

  const githubDocNames = collectDocumentsManifestFileNames(githubDocumentsManifest)
  const cloudDocNames = collectDocumentsManifestFileNames(authoritativeDocumentsManifest)
  const documentsManifestDiff = diffManifestFileNames(githubDocNames, cloudDocNames)

  const generatedAt = new Date().toISOString()
  const stamp = generatedAt.slice(0, 10)
  mkdirSync(REPORT_DIR, { recursive: true })

  const wb = buildWorkbook({
    generatedAt,
    cloudSyncMeta,
    localSyncMeta,
    syncHistory,
    pictureRows,
    manifestDiff,
    cdnBase,
    jsonBase,
    documentRows,
    documentDraft,
    documentsManifestDiff,
    docsCdnBase,
  })

  const xlsxPath = join(REPORT_DIR, `sync-status-${stamp}.xlsx`)
  XLSX.writeFile(wb, xlsxPath)

  const jsonSummary = {
    generatedAt,
    cloudSyncMeta,
    localSyncMeta,
    syncHistoryEntryCount: syncHistory?.entries?.length ?? 0,
    totals: {
      manifestPictures: pictureRows.length,
      syncedOnCdn: pictureRows.filter((row) => row.syncStatus === 'Synced on CDN').length,
      missingFromCdn: pictureRows.filter((row) => row.syncStatus === 'Missing from CDN').length,
      githubManifestPictures: countManifestPictures(githubManifest),
      cloudManifestPictures: countManifestPictures(authoritativeManifest),
      manifestDocuments: documentRows.length,
      documentsSyncedOnCdn: documentRows.filter((row) => row.syncStatus === 'Synced on CDN').length,
      documentsMissingFromCdn: documentRows.filter((row) => row.syncStatus === 'Missing from CDN').length,
    },
    missingFromCdn: pictureRows
      .filter((row) => row.syncStatus === 'Missing from CDN')
      .map((row) => ({
        rtuKey: row.rtuKey,
        cloudFileName: row.cloudFileName,
      })),
  }
  const jsonPath = join(REPORT_DIR, `sync-status-${stamp}.json`)
  writeFileSync(jsonPath, `${JSON.stringify(jsonSummary, null, 2)}\n`, 'utf8')

  console.log(`\nReport written:`)
  console.log(`  ${xlsxPath}`)
  console.log(`  ${jsonPath}`)
  console.log(`\nSynced on CDN: ${jsonSummary.totals.syncedOnCdn}`)
  console.log(`Missing from CDN: ${jsonSummary.totals.missingFromCdn}`)
  if (documentDraft) {
    console.log(
      `\nDocuments folder draft: ${documentDraft.linkedCount} link(s), ${documentDraft.unmatched.length} unmatched`,
    )
  }
  if (documentRows.length) {
    console.log(`Documents in manifest: ${jsonSummary.totals.manifestDocuments}`)
    console.log(`Documents synced on CDN: ${jsonSummary.totals.documentsSyncedOnCdn}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
