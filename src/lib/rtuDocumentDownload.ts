import { zipSync } from 'fflate'

export interface RtuDocumentDownloadFile {
  url: string
  fileName: string
}

export function rtuDocumentBaseName(fileName: string): string {
  return fileName.includes('/') ? fileName.slice(fileName.lastIndexOf('/') + 1) : fileName
}

export function rtuDocumentArchiveName(rtuName: string): string {
  const sanitized = rtuName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'RTU-documents'
  return `${sanitized}-documents.zip`
}

export function uniqueDownloadFileName(baseName: string, used: Set<string>): string {
  if (!used.has(baseName)) {
    used.add(baseName)
    return baseName
  }

  const dot = baseName.lastIndexOf('.')
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName
  const ext = dot > 0 ? baseName.slice(dot) : ''
  let index = 2
  while (used.has(`${stem} (${index})${ext}`)) index++
  const unique = `${stem} (${index})${ext}`
  used.add(unique)
  return unique
}

function triggerBrowserDownload(href: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  try {
    triggerBrowserDownload(objectUrl, fileName)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

async function fetchRtuDocumentBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

export async function downloadRtuDocumentFile(url: string, fileName: string): Promise<void> {
  const baseName = rtuDocumentBaseName(fileName)
  try {
    const blob = await fetchRtuDocumentBlob(url)
    triggerBlobDownload(blob, baseName)
  } catch {
    triggerBrowserDownload(url, baseName)
  }
}

async function downloadRtuDocumentsZip(
  files: ReadonlyArray<RtuDocumentDownloadFile>,
  archiveBaseName: string,
): Promise<number> {
  const zipEntries: Record<string, Uint8Array> = {}
  const usedNames = new Set<string>()
  const failures: string[] = []

  for (const file of files) {
    const entryName = uniqueDownloadFileName(rtuDocumentBaseName(file.fileName), usedNames)
    try {
      const blob = await fetchRtuDocumentBlob(file.url)
      zipEntries[entryName] = new Uint8Array(await blob.arrayBuffer())
    } catch {
      failures.push(entryName)
    }
  }

  const entryCount = Object.keys(zipEntries).length
  if (entryCount === 0) {
    throw new Error('Could not download any selected documents.')
  }

  const zipped = zipSync(zipEntries)
  triggerBlobDownload(new Blob([zipped], { type: 'application/zip' }), rtuDocumentArchiveName(archiveBaseName))

  if (failures.length) {
    throw new Error(
      `Downloaded ${entryCount} document${entryCount === 1 ? '' : 's'} in a zip; ${failures.length} failed.`,
    )
  }

  return entryCount
}

export async function downloadRtuDocumentFiles(
  files: ReadonlyArray<RtuDocumentDownloadFile>,
  options?: { archiveBaseName?: string },
): Promise<{ count: number; zipped: boolean }> {
  if (files.length === 0) return { count: 0, zipped: false }

  if (files.length === 1) {
    await downloadRtuDocumentFile(files[0]!.url, files[0]!.fileName)
    return { count: 1, zipped: false }
  }

  const count = await downloadRtuDocumentsZip(files, options?.archiveBaseName ?? 'RTU-documents')
  return { count, zipped: true }
}
