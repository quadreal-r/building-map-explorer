import { migrateHiddenRtuPictureKeys } from '@/lib/hiddenRtuPictures'
import { migrateIndexedDbRtuKeys } from '@/lib/rtuPictures'
import type { PortfolioData } from '@/types/domain'

export interface RtuRename {
  buildingAddress: string
  oldName: string
  newName: string
}

export interface RtuTextUpdate {
  name: string
  description: string
}

export function applyRtuTextChangeInPortfolio(
  portfolio: PortfolioData,
  buildingAddress: string,
  oldName: string,
  updates: RtuTextUpdate,
): { portfolio: PortfolioData; rename?: RtuRename } {
  const trimmedName = updates.name.trim()
  if (!trimmedName) {
    throw new Error('RTU name cannot be empty.')
  }

  const building = portfolio.buildings.find((b) => b.address === buildingAddress)
  if (!building) {
    throw new Error('Building not found.')
  }

  const rtu = building.rtus?.find((r) => r.name === oldName)
  if (!rtu) {
    throw new Error('RTU not found.')
  }

  if (
    trimmedName !== oldName &&
    building.rtus?.some((r) => r.name === trimmedName)
  ) {
    throw new Error(`An RTU named "${trimmedName}" already exists on this building.`)
  }

  let rename: RtuRename | undefined
  if (trimmedName !== oldName) {
    rename = { buildingAddress, oldName, newName: trimmedName }
  }

  const nextDescription = updates.description.trim()
  const buildings = portfolio.buildings.map((b) => {
    if (b.address !== buildingAddress) return b
    return {
      ...b,
      rtus: b.rtus?.map((r) =>
        r.name === oldName
          ? { ...r, name: trimmedName, description: nextDescription }
          : r,
      ),
    }
  })

  return {
    portfolio: { ...portfolio, buildings },
    rename,
  }
}

export async function migrateRtuAssociatedData(rename: RtuRename): Promise<void> {
  await migrateIndexedDbRtuKeys([rename])
  migrateHiddenRtuPictureKeys([rename])
}
