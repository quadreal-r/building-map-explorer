import * as XLSX from 'xlsx'
import { collectUnsyncedChangesSummary } from '@/lib/unsyncedChanges'
import { fetchRemoteSyncMeta } from '@/lib/syncMeta'
import { buildSyncHistorySheetRows, fetchRemoteSyncHistory } from '@/lib/syncHistory'
import { loadRemoteSyncState } from '@/lib/remoteSyncState'
import { parseBulkRtuPictureFileName } from '@/lib/rtuPictureMatch'
import {
  countPendingPicturesNeedingCloudUpload,
  listPendingDeployPictureRows,
  loadRtuPictureManifest,
  parseRtuPictureIndex,
} from '@/lib/rtuPictures'
import { manifestEntryToCloudFileName } from '@/lib/rtuPictureAssignNaming'
import type { PortfolioData } from '@/types/domain'

function splitRtuKey(rtuKey: string): { buildingAddress: string; rtuName: string } {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return { buildingAddress: rtuKey, rtuName: '' }
  return { buildingAddress: rtuKey.slice(0, pipe), rtuName: rtuKey.slice(pipe + 1) }
}

function stampFileName(): string {
  return new Date().toISOString().slice(0, 10)
}

function pictureSlotFromFileName(fileName: string): {
  pictureIndex: number | null
  installYear: number | null
} {
  const bulk = parseBulkRtuPictureFileName(fileName)
  if (bulk) {
    return {
      pictureIndex: bulk.pictureIndex,
      installYear: bulk.installYear ?? null,
    }
  }
  return { pictureIndex: parseRtuPictureIndex(fileName), installYear: null }
}

/** Download Excel: Cloudflare sync-meta + local unsynced items on this browser. */export async function downloadSyncStatusExcel(portfolio: PortfolioData): Promise<void> {
  const [
    cloudMeta,
    cloudHistory,
    manifest,
    unsyncedLines,
    pendingRows,
    pendingNeedingUpload,
    syncState,
  ] = await Promise.all([
    fetchRemoteSyncMeta(),
    fetchRemoteSyncHistory(),
    loadRtuPictureManifest(),
    collectUnsyncedChangesSummary(),
    listPendingDeployPictureRows(),
    countPendingPicturesNeedingCloudUpload(),
    Promise.resolve(loadRemoteSyncState()),
  ])

  const generatedAt = new Date().toISOString()
  const wb = XLSX.utils.book_new()

  const summaryRows: (string | number)[][] = [
    ['Sync status report (this browser)'],
    ['Generated', generatedAt],
    [],
    ['Cloudflare sync-meta', ''],
  ]

  if (cloudMeta) {
    summaryRows.push(['exportedAt', cloudMeta.exportedAt])
    summaryRows.push(['syncedAt', cloudMeta.syncedAt])
    summaryRows.push(['source', cloudMeta.source])
    summaryRows.push(['buildings', cloudMeta.summary.buildingCount])
    summaryRows.push(['RTUs', cloudMeta.summary.rtuCount])
    summaryRows.push(['manifest pictures', cloudMeta.summary.manifestPictureCount])
    summaryRows.push(['pictures uploaded (last sync)', cloudMeta.summary.picturesUploaded])
    summaryRows.push(['pricing rows', cloudMeta.summary.pricingRowCount])
  } else {
    summaryRows.push(['(Cloudflare sync-meta not available)', ''])
  }

  summaryRows.push([])
  summaryRows.push(['This browser', ''])
  summaryRows.push(['Last successful push exportedAt', syncState.lastPushedExportedAt ?? ''])
  summaryRows.push(['Local pictures needing Cloudflare upload', pendingNeedingUpload])
  summaryRows.push([])
  summaryRows.push(['Unsynced summary lines', ''])

  if (unsyncedLines.length) {
    for (const line of unsyncedLines) {
      summaryRows.push([
        line.label,
        line.count != null ? line.count : '',
      ])
    }
  } else {
    summaryRows.push(['(none)', ''])
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary')

  const localUnsyncedHeader = [
    'RTU key',
    'Building',
    'RTU name',
    'Picture index',
    'File name',
    'Status',
  ]
  const localRows = pendingRows.rows.map((row) => {
    const { buildingAddress, rtuName } = splitRtuKey(row.rtuKey)
    return [
      row.rtuKey,
      buildingAddress,
      rtuName,
      row.index,
      row.fileName,
      'Local copy — needs Cloudflare upload',
    ]
  })

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([localUnsyncedHeader, ...localRows]),
    'Local unsynced',
  )

  const manifestHeader = [
    'RTU key',
    'Building',
    'RTU name',
    'Picture index',
    'Install year',
    'Manifest filename',
    'CDN filename',
    'Status',
  ]
  const manifestRows: (string | number)[][] = []
  for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      const cloudFileName = manifestEntryToCloudFileName(fileName, buildingAddress, rtuName)
      const { pictureIndex, installYear } = pictureSlotFromFileName(fileName)
      manifestRows.push([
        rtuKey,
        buildingAddress,
        rtuName,
        pictureIndex ?? '',
        installYear ?? '',
        fileName,
        cloudFileName,
        'Listed in Cloudflare manifest',
      ])
    }
  }
  manifestRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([manifestHeader, ...manifestRows]),
    'Cloudflare manifest',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildSyncHistorySheetRows(cloudHistory)),
    'Sync history',
  )

  XLSX.writeFile(wb, `sync-status-${stampFileName()}.xlsx`)
}
