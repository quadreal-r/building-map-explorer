/** Application domain types (normalized from DB rows or legacy JSON). */

export type LayerKey =
  | 'rtu'
  | 'tenants'
  | 'sprinkler'
  | 'electrical'
  | 'hydrant'
  | 'gas'

export type UtilityType =
  | 'Sprinkler Rooms'
  | 'Electrical Rooms'
  | 'Fire Hydrants'
  | 'Natural Gas Shut-Off'

export type AdvFilterValue = 'any' | 'yes' | 'no'

export type CostBasis = 'hyb' | 'std'

export type ImageryModeId = 'google' | 'esri' | 'usgs'

export interface LatLng {
  lat: number
  lng: number
}

export interface Rtu {
  id?: number
  building_id?: number
  name: string
  description: string
  lat: number
  lng: number
  model?: string | null
  serial?: string | null
  make?: string | null
  install_date?: string | null
  install_year?: number | null
  heating_btu?: string | null
  cooling_tons?: number | null
  suite?: string | null
}

export interface Tenant {
  id?: number
  building_id?: number
  name: string
  description: string
  lat: number
  lng: number
}

export interface Building {
  id?: number
  park: string
  address: string
  bu: string
  lat: number
  lng: number
  sqft: string
  cluster: string
  manager: string
  notes?: string | null
  sold?: boolean
  rtus?: Rtu[]
  tenants?: Tenant[]
}

export interface Utility {
  id?: number
  utility_type: UtilityType
  name: string
  description: string
  lat: number
  lng: number
}

export interface Polygon {
  id?: number
  name: string
  description: string
  color: string
  paths: LatLng[]
}

export interface LayerStyle {
  fill: string
  stroke: string
  scale: number
}

export interface AppSettings {
  theme: { name: string }
  managers: string[]
}

export interface AdvFilterState {
  vacant: AdvFilterValue
  rtu: AdvFilterValue
  hasrtu: AdvFilterValue
  ml: AdvFilterValue
}

export interface DqFilterState {
  gps: boolean
  rtu: boolean
  vacant: boolean
  ml: boolean
}

export interface FilterState {
  search: string
  park: string
  cluster: string
  manager: string
  adv: AdvFilterState
  dq: DqFilterState
}

export interface PortfolioData {
  buildings: Building[]
  utilities: Utility[]
  polygons: Polygon[]
}

export interface ImageryMode {
  id: ImageryModeId
  label: string
  color: string
  borderColor: string
}

/** Legacy JSON snapshot shape (nested rtus/tenants use `desc`). */
export interface LegacyRtuJson {
  name: string
  desc: string
  lat: number
  lng: number
}

export interface LegacyTenantJson {
  name: string
  desc?: string
  lat: number
  lng: number
}

export interface LegacyBuildingJson {
  park: string
  address: string
  bu: string
  lat: number
  lng: number
  sqft: string
  cluster: string
  manager: string
  notes?: string
  sold?: boolean
  rtus?: LegacyRtuJson[]
  tenants?: LegacyTenantJson[]
}

export interface LegacyUtilityJson {
  type: UtilityType
  name: string
  desc: string
  lat: number
  lng: number
}

export interface LegacyPolygonJson {
  name: string
  desc: string
  color: string
  paths: LatLng[]
}

export function normalizeLegacyBuilding(raw: LegacyBuildingJson): Building {
  return {
    park: raw.park,
    address: raw.address,
    bu: raw.bu,
    lat: raw.lat,
    lng: raw.lng,
    sqft: raw.sqft,
    cluster: raw.cluster,
    manager: raw.manager,
    notes: raw.notes ?? null,
    sold: raw.sold,
    rtus: (raw.rtus ?? []).map((r) => ({
      name: r.name,
      description: r.desc,
      lat: r.lat,
      lng: r.lng,
    })),
    tenants: (raw.tenants ?? []).map((t) => ({
      name: t.name,
      description: t.desc ?? '',
      lat: t.lat,
      lng: t.lng,
    })),
  }
}

export function normalizeLegacyUtility(raw: LegacyUtilityJson): Utility {
  return {
    utility_type: raw.type,
    name: raw.name,
    description: raw.desc,
    lat: raw.lat,
    lng: raw.lng,
  }
}

export function normalizeLegacyPolygon(raw: LegacyPolygonJson): Polygon {
  return {
    name: raw.name,
    description: raw.desc,
    color: raw.color,
    paths: raw.paths,
  }
}

export const DEFAULT_ADV_FILTERS: AdvFilterState = {
  vacant: 'any',
  rtu: 'any',
  hasrtu: 'any',
  ml: 'any',
}

export const DEFAULT_DQ_FILTERS: DqFilterState = {
  gps: false,
  rtu: false,
  vacant: false,
  ml: false,
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  park: '',
  cluster: '',
  manager: '',
  adv: DEFAULT_ADV_FILTERS,
  dq: DEFAULT_DQ_FILTERS,
}
