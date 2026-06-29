import * as XLSX from 'xlsx'
import { collectUnsyncedChangesSummary } from '@/lib/unsyncedChanges'
import { BUILD_VERSION_LABEL } from '@/generated/buildVersion'
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
import {
  countPendingPicturesNeedingCloudUpload,
  listPendingDeployPictureRows,
  loadRtuPictureManifest,
} from '@/lib/rtuPictures'
import { manifestEntryToCloudFileName } from '@/lib/rtuPictureAssignNaming'
import {
  buildPictureCdnRows,
  PICTURE_CDN_HEADER,
  pictureCdnRowToSheetRow,
  verifyRtuPicturesOnCdn,
} from '@/lib/rtuPictureCdnStatus'
import type { SyncMetaSummary } from '@/types/syncMeta'

function splitRtuKey(rtuKey: string): { buildingAddress: string; rtuName: string } {
  const pipe = rtuKey.indexOf('|')
  if (pipe < 0) return { buildingAddress: rtuKey, rtuName: '' }
  return { buildingAddress: rtuKey.slice(0, pipe), rtuName: rtuKey.slice(pipe + 1) }
}

function stampFileName(): string {
  return new Date().toISOString().slice(0, 10)
}

function fingerprintStatus(current: string | null, lastPushed: string | null): string {
  if (!current) return 'n/a'
  if (!lastPushed) return 'never pushed from this browser'
  return current === lastPushed ? 'matches last push' : 'differs from last push'
}

function appendSyncMetaDetailRows(
  rows: (string | number)[][],
  summary: SyncMetaSummary,
): void {
  rows.push(['buildings', summary.buildingCount])
  rows.push(['RTUs', summary.rtuCount])
  rows.push(['manifest pictures', summary.manifestPictureCount])
  rows.push(['pictures uploaded (last sync)', summary.picturesUploaded])
  if (summary.picturesAdded != null && summary.picturesAdded > 0) {
    rows.push(['pictures added (manifest)', summary.picturesAdded])
  }
  if (summary.picturesRemoved != null && summary.picturesRemoved > 0) {
    rows.push(['pictures removed (manifest)', summary.picturesRemoved])
  }
  if (summary.picturesHidden != null && summary.picturesHidden > 0) {
    rows.push(['pictures hidden (last sync)', summary.picturesHidden])
  }
  if (summary.pictureChunkCount != null && summary.pictureChunkCount > 0) {
    rows.push(['picture upload batches (last sync)', summary.pictureChunkCount])
  }
  if (summary.buildVersionLabel) {
    rows.push(['app build on live (repo)', summary.buildVersionLabel])
  }
  if (summary.clientBuildVersionLabel) {
    rows.push(['app build when exported', summary.clientBuildVersionLabel])
  }
  rows.push(['pricing rows', summary.pricingRowCount])
  rows.push(['schedule replacement years', summary.scheduleYearCount])
  rows.push(['schedule notes', summary.scheduleNoteCount])
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
    appendSyncMetaDetailRows(summaryRows, cloudMeta.summary)
  } else {
    summaryRows.push(['(Cloudflare sync-meta not available)', ''])
  }

  summaryRows.push([])
  summaryRows.push(['This browser', ''])
  summaryRows.push(['app build (running now)', BUILD_VERSION_LABEL])
  if (
    cloudMeta?.summary.buildVersionLabel &&
    cloudMeta.summary.buildVersionLabel !== BUILD_VERSION_LABEL
  ) {
    summaryRows.push([
      'app build mismatch',
      `Live may show older UI — run npm run push-live, then Settings sync`,
    ])
  }
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

  const cloudFileNames = new Set<string>()
  for (const [rtuKey, files] of Object.entries(manifest.entries ?? {})) {
    const { buildingAddress, rtuName } = splitRtuKey(rtuKey)
    for (const fileName of files) {
      cloudFileNames.add(fileName)
      cloudFileNames.add(manifestEntryToCloudFileName(fileName, buildingAddress, rtuName))
    }
  }
  const cdnStatusByFile = await verifyRtuPicturesOnCdn(cloudFileNames)
  const pictureRows = buildPictureCdnRows(manifest, cdnStatusByFile)
  const syncedOnCdn = pictureRows.filter((row) => row.cdnStatus === 'On CDN')
  const missingFromCdn = pictureRows.filter((row) => row.cdnStatus === 'Missing from CDN')

  summaryRows.push([])
  summaryRows.push(['CDN picture check (HEAD)', ''])
  summaryRows.push(['Pictures on CDN', syncedOnCdn.length])
  summaryRows.push(['Pictures missing from CDN', missingFromCdn.length])

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

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...PICTURE_CDN_HEADER],
      ...syncedOnCdn.map(pictureCdnRowToSheetRow),
    ]),
    'Synced on CDN',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...PICTURE_CDN_HEADER],
      ...missingFromCdn.map(pictureCdnRowToSheetRow),
    ]),
    'Missing from CDN',
  )

  const byRtu = new Map<string, { synced: number; missing: number }>()
  for (const row of pictureRows) {
    const entry = byRtu.get(row.rtuKey) ?? { synced: 0, missing: 0 }
    if (row.cdnStatus === 'On CDN') entry.synced += 1
    else entry.missing += 1
    byRtu.set(row.rtuKey, entry)
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['RTU key', 'On CDN', 'Missing from CDN'],
      ...[...byRtu.entries()]
        .sort((a, b) => b[1].missing - a[1].missing || a[0].localeCompare(b[0]))
        .map(([rtuKey, counts]) => [rtuKey, counts.synced, counts.missing]),
    ]),
    'By RTU',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildSyncHistorySheetRows(cloudHistory)),
    'Sync history',
  )

  XLSX.writeFile(wb, `sync-status-${stampFileName()}.xlsx`)
}
