/** Per-browser hides for manifest (R2/static) RTU pictures the user dismisses. */

const STORAGE_KEY = 'bme-hidden-rtu-pictures'

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

export function isRtuManifestPictureHidden(rtuKey: string, fileName: string): boolean {
  return readHidden().has(pictureHideKey(rtuKey, fileName))
}

export function hideRtuManifestPicture(rtuKey: string, fileName: string): void {
  const hidden = readHidden()
  hidden.add(pictureHideKey(rtuKey, fileName))
  writeHidden(hidden)
}
