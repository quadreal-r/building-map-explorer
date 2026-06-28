import * as XLSX from 'xlsx'
import { collectUnsyncedChangesSummary } from '@/lib/unsyncedChanges'
import {
  isDeployDataDirtyLocally,
  portfolioSyncFingerprint,
  pricingSyncFingerprint,
  readPricingSnapshotFromStorage,
  readScheduleSnapshotFromStorage,
  scheduleSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import { loadStoredPortfolio, isPortfolioDirtyLocally } from '@/hooks/usePortfolioData'
import { fetchRemoteSyncMeta } from '@/lib/syncMeta'
import { buildSyncHistorySheetRows, fetchSyncHistory } from '@/lib/syncHistory'
import { loadRemoteSyncState } from '@/lib/remoteSyncState'
import { parseBulkRtuPictureFileName } from '@/lib/rtuPictureMatch'
import {
  countPendingPicturesNeedingCloudUpload,
  listPendingDeployPictureRows,
  loadRtuPictureManifest,
  parseRtuPictureIndex,
} from '@/lib/rtuPictures'
import { manifestEntryToCloudFileName } from '@/lib/rtuPictureAssignNaming'

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

function fingerprintStatus(current: string | null, lastPushed: string | null): string {
  if (!current) return 'n/a'
  if (!lastPushed) return 'never pushed from this browser'
  return current === lastPushed ? 'matches last push' : 'differs from last push'
}

/** Download Excel: Cloudflare sync-meta + sync history + local unsynced items on this browser. */
export async function downloadSyncStatusExcel(): Promise<void> {
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
    fetchSyncHistory(),
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
    if (cloudMeta.summary.pictureChunkCount != null && cloudMeta.summary.pictureChunkCount > 0) {
      summaryRows.push(['picture upload batches (last sync)', cloudMeta.summary.pictureChunkCount])
    }
    summaryRows.push(['pricing rows', cloudMeta.summary.pricingRowCount])
    summaryRows.push(['schedule replacement years', cloudMeta.summary.scheduleYearCount])
    summaryRows.push(['schedule notes', cloudMeta.summary.scheduleNoteCount])
  } else {
    summaryRows.push(['(Cloudflare sync-meta not available)', ''])
  }

  summaryRows.push([])
  summaryRows.push(['This browser', ''])
  summaryRows.push(['Last successful push exportedAt', syncState.lastPushedExportedAt ?? ''])
  summaryRows.push(['Portfolio dirty (localStorage)', isPortfolioDirtyLocally() ? 'yes' : 'no'])
  summaryRows.push(['Schedule/pricing dirty', isDeployDataDirtyLocally() ? 'yes' : 'no'])
  summaryRows.push(['Local pictures needing Cloudflare upload', pendingNeedingUpload])

  const storedPortfolio = loadStoredPortfolio()
  const scheduleSnapshot = readScheduleSnapshotFromStorage()
  const pricingSnapshot = readPricingSnapshotFromStorage()
  if (storedPortfolio) {
    summaryRows.push([
      'Portfolio vs last push',
      fingerprintStatus(
        portfolioSyncFingerprint(storedPortfolio),
        syncState.lastPushedPortfolioFingerprint,
      ),
    ])
  }
  if (scheduleSnapshot) {
    summaryRows.push([
      'RTU schedule vs last push',
      fingerprintStatus(
        scheduleSyncFingerprint(scheduleSnapshot),
        syncState.lastPushedScheduleFingerprint,
      ),
    ])
  }
  if (pricingSnapshot) {
    summaryRows.push([
      'RTU pricing vs last push',
      fingerprintStatus(
        pricingSyncFingerprint(pricingSnapshot),
        syncState.lastPushedPricingFingerprint,
      ),
    ])
  }

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
