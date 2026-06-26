/** RTU picture storage: Cloudflare R2 (production) or same-origin static files, plus IndexedDB uploads. */

import { parseBulkRtuPictureFileName, normalizeRtuUnitCore } from '@/lib/rtuPictureMatch'
import {
  buildCloudRtuPictureFileName,
  manifestEntryToCloudFileName,
  pictureFileRtuLabel,
} from '@/lib/rtuPictureAssignNaming'
import { isRtuManifestPictureHidden } from '@/lib/hiddenRtuPictures'
import {
  getRtuPictureManifestUrl,
  rtuPictureFileUrl,
} from '@/lib/rtuPictureUrls'

export interface RtuPictureManifest {
  /** Keys: `${buildingAddress}|${rtuName}` → filenames in rtu-pictures folder */
  entries: Record<string, string[]>
}

export interface RtuPicture {
  fileName: string
  index: number
  /** Low-res preview URL — caller must revoke blob URLs when done */
  thumbUrl: string
  /** Full-resolution URL (static file or stored original blob) */
  fullUrl: string
  source: 'static' | 'indexeddb'
}

const DB_NAME = 'building-map-explorer'
const DB_VERSION = 2
const STORE = 'rtuPictures'
const BUNDLED_MANIFEST_URL = `${import.meta.env.BASE_URL}database/rtu-pictures/manifest.json`

let manifestCache: RtuPictureManifest | null = null
let manifestPromise: Promise<RtuPictureManifest> | null = null

type RtuPicturesListener = () => void
const rtuPicturesListeners = new Set<RtuPicturesListener>()
let notifyRtuPicturesTimer: ReturnType<typeof setTimeout> | null = null

export function onRtuPicturesChanged(listener: RtuPicturesListener): () => void {
  rtuPicturesListeners.add(listener)
  return () => rtuPicturesListeners.delete(listener)
}

export function notifyRtuPicturesChanged(): void {
  if (notifyRtuPicturesTimer) clearTimeout(notifyRtuPicturesTimer)
  notifyRtuPicturesTimer = setTimeout(() => {
    notifyRtuPicturesTimer = null
    for (const listener of rtuPicturesListeners) listener()
  }, 80)
}

export function rtuPictureKey(buildingAddress: string, rtuName: string): string {
  return `${buildingAddress}|${rtuName}`
}

/**
 * Match manifest entries when the portfolio RTU name differs slightly from the manifest key
 * (e.g. `RTU-04 Hybrid/Dual Fuel Heat Pump` vs `RTU-04 Hybrid`).
 */
export function resolveManifestRtuKey(
  buildingAddress: string,
  rtuName: string,
  manifest: RtuPictureManifest,
): string {
  const exact = rtuPictureKey(buildingAddress, rtuName)
  const entries = manifest.entries ?? {}
  if (entries[exact]?.length) return exact

  const rtuLabel = pictureFileRtuLabel(rtuName)
  const unitCore = normalizeRtuUnitCore(rtuName)
  const prefix = `${buildingAddress}|`

  for (const key of Object.keys(entries)) {
    if (!key.startsWith(prefix) || !entries[key]?.length) continue
    const manifestRtuName = key.slice(prefix.length)
    if (pictureFileRtuLabel(manifestRtuName) === rtuLabel) return key
    if (unitCore && normalizeRtuUnitCore(manifestRtuName) === unitCore) return key
  }

  return exact
}

/** First street number from a building address, e.g. "1590 South Gateway Rd." → "1590". */
export function buildingStreetNumber(address: string): string {
  const match = address.match(/\d+/)
  return match?.[0] ?? 'unknown'
}

/** RTU label for filenames, e.g. "RTU- 04" → "RTU-04". */
export function sanitizeRtuFileToken(rtuName: string): string {
  return rtuName
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\w.-]/g, '')
}

export function rtuPictureFileBase(buildingAddress: string, rtuName: string): string {
  return `${buildingStreetNumber(buildingAddress)}_${sanitizeRtuFileToken(rtuName)}`
}

export function rtuPictureFileName(
  buildingAddress: string,
  rtuName: string,
  index: number,
  ext: string,
): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'jpg'
  return `${rtuPictureFileBase(buildingAddress, rtuName)}_(${index}).${safeExt}`
}

export function parseRtuPictureIndex(fileName: string): number | null {
  const stored = fileName.match(/_\((\d+)\)\.[^.]+$/i)
  if (stored) return Number(stored[1])

  const bulk = parseBulkRtuPictureFileName(fileName)
  return bulk?.pictureIndex ?? null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'fileName' })
        store.createIndex('rtuKey', 'rtuKey', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

interface StoredRtuPictureRow {
  fileName: string
  rtuKey: string
  index: number
  mimeType: string
  thumbBlob: Blob
  /** Original upload; older rows may only have thumbBlob */
  fullBlob?: Blob
  /** False after a successful Settings sync uploaded this file to Cloudflare */
  pendingDeploy?: boolean
}

async function idbGetAllForRtu(rtuKey: string): Promise<StoredRtuPictureRow[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const index = tx.objectStore(STORE).index('rtuKey')
    const req = index.getAll(rtuKey)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    req.onsuccess = () => resolve((req.result as StoredRtuPictureRow[]) ?? [])
    tx.oncomplete = () => db.close()
  })
}

/** Re-key IndexedDB pictures when portfolio RTU names are shortened to match the manifest. */
export async function migrateIndexedDbRtuKeys(
  renames: Array<{ buildingAddress: string; oldName: string; newName: string }>,
): Promise<number> {
  if (!renames.length) return 0
  const db = await openDb()
  let updated = 0
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    req.onsuccess = () => {
      const rows = (req.result as StoredRtuPictureRow[]) ?? []
      for (const { buildingAddress, oldName, newName } of renames) {
        const oldKey = rtuPictureKey(buildingAddress, oldName)
        const newKey = rtuPictureKey(buildingAddress, newName)
        for (const row of rows) {
          if (row.rtuKey !== oldKey) continue
          store.put({ ...row, rtuKey: newKey })
          updated += 1
        }
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
  })
  if (updated) notifyRtuPicturesChanged()
  return updated
}

/** Rename legacy spaced picture files in IndexedDB to cloud-safe names before sync. */
export async function migrateLegacyPictureFileNames(): Promise<number> {
  const rows = await idbGetAllRows()
  let migrated = 0
  for (const row of rows) {
    const sep = row.rtuKey.indexOf('|')
    if (sep < 0) continue
    const buildingAddress = row.rtuKey.slice(0, sep)
    const rtuName = row.rtuKey.slice(sep + 1)
    const canonical = manifestEntryToCloudFileName(row.fileName, buildingAddress, rtuName)
    if (canonical === row.fileName) continue
    await idbPut({ ...row, fileName: canonical, pendingDeploy: true })
    await idbDelete(row.fileName)
    migrated += 1
  }
  if (migrated) notifyRtuPicturesChanged()
  return migrated
}

async function idbPut(row: StoredRtuPictureRow): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
  })
}

async function idbGetAllRows(): Promise<StoredRtuPictureRow[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    req.onsuccess = () => resolve((req.result as StoredRtuPictureRow[]) ?? [])
    tx.oncomplete = () => db.close()
  })
}

/** All IndexedDB picture rows (for deploy bundle export). */
export async function exportIndexedDbPictureRows(): Promise<StoredRtuPictureRow[]> {
  return idbGetAllRows()
}

export interface DeployPictureExportResult {
  pictures: import('@/types/deployBundle').DeployPictureEntry[]
  failedFileNames: string[]
  pendingCount: number
}

export interface PendingDeployPictureRow {
  fileName: string
  rtuKey: string
  index: number
  mimeType: string
  blob: Blob
}

/** Encode a blob as raw base64 without building a giant intermediate binary string. */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('Failed to read image'))
        return
      }
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

/** Rough upper bound for JSON size of one deploy picture entry (base64 + field overhead). */
export function estimateDeployPictureJsonBytes(blobSize: number): number {
  return Math.ceil((blobSize * 4) / 3) + 160
}

/** Pending IndexedDB rows for deploy, without loading every image into memory as base64. */
export async function listPendingDeployPictureRows(): Promise<{
  rows: PendingDeployPictureRow[]
  failedFileNames: string[]
  pendingCount: number
}> {
  const rows = await idbGetAllRows()
  const pendingRows = rows.filter((row) => row.pendingDeploy !== false)
  const deployRows: PendingDeployPictureRow[] = []
  const failedFileNames: string[] = []

  for (const row of pendingRows) {
    const blob = row.fullBlob ?? row.thumbBlob
    if (!blob || blob.size === 0) {
      failedFileNames.push(row.fileName)
      continue
    }
    deployRows.push({
      fileName: row.fileName,
      rtuKey: row.rtuKey,
      index: row.index,
      mimeType: row.mimeType,
      blob,
    })
  }

  return { rows: deployRows, failedFileNames, pendingCount: pendingRows.length }
}

export async function encodeDeployPictureEntry(
  row: PendingDeployPictureRow,
): Promise<import('@/types/deployBundle').DeployPictureEntry> {
  const base64 = await blobToBase64(row.blob)
  return {
    fileName: row.fileName,
    rtuKey: row.rtuKey,
    index: row.index,
    mimeType: row.mimeType,
    base64,
  }
}

/** IndexedDB pictures pending Cloudflare deploy (map upload / bulk import). */
export async function exportPendingPicturesForDeploy(): Promise<DeployPictureExportResult> {
  const { rows, failedFileNames, pendingCount } = await listPendingDeployPictureRows()
  const pictures: DeployPictureExportResult['pictures'] = []

  for (const row of rows) {
    try {
      pictures.push(await encodeDeployPictureEntry(row))
    } catch {
      failedFileNames.push(row.fileName)
    }
  }

  return { pictures, failedFileNames, pendingCount }
}

/** Mark map/import pictures as deployed after a successful Settings sync. */
export async function markRtuPicturesDeployed(fileNames: string[]): Promise<void> {
  if (!fileNames.length) return
  const wanted = new Set(fileNames)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    req.onsuccess = () => {
      const rows = (req.result as StoredRtuPictureRow[]) ?? []
      for (const row of rows) {
        if (!wanted.has(row.fileName)) continue
        store.put({ ...row, pendingDeploy: false })
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
  })
}

/** Picture count per RTU key (`buildingAddress|rtuName`), merging manifest + IndexedDB by index. */
export async function getRtuPictureCountMap(): Promise<Map<string, number>> {
  const manifest = await loadRtuPictureManifest()
  const rows = await idbGetAllRows()
  const indexByKey = new Map<string, Set<number>>()

  for (const [key, files] of Object.entries(manifest.entries ?? {})) {
    const indices = new Set<number>()
    for (const fileName of files) {
      if (isRtuManifestPictureHidden(key, fileName)) continue
      const index = parseRtuPictureIndex(fileName)
      if (index != null && index >= 1) indices.add(index)
    }
    if (indices.size) indexByKey.set(key, indices)
  }

  for (const row of rows) {
    let indices = indexByKey.get(row.rtuKey)
    if (!indices) {
      indices = new Set()
      indexByKey.set(row.rtuKey, indices)
    }
    indices.add(row.index)
  }

  return new Map([...indexByKey.entries()].map(([key, indices]) => [key, indices.size]))
}

async function fetchManifestFromUrl(url: string): Promise<RtuPictureManifest | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as RtuPictureManifest
    const entries = data.entries ?? {}
    if (Object.keys(entries).length === 0) return null
    return { entries }
  } catch {
    return null
  }
}

export function clearRtuPictureManifestCache(): void {
  manifestCache = null
}

export async function loadRtuPictureManifest(): Promise<RtuPictureManifest> {
  if (manifestCache) return manifestCache
  if (manifestPromise) return manifestPromise
  manifestPromise = (async () => {
    try {
      const remoteUrl = getRtuPictureManifestUrl()
      let manifest =
        remoteUrl !== BUNDLED_MANIFEST_URL
          ? await fetchManifestFromUrl(remoteUrl)
          : null
      if (!manifest) {
        manifest = await fetchManifestFromUrl(BUNDLED_MANIFEST_URL)
      }
      manifestCache = manifest ?? { entries: {} }
      return manifestCache
    } finally {
      manifestPromise = null
    }
  })()
  return manifestPromise
}

async function createThumbnail(file: File, maxWidth = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas not supported')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail encode failed'))),
      'image/jpeg',
      0.72,
    )
  })
}

function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  const mime = file.type.split('/')[1]
  return mime === 'jpeg' ? 'jpg' : mime || 'jpg'
}

export async function listRtuPictures(
  buildingAddress: string,
  rtuName: string,
): Promise<RtuPicture[]> {
  const key = rtuPictureKey(buildingAddress, rtuName)
  const manifest = await loadRtuPictureManifest()
  const manifestKey = resolveManifestRtuKey(buildingAddress, rtuName, manifest)
  const staticNames = manifest.entries[manifestKey] ?? []
  const idbRows = [
    ...(await idbGetAllForRtu(key)),
    ...(manifestKey !== key ? await idbGetAllForRtu(manifestKey) : []),
  ]

  /** One picture per index — IndexedDB uploads replace static/manifest entries at the same slot. */
  const byIndex = new Map<number, RtuPicture>()

  for (const fileName of staticNames) {
    if (isRtuManifestPictureHidden(manifestKey, fileName)) continue
    const index = parseRtuPictureIndex(fileName)
    if (index == null || index < 1) continue
    const cloudFileName = manifestEntryToCloudFileName(fileName, buildingAddress, rtuName)
    const url = rtuPictureFileUrl(cloudFileName)
    byIndex.set(index, {
      fileName: cloudFileName,
      index,
      thumbUrl: url,
      fullUrl: url,
      source: 'static',
    })
  }

  for (const row of idbRows) {
    const fullBlob = row.fullBlob ?? row.thumbBlob
    const thumbUrl = URL.createObjectURL(row.thumbBlob)
    const fullUrl = fullBlob === row.thumbBlob ? thumbUrl : URL.createObjectURL(fullBlob)
    byIndex.set(row.index, {
      fileName: row.fileName,
      index: row.index,
      thumbUrl,
      fullUrl,
      source: 'indexeddb',
    })
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

async function idbDelete(fileName: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(fileName)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
  })
}

async function idbDeleteByRtuAndIndex(rtuKey: string, index: number): Promise<void> {
  const rows = await idbGetAllForRtu(rtuKey)
  await Promise.all(rows.filter((row) => row.index === index).map((row) => idbDelete(row.fileName)))
}

/** Store or replace a picture at a specific index (bulk import / explicit numbering). */
export async function importRtuPictureAtIndex(
  buildingAddress: string,
  rtuName: string,
  file: File,
  index: number,
  options?: { fileName?: string },
): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i.test(file.name)) {
    throw new Error('Not an image file')
  }
  if (index < 1) throw new Error('Picture index must be at least 1')

  const key = rtuPictureKey(buildingAddress, rtuName)
  // Remove any prior upload at this index (including different file extensions).
  await idbDeleteByRtuAndIndex(key, index)

  const ext = fileExtension(file)
  const fileName = options?.fileName
    ? manifestEntryToCloudFileName(
        options.fileName,
        buildingAddress,
        rtuName,
      )
    : buildCloudRtuPictureFileName(buildingAddress, rtuName, index, ext)
  const thumbBlob = await createThumbnail(file)
  await idbPut({
    fileName,
    rtuKey: key,
    index,
    mimeType: file.type || 'image/jpeg',
    thumbBlob,
    fullBlob: file,
    pendingDeploy: true,
  })
  notifyRtuPicturesChanged()
  return fileName
}

/** Persist the current edited image back to the map (IndexedDB, pending Cloudflare deploy). */
export async function saveRtuPictureEdit(
  buildingAddress: string,
  rtuName: string,
  index: number,
  blob: Blob,
  fileName: string,
): Promise<string> {
  const mimeType = blob.type || 'image/jpeg'
  const safeName = fileName.includes('.')
    ? fileName
    : `${fileName}.${mimeType === 'image/png' ? 'png' : 'jpg'}`
  const file = new File([blob], safeName, { type: mimeType })
  return importRtuPictureAtIndex(buildingAddress, rtuName, file, index, { fileName: safeName })
}

export async function deleteRtuPicture(
  buildingAddress: string,
  rtuName: string,
  fileName: string,
): Promise<'deleted' | 'not-found' | 'static'> {
  const pictures = await listRtuPictures(buildingAddress, rtuName)
  const pic = pictures.find((p) => p.fileName === fileName)
  if (!pic) return 'not-found'
  if (pic.source === 'static') return 'static'
  revokeRtuPictureUrls([pic])
  await idbDelete(fileName)
  notifyRtuPicturesChanged()
  return 'deleted'
}

export function revokeRtuPictureUrls(pictures: RtuPicture[]): void {
  for (const pic of pictures) {
    if (pic.source !== 'indexeddb') continue
    URL.revokeObjectURL(pic.thumbUrl)
    if (pic.fullUrl !== pic.thumbUrl) URL.revokeObjectURL(pic.fullUrl)
  }
}

export async function addRtuPicturesFromFiles(
  buildingAddress: string,
  rtuName: string,
  files: File[],
): Promise<RtuPicture[]> {
  if (!files.length) return listRtuPictures(buildingAddress, rtuName)

  const imageFiles = files.filter(
    (file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heif|heic|tif{1,2})$/i.test(file.name),
  )
  if (!imageFiles.length) return listRtuPictures(buildingAddress, rtuName)

  const existing = await listRtuPictures(buildingAddress, rtuName)
  revokeRtuPictureUrls(existing.filter((p) => p.source === 'indexeddb'))

  let nextIndex = existing.reduce((max, pic) => Math.max(max, pic.index), 0) + 1

  for (const file of imageFiles) {
    await importRtuPictureAtIndex(buildingAddress, rtuName, file, nextIndex)
    nextIndex += 1
  }

  return listRtuPictures(buildingAddress, rtuName)
}
