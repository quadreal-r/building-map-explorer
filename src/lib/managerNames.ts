import type { Building, PortfolioData } from '@/types/domain'

export const MIN_MANAGER_SLOTS = 4

export interface ManagerSlot {
  /** Fixed slot id, e.g. "Manager 1". Buildings reference this value. */
  key: string
  /** Editable display name; empty shows the slot label in the UI. */
  name: string
}

export function isManagerSlotKey(value: string): boolean {
  return /^Manager [1-4]$/.test(value)
}

export function managerSlotLabel(index: number): string {
  return `Manager ${index + 1}`
}

export function managerSlotKey(index: number): string {
  return managerSlotLabel(index)
}

export function uniqueManagersFromBuildings(buildings: Building[]): string[] {
  return [...new Set(buildings.map((b) => b.manager).filter(Boolean))].sort()
}

/** Map legacy human manager names to Manager 1–4 by sorted order. */
export function legacyManagerToSlotMap(buildings: Building[]): Map<string, string> {
  const map = new Map<string, string>()
  const legacy = uniqueManagersFromBuildings(buildings).filter((manager) => !isManagerSlotKey(manager))
  legacy.slice(0, MIN_MANAGER_SLOTS).forEach((name, index) => {
    map.set(name, managerSlotKey(index))
  })
  return map
}

/** Build four fixed slots with names from settings or existing portfolio managers. */
export function managerSlotsFromPortfolio(
  buildings: Building[],
  managerRenames: Record<string, string> = {},
): ManagerSlot[] {
  const legacy = uniqueManagersFromBuildings(buildings).filter((manager) => !isManagerSlotKey(manager))

  return Array.from({ length: MIN_MANAGER_SLOTS }, (_, index) => {
    const key = managerSlotKey(index)
    if (managerRenames[key] !== undefined) {
      return { key, name: managerRenames[key]! }
    }
    return { key, name: legacy[index] ?? '' }
  })
}

export function resolveManagerDisplayName(
  manager: string,
  managerRenames: Record<string, string> = {},
): string {
  if (!manager) return ''
  if (isManagerSlotKey(manager)) {
    const custom = managerRenames[manager]?.trim()
    return custom || manager
  }
  const custom = managerRenames[manager]?.trim()
  return custom || manager
}

export function applyManagerSlots(
  portfolio: PortfolioData,
  slots: ManagerSlot[],
  existingRenames: Record<string, string> = {},
): { portfolio: PortfolioData; changed: boolean; managerRenames: Record<string, string> } {
  const managerRenames = { ...existingRenames }
  let changed = false

  for (const slot of slots) {
    const nextName = slot.name.trim()
    if (managerRenames[slot.key] !== nextName) {
      managerRenames[slot.key] = nextName
      changed = true
    }
  }

  const legacyToSlot = legacyManagerToSlotMap(portfolio.buildings)

  const buildings = portfolio.buildings.map((building) => {
    if (!building.manager) return building
    if (isManagerSlotKey(building.manager)) return building
    const slotKey = legacyToSlot.get(building.manager)
    if (!slotKey || slotKey === building.manager) return building
    changed = true
    return { ...building, manager: slotKey }
  })

  return {
    portfolio: { ...portfolio, buildings },
    changed,
    managerRenames,
  }
}
