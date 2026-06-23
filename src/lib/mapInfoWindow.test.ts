import { describe, expect, it } from 'vitest'
import {
  buildBuildingInfoHtml,
  buildBuildingInfoPlainText,
  buildDetailInfoHtml,
  buildDetailInfoPlainText,
} from '@/lib/mapInfoWindow'
import type { Building, Rtu } from '@/types/domain'

const building: Building = {
  park: 'Test Park (x 2)',
  address: '100 Main Street',
  bu: '123',
  lat: 43.65,
  lng: -79.62,
  sqft: '10,000',
  cluster: 'Cluster A',
  manager: 'Alex',
  rtus: [
    {
      name: 'RTU-01',
      description: 'Model: ABC\nMake: TRANE',
      lat: 43.651,
      lng: -79.621,
    },
  ],
  tenants: [{ name: 'Unit 1', description: 'Acme Corp', lat: 0, lng: 0 }],
}

const rtu: Rtu = {
  name: 'RTU-01',
  description: 'Model: ABC\nMake: TRANE',
  lat: 43.651,
  lng: -79.621,
}

const rtuWithBuilding: Rtu = {
  name: 'RTU-05',
  description:
    'Building: 85 Leek Crescent\nSystem: Roof Top Units\nDescription: RTU 05\nModel: LGH060H4EHIJ\nMake: LENNOX',
  lat: 43.651,
  lng: -79.621,
}

describe('mapInfoWindow', () => {
  it('includes Copy and Move in building popup', () => {
    const html = buildBuildingInfoHtml(building)
    expect(html).toContain('data-iw-action="copy-all"')
    expect(html).toContain('data-iw-action="move"')
    expect(html).toContain('class="iw-copy-source"')
    expect(html).not.toContain('Open in Google Maps')
    expect(html).not.toContain('<strong>GPS</strong>')
  })

  it('builds building plain text matching popup layout', () => {
    const text = buildBuildingInfoPlainText(building)
    expect(text).toContain('100 Main Street')
    expect(text).toContain('Test Park')
    expect(text).toContain('BU #        123')
    expect(text).toContain('RTUs (1)')
    expect(text).toContain('RTU-01')
    expect(text).toContain('  ABC · TRANE')
    expect(text).toContain('Tenants (1)')
    expect(text).toContain('Unit 1  Acme Corp')
  })

  it('includes Copy, Move, and Delete in detail popup footer', () => {
    const html = buildDetailInfoHtml('rtu', rtu, { buildingAddress: building.address })
    expect(html).toContain('class="iw-foot"')
    expect(html).toContain('📋 Copy')
    expect(html).toContain('↔ Move')
    expect(html).toContain('🗑 Delete')
    expect(html.indexOf('class="iw-body"')).toBeLessThan(html.indexOf('class="iw-foot"'))
  })

  it('builds detail plain text without redundant RTU label or building footer', () => {
    const text = buildDetailInfoPlainText('rtu', rtuWithBuilding, {
      buildingAddress: '85 Leek Crescent',
    })
    expect(text.startsWith('RTU-05\n\n')).toBe(true)
    expect(text).not.toContain('\nRTU\n')
    expect(text).toContain('Building    85 Leek Crescent')
    expect(text).toContain('System      Roof Top Units')
    expect(text.match(/Building    85 Leek Crescent/g)?.length).toBe(1)
  })

  it('builds detail plain text for simple RTU rows', () => {
    const text = buildDetailInfoPlainText('rtu', rtu, { buildingAddress: building.address })
    expect(text).toContain('RTU-01')
    expect(text).not.toMatch(/\nRTU\n/)
    expect(text).toContain('Model       ABC')
    expect(text).toContain('Make        TRANE')
    expect(text).not.toContain('Building    100 Main Street')
  })
})
