import { describe, expect, it, vi } from 'vitest'
import { buildRtuDocumentsContainerHtml } from '@/lib/mapInfoWindow'
import { rtuDocumentFileUrl } from '@/lib/rtuDocumentUrls'

describe('rtuDocumentUrls', () => {
  it('builds document file URLs from base env', () => {
    vi.stubEnv('VITE_RTU_DOCUMENTS_BASE_URL', 'https://docs.example.com/rtu/')
    expect(rtuDocumentFileUrl('100-RTU-01-manual.pdf')).toBe(
      'https://docs.example.com/rtu/100-RTU-01-manual.pdf',
    )
  })
})

describe('buildRtuDocumentsContainerHtml', () => {
  it('renders document links', () => {
    const html = buildRtuDocumentsContainerHtml([
      {
        fileName: '100-RTU-01-manual.pdf',
        url: 'https://docs.example.com/100-RTU-01-manual.pdf',
        label: '100-RTU-01-manual.pdf',
      },
    ])
    expect(html).toContain('data-iw-documents-root')
    expect(html).toContain('100-RTU-01-manual.pdf')
    expect(html).toContain('target="_blank"')
  })

  it('shows empty state', () => {
    const html = buildRtuDocumentsContainerHtml([])
    expect(html).toContain('No documents on Cloudflare')
  })
})
