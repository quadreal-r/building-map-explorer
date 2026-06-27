import { describe, expect, it } from 'vitest'
import type { Building, PortfolioData, Rtu } from '@/types/domain'
import {
  findNearestBuildingByDistance,
  findPortfolioMarkerPlacementIssues,
  formatMarkerPlacementIssue,
  RTU_MARKER_BUILDING_WARN_FEET,
  rtuDistanceFromBuilding,
} from '@/lib/portfolioMarkerValidation'

function testBuilding(
  address: string,
  lat: number,
  lng: number,
  rtus: Rtu[] = [],
): Building {
  return {
    park: 'P',
    address,
    bu: '1',
    lat,
    lng,
    sqft: '1',
    cluster: 'C',
    manager: 'M',
    rtus,
  }
}

function testRtu(name: string, lat: number, lng: number, description = ''): Rtu {
  return { name, description, lat, lng }
}

describe('portfolioMarkerValidation', () => {
  const siteA = testBuilding('Site A', 43.6, -79.4, [
    testRtu('RTU-1', 43.6001, -79.4001),
  ])
  const siteB = testBuilding('Site B', 43.7, -79.5)
  const buildings: Building[] = [siteA, siteB]

  it('findNearestBuildingByDistance picks closest site', () => {
    const nearest = findNearestBuildingByDistance(buildings, 43.6002, -79.4002)
    expect(nearest?.building.address).toBe('Site A')
    expect(nearest?.feet).toBeLessThan(500)
  })

  it('flags RTUs far from assigned building', () => {
    const portfolio: PortfolioData = {
      buildings: [
        testBuilding('Wrong site', 43.6, -79.4, [testRtu('RTU-04B', 43.7, -79.5)]),
        testBuilding('Right site', 43.7, -79.5),
      ],
      utilities: [],
      polygons: [],
    }
    const issues = findPortfolioMarkerPlacementIssues(portfolio)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rtuName).toBe('RTU-04B')
    expect(issue?.nearestBuildingAddress).toBe('Right site')
    expect(issue?.feetFromBuilding).toBeGreaterThan(RTU_MARKER_BUILDING_WARN_FEET)
  })

  it('ignores RTUs near their building', () => {
    const portfolio: PortfolioData = {
      buildings: [siteA],
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
