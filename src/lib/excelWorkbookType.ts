/** Detect portfolio export vs Capital RTU Replacement workbook from sheet names. */
export type ExcelWorkbookKind = 'portfolio' | 'capital'

export function detectExcelWorkbookKind(sheetNames: string[]): ExcelWorkbookKind {
  const names = sheetNames.map((name) => name.trim())
  const hasBuildings = names.includes('Buildings')
  const hasRtus = names.includes('RTUs')
  const hasUtilities = names.includes('Utilities')
  const hasPolygons = names.some(
    (name) => /^tenant polygons$/i.test(name) || name === 'Polygons',
  )

  if (hasBuildings && hasRtus && hasUtilities && hasPolygons) {
    return 'portfolio'
  }

  const hasEquipment = names.some((name) => /^equipment$/i.test(name))
  const hasPricing = names.some((name) => /^rtu pricing$/i.test(name))

  if (hasEquipment || hasPricing) {
    return 'capital'
  }

  throw new Error(
    'Unrecognized workbook. Use the exported portfolio Excel (Buildings, RTUs, Tenant Polygons, Utilities) or the Capital RTU Replacement workbook (Equipment and RTU Pricing sheets).',
  )
}
