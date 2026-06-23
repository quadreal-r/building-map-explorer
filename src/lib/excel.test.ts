import { describe, expect, it } from 'vitest'
import { buildRtuImportDescription, formatSqftExport } from '@/lib/excel'

describe('formatSqftExport', () => {
  it('formats numeric sqft with thousands separators', () => {
    expect(formatSqftExport('48030')).toBe('48,030')
    expect(formatSqftExport('51814')).toBe('51,814')
  })

  it('preserves already formatted values', () => {
    expect(formatSqftExport('48,030')).toBe('48,030')
  })

  it('returns empty for blank input', () => {
    expect(formatSqftExport('')).toBe('')
    expect(formatSqftExport(undefined)).toBe('')
  })
})

describe('buildRtuImportDescription', () => {
  const baseRow = {
    'RTU Name': 'RTU-05',
    Model: 'PGD430040K000C1',
    Serial: 'C102888078',
    Make: 'ICP',
    'Date Installed': 'Jul 01, 2010',
    'Heating Capacity': '70,000 BTU',
    'Cooling Capacity': '30,000 BTU (2.5 Ton)',
  }

  it('does not duplicate structured fields from Notes', () => {
    const notes = [
      'Building: 1850 Derry Road East',
      'System: Roof Top Units',
      'Description: RTU-05',
      'Model: PGD430040K000C1',
      'R22 Refrigerant',
    ].join(' | ')

    const desc = buildRtuImportDescription({ ...baseRow, Notes: notes }, '1850 Derry Road East')
    const lines = desc.split(/\r?\n/)

    expect(lines.filter((l) => l.startsWith('Building:'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('Model:'))).toHaveLength(1)
    expect(desc).toContain('R22 Refrigerant')
  })

  it('dedupes repeated note blocks from legacy exports', () => {
    const tripled = [
      'Building: 1850 Derry Road East',
      'System: Roof Top Units',
      'Description: RTU-05',
      'Building: 1850 Derry Road East',
      'System: Roof Top Units',
      'Description: RTU-05',
      'Building: 1850 Derry Road East',
      'System: Roof Top Units',
      'Description: RTU-05',
    ].join(' | ')

    const desc = buildRtuImportDescription({ ...baseRow, Notes: tripled }, '1850 Derry Road East')
    expect(desc.split(/\r?\n/).filter((l) => l.startsWith('Building:'))).toHaveLength(1)
  })

  it('keeps suite lines that only appear in Notes', () => {
    const desc = buildRtuImportDescription(
      { ...baseRow, Notes: 'Suite: Single Tenant | R22 Refrigerant' },
      '1850 Derry Road East',
    )
    expect(desc).toContain('Suite: Single Tenant')
    expect(desc).toContain('R22 Refrigerant')
  })
})
