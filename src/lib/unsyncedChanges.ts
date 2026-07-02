import { collectUnsyncedLines, type UnsyncedChangeLine } from '@/lib/syncState'

export type { UnsyncedChangeLine } from '@/lib/syncState'

export function formatUnsyncedChangesMessage(lines: UnsyncedChangeLine[]): string {
  if (!lines.length) return ''
  return lines
    .map((line) => (line.count != null ? `${line.label} (${line.count})` : line.label))
    .join('; ')
}

/** Local edits not yet uploaded via Settings → Sync to Cloudflare & GitHub. */
export async function collectUnsyncedChangesSummary(): Promise<UnsyncedChangeLine[]> {
  return collectUnsyncedLines()
}
