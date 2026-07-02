import { loadRemoteSyncState } from '@/lib/remoteSyncState'
import { fetchRemoteSyncMeta } from '@/lib/syncMeta'

export interface SyncConflictWarning {
  remoteExportedAt: string
  lastPushedExportedAt: string
}

/** Cloud has a newer Settings sync than this PC's last successful push. */
export async function getSyncConflictWarning(): Promise<SyncConflictWarning | null> {
  const remote = await fetchRemoteSyncMeta()
  if (!remote?.exportedAt) return null

  const { lastPushedExportedAt, initialized } = loadRemoteSyncState()
  if (!initialized || !lastPushedExportedAt) return null

  const remoteTime = Date.parse(remote.exportedAt)
  const lastPushedTime = Date.parse(lastPushedExportedAt)
  if (!Number.isFinite(remoteTime) || !Number.isFinite(lastPushedTime)) return null
  if (remoteTime <= lastPushedTime) return null

  return {
    remoteExportedAt: remote.exportedAt,
    lastPushedExportedAt,
  }
}

export function buildSyncConflictMessage(conflict: SyncConflictWarning): string {
  return (
    'Cloudflare has a newer sync than this computer\'s last push. ' +
    'Continuing will replace the cloud copy with this browser\'s data. ' +
    'Use Settings → Load from Cloudflare first if you want the latest cloud data instead.\n\n' +
    `Cloud: ${conflict.remoteExportedAt}\n` +
    `This PC last pushed: ${conflict.lastPushedExportedAt}`
  )
}
