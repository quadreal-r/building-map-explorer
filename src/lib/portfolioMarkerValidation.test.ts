import { describe, expect, it } from 'vitest'
import type { Building, PortfolioData } from '@/types/domain'
import {
  findNearestBuildingByDistance,
  findPortfolioMarkerPlacementIssues,
  formatMarkerPlacementIssue,
  RTU_MARKER_BUILDING_WARN_FEET,
  rtuDistanceFromBuilding,
} from '@/lib/portfolioMarkerValidation'

function building(address: string, lat: number, lng: number, rtus: Building['rtus'] = []): Building {
  return { address, lat, lng, rtus }
}

describe('portfolioMarkerValidation', () => {
  const buildings: Building[] = [
    building('Site A', 43.6, -79.4, [{ name: 'RTU-1', lat: 43.6001, lng: -79.4001 }]),
    building('Site B', 43.7, -79.5),
  ]

  it('findNearestBuildingByDistance picks closest site', () => {
    const nearest = findNearestBuildingByDistance(buildings, 43.6002, -79.4002)
    expect(nearest?.building.address).toBe('Site A')
    expect(nearest?.feet).toBeLessThan(500)
  })

  it('flags RTUs far from assigned building', () => {
    const portfolio: PortfolioData = {
      buildings: [
        building('Wrong site', 43.6, -79.4, [
          { name: 'RTU-04B', lat: 43.7, lng: -79.5 },
        ]),
        building('Right site', 43.7, -79.5),
      ],
      utilities: [],
      polygons: [],
    }
    const issues = findPortfolioMarkerPlacementIssues(portfolio)
    expect(issues).toHaveLength(1)
    expect(issues[0].rtuName).toBe('RTU-04B')
    expect(issues[0].nearestBuildingAddress).toBe('Right site')
    expect(issues[0].feetFromBuilding).toBeGreaterThan(RTU_MARKER_BUILDING_WARN_FEET)
  })

  it('ignores RTUs near their building', () => {
    const portfolio: PortfolioData = {
      buildings: [buildings[0]],
      utilities: [],
      polygons: [],
    }
    expect(findPortfolioMarkerPlacementIssues(portfolio)).toHaveLength(0)
  })

  it('formats issue text for dialogs', () => {
    const text = formatMarkerPlacementIssue({
      buildingAddress: 'Wrong site',
      rtuName: 'RTU-04B',
      feetFromBuilding: 10_000,
      nearestBuildingAddress: 'Right site',
      nearestBuildingFeet: 50,
    })
    expect(text).toContain('RTU-04B')
    expect(text).toContain('Wrong site')
    expect(text).toContain('Right site')
  })

  it('rtuDistanceFromBuilding returns infinity without building coords', () => {
    expect(rtuDistanceFromBuilding({ address: 'X' } as Building, 43.6, -79.4)).toBe(
      Number.POSITIVE_INFINITY,
    )
  })
})
