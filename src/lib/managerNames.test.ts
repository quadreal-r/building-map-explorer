import { describe, expect, it } from 'vitest'
import {
  addManagerSlot,
  applyManagerSlots,
  managerSlotsFromPortfolio,
} from '@/lib/managerNames'
import type { Building, PortfolioData } from '@/types/domain'

const buildings: Building[] = [
  {
    park: 'Test Park',
    address: '1 Main',
    bu: '',
    lat: 0,
    lng: 0,
    sqft: '',
    cluster: '',
    manager: 'Evelyn Lu',
  },
  {
    park: 'Test Park',
    address: '2 Main',
    bu: '',
    lat: 0,
    lng: 0,
    sqft: '',
    cluster: '',
    manager: 'Josh Starkey',
  },
]

const portfolio: PortfolioData = { buildings, utilities: [], polygons: [] }

describe('managerNames', () => {
  it('creates four slots pre-filled from portfolio managers', () => {
    const slots = managerSlotsFromPortfolio(buildings)
    expect(slots).toHaveLength(4)
    expect(slots[0]).toEqual({ original: 'Evelyn Lu', name: 'Evelyn Lu' })
    expect(slots[1]).toEqual({ original: 'Josh Starkey', name: 'Josh Starkey' })
    expect(slots[2]).toEqual({ original: '', name: '' })
    expect(slots[3]).toEqual({ original: '', name: '' })
  })

  it('adds an extra slot', () => {
    const slots = addManagerSlot(managerSlotsFromPortfolio(buildings))
    expect(slots).toHaveLength(5)
    expect(slots[4]).toEqual({ original: '', name: '' })
  })

  it('renames managers on buildings when applied', () => {
    const slots = managerSlotsFromPortfolio(buildings)
    slots[0] = { original: 'Evelyn Lu', name: 'Evelyn L.' }
    const result = applyManagerSlots(portfolio, slots)
    expect(result.changed).toBe(true)
    expect(result.portfolio.buildings[0]?.manager).toBe('Evelyn L.')
    expect(result.managerRenames).toEqual({ 'Evelyn Lu': 'Evelyn L.' })
  })
})
