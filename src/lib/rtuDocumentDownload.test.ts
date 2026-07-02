import { describe, expect, it } from 'vitest'
import {
  rtuDocumentArchiveName,
  rtuDocumentBaseName,
  uniqueDownloadFileName,
} from '@/lib/rtuDocumentDownload'

describe('rtuDocumentDownload', () => {
  it('extracts base file name from paths', () => {
    expect(rtuDocumentBaseName('folder/100-RTU-01-manual.pdf')).toBe('100-RTU-01-manual.pdf')
    expect(rtuDocumentBaseName('100-RTU-01-manual.pdf')).toBe('100-RTU-01-manual.pdf')
  })

  it('builds archive names from RTU names', () => {
    expect(rtuDocumentArchiveName('RTU-01')).toBe('RTU-01-documents.zip')
    expect(rtuDocumentArchiveName('RTU 05 / North')).toBe('RTU_05_North-documents.zip')
  })

  it('deduplicates zip entry file names', () => {
    const used = new Set<string>()
    expect(uniqueDownloadFileName('manual.pdf', used)).toBe('manual.pdf')
    expect(uniqueDownloadFileName('manual.pdf', used)).toBe('manual (2).pdf')
    expect(uniqueDownloadFileName('manual.pdf', used)).toBe('manual (3).pdf')
  })
})
