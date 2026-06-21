import * as XLSX from 'xlsx'
import type { Building, Polygon, PortfolioData, Rtu, Tenant, Utility } from '@/types/domain'
import {
  normalizeLegacyBuilding,
  normalizeLegacyPolygon,
  normalizeLegacyUtility,
  type LegacyBuildingJson,
  type LegacyPolygonJson,
} from '@/types/domain'
import type { RcbComputeResult } from '@/lib/costEstimator'
import { rcbProjection } from '@/lib/costEstimator'

const FMT_COORD = '0.0000000'
const FMT_INT = '#,##0'

const EXPORT_SHEETS = ['Buildings', 'RTUs', 'Tenants', 'Polygons', 'Utilities'] as const

function str(value: unknown): string {
  return String(value ?? '').trim()
}

function flt(value: unknown): number {
  return parseFloat(str(value)) || 0
}

function fmtDate(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${mo[value.getMonth()]} ${String(value.getDate()).padStart(2, '0')}, ${value.getFullYear()}`
  }
  return str(value)
}

function parseInstallFields(desc: string): {
  model: string
  serial: string
  make: string
  installed: string
  heating: string
  cooling: string
} {
  const pick = (re: RegExp) => {
    const m = desc.match(re)
    return m?.[1]?.trim() ?? ''
  }
  return {
    model: pick(/Model[:\s]+([^\r\n]+)/i),
    serial: pick(/Serial[:\s]+([^\r\n]+)/i),
    make: pick(/Make[:\s]+([^\r\n]+)/i),
    installed: pick(/Date Installed[:\s]+([^\r\n]+)/i),
    heating: pick(/Heating(?: Capacity| Data)?[:\s]+([^\r\n]+)/i),
    cooling: pick(/Cooling Capacity[:\s]+([^\r\n]+)/i),
  }
}

function polyCentroid(paths: Polygon['paths']): { lat: number; lng: number } {
  const lats = paths.map((p) => p.lat)
  const lngs = paths.map((p) => p.lng)
  return {
    lat: lats.reduce((a, v) => a + v, 0) / lats.length,
    lng: lngs.reduce((a, v) => a + v, 0) / lngs.length,
  }
}

function nearestBuilding(
  buildings: Building[],
  lat: number,
  lng: number,
): Building | null {
  let best: Building | null = null
  let bestDist = Infinity
  for (const b of buildings) {
    if (!b.lat || !b.lng) continue
    const d = (b.lat - lat) ** 2 + (b.lng - lng) ** 2
    if (d < bestDist) {
      bestDist = d
      best = b
    }
  }
  return best
}

function buildSheet(
  headers: string[],
  rows: unknown[][],
  colWidths: number[],
  numFmtMap: Record<number, string> = {},
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = colWidths.map((w) => ({ wch: w }))
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  }

  const ref = ws['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    for (let r = 1; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[addr]
        if (!cell) continue
        const fmt = numFmtMap[c]
        if (fmt) cell.z = fmt
      }
    }
    const lastCol = XLSX.utils.encode_col(range.e.c)
    const lastRow = range.e.r + 1
    ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` }
  }

  return ws
}

/** Export portfolio data to an Excel workbook (legacy-compatible sheets). */
export function exportPortfolioExcel(data: PortfolioData, filename = 'QuadReal_Industrial_Portfolio.xlsx'): void {
  const { buildings, utilities, polygons } = data

  const buildingsRows: unknown[][] = []
  const rtusRows: unknown[][] = []
  const tenantsRows: unknown[][] = []

  for (const b of buildings) {
    buildingsRows.push([
      b.address,
      b.bu ?? '',
      b.park,
      b.cluster ?? '',
      b.manager ?? '',
      b.sqft ?? '',
      b.sold ? 'SOLD' : 'Active',
      b.rtus?.length ?? 0,
      b.tenants?.length ?? 0,
      parseFloat(b.lat.toFixed(7)),
      parseFloat(b.lng.toFixed(7)),
    ])

    for (const r of b.rtus ?? []) {
      const fields = parseInstallFields(r.description)
      rtusRows.push([
        b.address,
        b.park,
        b.cluster ?? '',
        b.manager ?? '',
        r.name,
        fields.model,
        fields.serial,
        fields.make,
        fields.installed,
        fields.heating,
        fields.cooling,
        parseFloat(r.lat.toFixed(7)),
        parseFloat(r.lng.toFixed(7)),
        r.description.replace(/\r\n/g, ' | '),
      ])
    }

    for (const t of b.tenants ?? []) {
      tenantsRows.push([
        b.address,
        b.park,
        b.cluster ?? '',
        b.manager ?? '',
        t.name,
        t.description,
        parseFloat(t.lat.toFixed(7)),
        parseFloat(t.lng.toFixed(7)),
      ])
    }
  }

  const polygonsRows = polygons.map((p) => {
    const c = polyCentroid(p.paths)
    const b = nearestBuilding(buildings, c.lat, c.lng)
    return [
      b?.address ?? '',
      b?.park ?? '',
      b?.cluster ?? '',
      b?.manager ?? '',
      p.name,
      p.description,
      p.paths.length,
      p.color,
      JSON.stringify(p.paths),
      parseFloat(c.lat.toFixed(7)),
      parseFloat(c.lng.toFixed(7)),
    ]
  })

  const utilitiesRows = utilities.map((u) => [
    u.utility_type,
    u.name,
    u.description,
    parseFloat(u.lat.toFixed(7)),
    parseFloat(u.lng.toFixed(7)),
  ])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        'Building Address',
        'BU #',
        'Portfolio',
        'Cluster',
        'Manager',
        'Sq Ft',
        'Status',
        'RTU Count',
        'Tenant Count',
        'Latitude',
        'Longitude',
      ],
      buildingsRows,
      [32, 12, 28, 24, 18, 10, 12, 11, 13, 14, 14],
      { 5: FMT_INT, 7: FMT_INT, 8: FMT_INT, 9: FMT_COORD, 10: FMT_COORD },
    ),
    'Buildings',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        'Building Address',
        'Portfolio',
        'Cluster',
        'Manager',
        'RTU Name',
        'Model',
        'Serial',
        'Make',
        'Date Installed',
        'Heating Capacity',
        'Cooling Capacity',
        'Latitude',
        'Longitude',
        'Notes',
      ],
      rtusRows,
      [32, 28, 20, 18, 14, 28, 16, 12, 16, 22, 22, 14, 14, 97],
      { 11: FMT_COORD, 12: FMT_COORD },
    ),
    'RTUs',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        'Building Address',
        'Portfolio',
        'Cluster',
        'Manager',
        'Suite',
        'Tenant Name',
        'Latitude',
        'Longitude',
      ],
      tenantsRows,
      [32, 28, 20, 18, 16, 36, 14, 14],
      { 6: FMT_COORD, 7: FMT_COORD },
    ),
    'Tenants',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        'Building Address',
        'Portfolio',
        'Cluster',
        'Manager',
        'Suite',
        'Tenant Name',
        'Point Count',
        'Color',
        'Paths (JSON)',
        'Centroid Lat',
        'Centroid Lng',
      ],
      polygonsRows,
      [32, 12, 28, 16, 36, 36, 11, 8, 14, 14, 14],
      { 9: FMT_COORD, 10: FMT_COORD },
    ),
    'Polygons',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      ['Type', 'Name', 'Description', 'Latitude', 'Longitude'],
      utilitiesRows,
      [20, 38, 40, 14, 14],
      { 3: FMT_COORD, 4: FMT_COORD },
    ),
    'Utilities',
  )

  XLSX.writeFile(wb, filename)
}

function sheetToObjects(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw = XLSX.utils.sheet_to_json<(string | number | Date)[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  })
  if (raw.length < 2) return []
  const headers = raw[0]!.map((h) => str(h))
  return raw
    .slice(1)
    .filter((row) => row.some((v) => v !== ''))
    .map((row) => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? row[i] : ''
      })
      return obj
    })
}

/** Parse an imported workbook into normalized portfolio data. */
export function importPortfolioExcel(buffer: ArrayBuffer): PortfolioData {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  for (const name of EXPORT_SHEETS) {
    if (!wb.SheetNames.includes(name)) {
      throw new Error(`Missing sheet: "${name}". Please use the exported file format.`)
    }
  }

  const buildingRows = sheetToObjects(wb.Sheets['Buildings']!)
  const rtuRows = sheetToObjects(wb.Sheets['RTUs']!)
  const tenantRows = sheetToObjects(wb.Sheets['Tenants']!)
  const polygonRows = sheetToObjects(wb.Sheets['Polygons']!)
  const utilityRows = sheetToObjects(wb.Sheets['Utilities']!)

  const rtusByAddress = new Map<string, Rtu[]>()
  for (const row of rtuRows) {
    const address = str(row['Building Address'])
    if (!address) continue
    const descParts = [
      `Building: ${address}`,
      'System: Roof Top Units',
      `Description: ${str(row['RTU Name'])}`,
      row['Model'] ? `Model: ${str(row['Model'])}` : '',
      row['Serial'] ? `Serial: ${str(row['Serial'])}` : '',
      row['Make'] ? `Make: ${str(row['Make'])}` : '',
      row['Date Installed'] ? `Date Installed: ${fmtDate(row['Date Installed'])}` : '',
      row['Heating Capacity'] ? `Heating Capacity: ${str(row['Heating Capacity'])}` : '',
      row['Cooling Capacity'] ? `Cooling Capacity: ${str(row['Cooling Capacity'])}` : '',
      row['Notes'] ? str(row['Notes']).replace(/\s*\|\s*/g, '\r\n') : '',
    ].filter(Boolean)

    const rtu: Rtu = {
      name: str(row['RTU Name']),
      description: descParts.join('\r\n'),
      lat: flt(row['Latitude']),
      lng: flt(row['Longitude']),
    }
    const list = rtusByAddress.get(address) ?? []
    list.push(rtu)
    rtusByAddress.set(address, list)
  }

  const tenantsByAddress = new Map<string, Tenant[]>()
  for (const row of tenantRows) {
    const address = str(row['Building Address'])
    if (!address) continue
    const tenant: Tenant = {
      name: str(row['Suite']) || str(row['Tenant Name']) || 'Suite',
      description: str(row['Tenant Name']),
      lat: flt(row['Latitude']),
      lng: flt(row['Longitude']),
    }
    const list = tenantsByAddress.get(address) ?? []
    list.push(tenant)
    tenantsByAddress.set(address, list)
  }

  const buildings: Building[] = buildingRows.map((row) => {
    const address = str(row['Building Address'])
    const legacy: LegacyBuildingJson = {
      park: str(row['Portfolio']),
      address,
      bu: str(row['BU #']),
      lat: flt(row['Latitude']),
      lng: flt(row['Longitude']),
      sqft: str(row['Sq Ft']),
      cluster: str(row['Cluster']),
      manager: str(row['Manager']),
      sold: str(row['Status']).toUpperCase() === 'SOLD',
      rtus: (rtusByAddress.get(address) ?? []).map((r) => ({
        name: r.name,
        desc: r.description,
        lat: r.lat,
        lng: r.lng,
      })),
      tenants: (tenantsByAddress.get(address) ?? []).map((t) => ({
        name: t.name,
        desc: t.description,
        lat: t.lat,
        lng: t.lng,
      })),
    }
    return normalizeLegacyBuilding(legacy)
  })

  const polygons: Polygon[] = polygonRows
    .map((row) => {
      let paths: Polygon['paths']
      try {
        paths = JSON.parse(str(row['Paths (JSON)'])) as Polygon['paths']
      } catch {
        paths = []
      }
      const legacy: LegacyPolygonJson = {
        name: str(row['Suite']) || str(row['Tenant Name']) || 'Polygon',
        desc: str(row['Tenant Name']),
        color: str(row['Color']) || '#60a5fa',
        paths,
      }
      return normalizeLegacyPolygon(legacy)
    })
    .filter((p) => p.paths.length >= 3)

  const utilities: Utility[] = utilityRows.map((row) =>
    normalizeLegacyUtility({
      type: str(row['Type']) as Utility['utility_type'],
      name: str(row['Name']),
      desc: str(row['Description']),
      lat: flt(row['Latitude']),
      lng: flt(row['Longitude']),
    }),
  )

  return { buildings, utilities, polygons }
}

/** Export RTU replacement cost estimate (RCB) to Excel. */
export function exportRcbExcel(result: RcbComputeResult, scopeLabel: string): void {
  const T = result.totals
  const basisLbl =
    result.basis === 'hyb'
      ? 'Hybrid Lennox (all-in installed)'
      : 'Standard Efficiency / Lennox Xion (all-in installed)'
  const today = new Date().toISOString().slice(0, 10)

  const sum: unknown[][] = [
    ['RTU Replacement Cost Estimate'],
    ['Generated', today],
    ['Selection (scope)', scopeLabel],
    ['Age threshold', `≥ ${result.threshold} years (by install date)`],
    ['Pricing basis', basisLbl],
    ['Replacement year', result.year],
    [],
    ['Buildings with qualifying RTUs', T.bldgCount],
    ['Qualifying RTUs', T.units],
    ['Total cooling tonnage', Math.round(T.tons * 10) / 10],
    ['Average cost per unit', T.units ? Math.round(T.cost / T.units) : 0],
    ['TOTAL ESTIMATED REPLACEMENT COST (CAD)', Math.round(T.cost)],
    [],
    ['Aged units excluded (no rated tonnage)', T.excludedOld],
    [],
    [
      'Note',
      'Budgetary estimate only — not a vendor quote. Tonnage rounded up to nearest supplied tier (2–50 ton).',
    ],
  ]

  const bldg: unknown[][] = [
    [
      'Building Address',
      'Portfolio',
      'Cluster',
      'Manager',
      'Qualifying RTUs',
      'Total Tons',
      'Est. Replacement Cost (CAD)',
    ],
  ]
  for (const r of [...result.perBldg].sort((a, b) => b.cost - a.cost)) {
    bldg.push([
      r.address,
      r.park,
      r.cluster,
      r.manager,
      r.units,
      Math.round(r.tons * 10) / 10,
      Math.round(r.cost),
    ])
  }
  bldg.push(['TOTAL', '', '', '', T.units, Math.round(T.tons * 10) / 10, Math.round(T.cost)])

  const li: unknown[][] = [
    [
      'Building Address',
      'Portfolio',
      'Cluster',
      'Manager',
      'RTU',
      'Install Year',
      'Age (yr)',
      'Cooling Tons',
      'Priced Tier',
      `Unit Cost ${result.year} (CAD)`,
    ],
  ]
  for (const r of [...result.lineItems].sort((a, b) =>
    a.address < b.address ? -1 : a.address > b.address ? 1 : a.rtu.localeCompare(b.rtu),
  )) {
    li.push([
      r.address,
      r.park,
      r.cluster,
      r.manager,
      r.rtu,
      r.year,
      r.age,
      r.tons,
      r.tier,
      Math.round(r.cost),
    ])
  }

  const tier: unknown[][] = [
    ['Tonnage Tier', `Unit Cost ${result.year} (CAD)`, 'Qty', 'Extended Cost (CAD)'],
  ]
  for (const kk of Object.keys(result.tiers)
    .map(Number)
    .sort((a, b) => a - b)) {
    const t = result.tiers[String(kk)]!
    tier.push([t.label, Math.round(t.unit), t.qty, Math.round(t.ext)])
  }
  tier.push(['TOTAL', '', T.units, Math.round(T.cost)])

  const pj = rcbProjection(result)
  const proj: unknown[][] = [
    ['Replacement Year', 'Est. Total Cost (CAD)', `vs ${pj[0]?.year ?? ''} (CAD)`],
  ]
  for (const p of pj) {
    proj.push([p.year, Math.round(p.total), Math.round(p.total - (pj[0]?.total ?? 0))])
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bldg), 'By Building')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(li), 'By RTU')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tier), 'By Tonnage Tier')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(proj), 'Projection by Year')

  const safe = (scopeLabel === 'All buildings' ? 'All' : scopeLabel)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  XLSX.writeFile(wb, `RTU_Replacement_Estimate_${safe}_${result.year}_${today}.xlsx`)
}
