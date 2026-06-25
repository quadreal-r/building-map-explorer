import type { Building, PortfolioData } from '@/types/domain'

export const MIN_MANAGER_SLOTS = 4

export interface ManagerSlot {
  /** Portfolio manager value this slot renames; empty for unused / new slots. */
  original: string
  name: string
}

export function uniqueManagersFromBuildings(buildings: Building[]): string[] {
  return [...new Set(buildings.map((b) => b.manager).filter(Boolean))].sort()
}

/** Build four slots from the same manager list as the sidebar “All property managers” filter. */
export function managerSlotsFromPortfolio(buildings: Building[]): ManagerSlot[] {
  const managers = uniqueManagersFromBuildings(buildings)
  const slots: ManagerSlot[] = []

  for (let i = 0; i < MIN_MANAGER_SLOTS; i++) {
    const manager = managers[i] ?? ''
    slots.push({ original: manager, name: manager })
  }

  return slots
}

export function addManagerSlot(slots: ManagerSlot[]): ManagerSlot[] {
  return [...slots, { original: '', name: '' }]
}

export function managerSlotLabel(index: number): string {
  return `Manager ${index + 1}`
}

export function applyManagerSlots(
  portfolio: PortfolioData,
  slots: ManagerSlot[],
): { portfolio: PortfolioData; changed: boolean; managerRenames: Record<string, string> } {
  const managerRenames: Record<string, string> = {}
  let changed = false

  for (const slot of slots) {
    const nextName = slot.name.trim()
    if (!slot.original || !nextName || slot.original === nextName) continue
    managerRenames[slot.original] = nextName
  }

  if (Object.keys(managerRenames).length === 0) {
    return { portfolio, changed: false, managerRenames }
  }

  const buildings = portfolio.buildings.map((building) => {
    const renamed = building.manager ? managerRenames[building.manager] : undefined
    if (!renamed || renamed === building.manager) return building
    changed = true
    return { ...building, manager: renamed }
  })

  return {
    portfolio: { ...portfolio, buildings },
    changed,
    managerRenames,
  }
}
