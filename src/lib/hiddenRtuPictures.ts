/** Per-browser and deployed hides for manifest (R2/static) RTU pictures the user dismisses. */

import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'

const STORAGE_KEY = 'bme-hidden-rtu-pictures'
const BUNDLED_HIDDEN_URL = `${import.meta.env.BASE_URL}database/rtu-pictures/hidden.json`

function pictureHideKey(rtuKey: string, fileName: string): string {
  return `${rtuKey}|${fileName}`
}

function readHidden(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

function writeHidden(hidden: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]))
}

let bundledHidden: Set<string> | null = null
let bundledHiddenLoad: Promise<boolean> | null = null

function allHiddenKeys(): Set<string> {
  const merged = new Set(readHidden())
  if (bundledHidden) {
    for (const key of bundledHidden) merged.add(key)
  }
  return merged
}

/** Load server-deployed hidden.json (merged with localStorage at read time). */
export function loadBundledHiddenRtuPictures(): Promise<boolean> {
  if (bundledHiddenLoad) return bundledHiddenLoad
  bundledHiddenLoad = (async () => {
    try {
      const res = await fetch(BUNDLED_HIDDEN_URL)
      if (!res.ok) {
        bundledHidden = new Set()
        return false
      }
      const parsed = (await res.json()) as unknown
      if (!Array.isArray(parsed)) {
        bundledHidden = new Set()
        return false
      }
      bundledHidden = new Set(parsed.filter((item): item is string => typeof item === 'string'))
      return bundledHidden.size > 0
    } catch {
      bundledHidden = new Set()
      return false
    }
  })()
  return bundledHiddenLoad
}

export function isRtuManifestPictureHidden(rtuKey: string, fileName: string): boolean {
  return allHiddenKeys().has(pictureHideKey(rtuKey, fileName))
}

export function hideRtuManifestPicture(rtuKey: string, fileName: string): void {
  const hidden = readHidden()
  hidden.add(pictureHideKey(rtuKey, fileName))
  writeHidden(hidden)
  invalidateUnsyncedChanges()
}

/** Keys for Settings sync — local hides plus any already deployed from hidden.json. */
export function exportHiddenRtuPicturesForDeploy(): string[] {
  return [...allHiddenKeys()]
}

/** Hide keys stored in this browser only (not yet in deployed hidden.json). */
export function readLocalHiddenRtuPictureKeys(): string[] {
  return [...readHidden()]
}

function rtuKeyForHide(buildingAddress: string, rtuName: string): string {
  return `${buildingAddress}|${rtuName}`
}

/** Re-key local hide entries when an RTU is renamed in the portfolio. */
export function migrateHiddenRtuPictureKeys(
  renames: Array<{ buildingAddress: string; oldName: string; newName: string }>,
): void {
  if (!renames.length) return
  const hidden = readHidden()
  let changed = false
  for (const { buildingAddress, oldName, newName } of renames) {
    const oldPrefix = `${rtuKeyForHide(buildingAddress, oldName)}|`
    const newPrefix = `${rtuKeyForHide(buildingAddress, newName)}|`
    for (const key of [...hidden]) {
      if (!key.startsWith(oldPrefix)) continue
      hidden.delete(key)
      hidden.add(`${newPrefix}${key.slice(oldPrefix.length)}`)
      changed = true
    }
  }
  if (changed) {
    writeHidden(hidden)
    invalidateUnsyncedChanges()
  }
}

/** Remove browser-only hide entries (reverts unsynced picture hides). */
export function clearLocalHiddenRtuPictures(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
  invalidateUnsyncedChanges()
}

/** Local hides not included in the last successful Cloudflare sync on this PC. */
export function countUnsyncedLocalHiddenRtuPictures(
  lastPushedHiddenKeys: string[] | null,
): number {
  const local = readHidden()
  if (!local.size) return 0
  if (!lastPushedHiddenKeys) return local.size
  const pushed = new Set(lastPushedHiddenKeys)
  let count = 0
  for (const key of local) {
    if (!pushed.has(key)) count++
  }
  return count
}
