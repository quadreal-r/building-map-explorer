import { describe, expect, it } from 'vitest'
import { detectExcelWorkbookKind } from '@/lib/excelWorkbookType'

describe('detectExcelWorkbookKind', () => {
  it('detects portfolio export sheets', () => {
    expect(
      detectExcelWorkbookKind(['Buildings', 'RTUs', 'Tenant Polygons', 'Utilities']),
    ).toBe('portfolio')
  })

  it('detects capital workbook sheets', () => {
    expect(detectExcelWorkbookKind(['Equipment', 'RTU Pricing', 'Summary'])).toBe('capital')
  })

  it('rejects unknown workbooks', () => {
    expect(() => detectExcelWorkbookKind(['Sheet1'])).toThrow(/Unrecognized workbook/)
  })
})
