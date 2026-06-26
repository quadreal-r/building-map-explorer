import { pictureFileRtuLabel } from '@/lib/rtuPictureAssignNaming'
import type { PortfolioData } from '@/types/domain'

export interface RtuNameRename {
  buildingAddress: string
  oldName: string
  newName: string
}

/** Strip description suffixes mistakenly copied into the map RTU name (e.g. after "/"). */
export function canonicalRtuMapName(rtuName: string, description?: string): string {
  const trimmed = rtuName.trim()
  if (!trimmed) return trimmed

  if (trimmed.includes('/')) {
    return pictureFileRtuLabel(trimmed)
  }

  const descLine = description?.match(/Description:\s*([^\r\n]+)/i)?.[1]?.trim()
  if (descLine && trimmed === descLine) {
    return pictureFileRtuLabel(descLine)
  }

  return trimmed
}

export function repairPortfolioRtuNames(portfolio: PortfolioData): {
  portfolio: PortfolioData
  renames: RtuNameRename[]
} {
  const renames: RtuNameRename[] = []

  const buildings = portfolio.buildings.map((building) => {
    const rtus = (building.rtus ?? []).map((rtu) => {
      const newName = canonicalRtuMapName(rtu.name, rtu.description)
      if (newName !== rtu.name) {
        renames.push({
          buildingAddress: building.address,
          oldName: rtu.name,
          newName,
        })
        return { ...rtu, name: newName }
      }
      return rtu
    })
    return { ...building, rtus }
  })

  return {
    portfolio: { ...portfolio, buildings },
    renames,
  }
}
