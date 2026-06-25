import { fetchRemoteJson } from '@/lib/jsonDataUrls'
import type { SyncMeta } from '@/types/syncMeta'

export async function fetchRemoteSyncMeta(): Promise<SyncMeta | null> {
  const meta = await fetchRemoteJson<SyncMeta>('sync-meta.json')
  if (!meta?.exportedAt || !meta.summary) return null
  return meta
}

export function formatSyncTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function describeSyncSource(source: string): string {
  if (source === 'settings-sync') return 'Settings sync on another computer'
  if (source === 'git-push') return 'GitHub deploy'
  return 'Cloudflare upload'
}
