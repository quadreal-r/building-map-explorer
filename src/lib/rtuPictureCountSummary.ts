import { rtuPictureKey } from '@/lib/rtuPictures'
import type { Building } from '@/types/domain'

export interface PictureCountParkRow {
  park: string
  pictures: number
  buildings: number
  rtusWithPictures: number
  rtusTotal: number
}

export interface PictureCountBuildingRow {
  address: string
  park: string
  pictures: number
  rtusWithPictures: number
  rtusTotal: number
}

export interface PictureCountRtuRow {
  address: string
  park: string
  rtuName: string
  pictures: number
}

export interface PictureCountSummary {
  totalPictures: number
  rtusWithPictures: number
  rtusTotal: number
  buildingPictureTotals: Map<string, number>
  parkPictureTotals: Map<string, number>
  byPark: PictureCountParkRow[]
  byBuilding: PictureCountBuildingRow[]
  rtusMissingPictures: PictureCountRtuRow[]
}

export function buildPictureCountSummary(
  buildings: Building[],
  countMap: Map<string, number>,
): PictureCountSummary {
  const buildingPictureTotals = new Map<string, number>()
  const parkPictureTotals = new Map<string, number>()
  const parkRows = new Map<string, PictureCountParkRow>()
  const byBuilding: PictureCountBuildingRow[] = []
  const rtusMissingPictures: PictureCountRtuRow[] = []

  let totalPictures = 0
  let rtusWithPictures = 0
  let rtusTotal = 0

  for (const building of buildings) {
    const park = building.park || 'Unknown'
    let buildingPictures = 0
    let buildingRtusWithPictures = 0
    const rtuCount = building.rtus?.length ?? 0
    rtusTotal += rtuCount

    let parkRow = parkRows.get(park)
    if (!parkRow) {
      parkRow = { park, pictures: 0, buildings: 0, rtusWithPictures: 0, rtusTotal: 0 }
      parkRows.set(park, parkRow)
    }
    parkRow.buildings += 1
    parkRow.rtusTotal += rtuCount

    for (const rtu of building.rtus ?? []) {
      const count = countMap.get(rtuPictureKey(building.address, rtu.name)) ?? 0
      if (count > 0) {
        buildingPictures += count
        buildingRtusWithPictures += 1
        rtusWithPictures += 1
        parkRow.rtusWithPictures += 1
      } else {
        rtusMissingPictures.push({
          address: building.address,
          park,
          rtuName: rtu.name,
          pictures: 0,
        })
      }
    }

    totalPictures += buildingPictures
    parkRow.pictures += buildingPictures
    buildingPictureTotals.set(building.address, buildingPictures)
    parkPictureTotals.set(park, (parkPictureTotals.get(park) ?? 0) + buildingPictures)

    byBuilding.push({
      address: building.address,
      park,
      pictures: buildingPictures,
      rtusWithPictures: buildingRtusWithPictures,
      rtusTotal: rtuCount,
    })
  }

  const byPark = [...parkRows.values()].sort((a, b) => {
    if (b.pictures !== a.pictures) return b.pictures - a.pictures
    return a.park.localeCompare(b.park)
  })

  byBuilding.sort((a, b) => {
    if (b.pictures !== a.pictures) return b.pictures - a.pictures
    return a.address.localeCompare(b.address)
  })

  rtusMissingPictures.sort((a, b) => {
    const parkCmp = a.park.localeCompare(b.park)
    if (parkCmp !== 0) return parkCmp
    const addrCmp = a.address.localeCompare(b.address)
    if (addrCmp !== 0) return addrCmp
    return a.rtuName.localeCompare(b.rtuName)
  })

  return {
    totalPictures,
    rtusWithPictures,
    rtusTotal,
    buildingPictureTotals,
    parkPictureTotals,
    byPark,
    byBuilding,
    rtusMissingPictures,
  }
}

export function formatPictureCountSuffix(count: number): string {
  return count > 0 ? ` (× ${count})` : ''
}
