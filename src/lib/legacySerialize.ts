import type {
  Building,
  LegacyBuildingJson,
  LegacyPolygonJson,
  LegacyUtilityJson,
  Polygon,
  PortfolioData,
  Utility,
} from '@/types/domain'

export function serializeBuilding(b: Building): LegacyBuildingJson {
  return {
    park: b.park,
    address: b.address,
    bu: b.bu,
    lat: b.lat,
    lng: b.lng,
    sqft: b.sqft,
    cluster: b.cluster,
    manager: b.manager,
    notes: b.notes ?? undefined,
    sold: b.sold,
    rtus: (b.rtus ?? []).map((r) => ({
      name: r.name,
      desc: r.description,
      lat: r.lat,
      lng: r.lng,
    })),
    tenants: (b.tenants ?? []).map((t) => ({
      name: t.name,
      desc: t.description,
      lat: t.lat,
      lng: t.lng,
    })),
  }
}

export function serializeUtility(u: Utility): LegacyUtilityJson {
  return {
    type: u.utility_type,
    name: u.name,
    desc: u.description,
    lat: u.lat,
    lng: u.lng,
  }
}

export function serializePolygon(p: Polygon): LegacyPolygonJson {
  return {
    name: p.name,
    desc: p.description,
    color: p.color,
    paths: p.paths,
  }
}

export function serializePortfolio(portfolio: PortfolioData) {
  return {
    buildings: portfolio.buildings.map(serializeBuilding),
    utilities: portfolio.utilities.map(serializeUtility),
    polygons: portfolio.polygons.map(serializePolygon),
  }
}
