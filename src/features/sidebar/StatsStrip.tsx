import { useMemo } from 'react'
import { hasVacant, mlCount } from '@/lib/dataQuality'
import { formatTotalSqft } from '@/lib/format'
import { buildPolygonBuildingIndex, polygonsForBuilding } from '@/lib/polygonBuildings'
import { getRtuAge, oldestRtuAge } from '@/lib/rtu'
import type { Building, Polygon } from '@/types/domain'

export interface StatsStripProps {
  buildings: Building[]
  polygons: Polygon[]
  totalPortfolioCount: number
}

export function StatsStrip({ buildings, polygons, totalPortfolioCount }: StatsStripProps) {
  const polygonIndex = useMemo(
    () => buildPolygonBuildingIndex(buildings, polygons),
    [buildings, polygons],
  )

  const stats = useMemo(() => {
    let totalSqft = 0
    let totalRtus = 0
    let agingRtus = 0
    let mlBuildings = 0
    let vacantCount = 0
    const ageBuckets = [0, 0, 0, 0]

    for (const b of buildings) {
      const sq = b.sqft ? parseInt(String(b.sqft).replace(/,/g, ''), 10) : NaN
      if (!Number.isNaN(sq)) totalSqft += sq
      totalRtus += b.rtus?.length ?? 0
      if (mlCount(b)) mlBuildings++
      if (hasVacant(b, polygonsForBuilding(polygonIndex, b.address))) vacantCount++

      for (const r of b.rtus ?? []) {
        const age = getRtuAge(r)
        if (age == null) continue
        if (age >= 20) {
          agingRtus++
          ageBuckets[3]!++
        } else if (age >= 16) ageBuckets[2]!++
        else if (age >= 11) ageBuckets[1]!++
        else ageBuckets[0]!++
      }
    }

    const parks = new Set(buildings.map((b) => b.park)).size
    const clusters = new Set(buildings.map((b) => b.cluster).filter(Boolean)).size
    const avgSqft = buildings.length ? Math.round(totalSqft / buildings.length) : 0
    const avgRtu = buildings.length ? (totalRtus / buildings.length).toFixed(1) : '0'
    const oldPct = totalRtus ? `${Math.round((agingRtus / totalRtus) * 100)}%` : '0%'
    const oldBldgs = buildings.filter((b) => oldestRtuAge(b) >= 20).length
    const totalMl = buildings.reduce((s, b) => s + mlCount(b), 0)
    const vacPct = buildings.length
      ? `${Math.round((vacantCount / buildings.length) * 100)}%`
      : '0%'

    return {
      totalBuildings: buildings.length,
      totalSqft,
      totalRtus,
      agingRtus,
      mlBuildings,
      vacantCount,
      ageBuckets,
      parks,
      clusters,
      avgSqft,
      avgRtu,
      oldPct,
      oldBldgs,
      totalMl,
      vacPct,
    }
  }, [buildings, polygonIndex])

  const sqftDisplay =
    stats.totalSqft >= 1_000_000
      ? `${(stats.totalSqft / 1_000_000).toFixed(1)}M`
      : stats.totalSqft.toLocaleString('en-CA')

  const avgSqftStr =
    stats.avgSqft >= 1000 ? `${Math.round(stats.avgSqft / 1000)}K sf` : `${stats.avgSqft} sf`

  return (
    <div className="stats-strip" id="stats-strip">
      <div className="stat-item" id="stat-buildings">
        <span className="stat-val">{stats.totalBuildings}</span>
        <span className="stat-lbl">Buildings</span>
        <div className="stat-tip" id="tip-buildings">
          <div className="stat-tip-row">
            <span>Shown / Total</span>
            <span id="tip-buildings-val">
              {stats.totalBuildings} / {totalPortfolioCount}
            </span>
          </div>
          <div className="stat-tip-row">
            <span>Parks</span>
            <span id="tip-buildings-parks">{stats.parks}</span>
          </div>
          <div className="stat-tip-row">
            <span>Clusters</span>
            <span id="tip-buildings-clusters">{stats.clusters}</span>
          </div>
        </div>
      </div>
      <div className="stat-item" id="stat-sqft">
        <span className="stat-val">{sqftDisplay}</span>
        <span className="stat-lbl">Sq Ft</span>
        <div className="stat-tip">
          <div className="stat-tip-row">
            <span>Total</span>
            <span id="tip-sqft-val">{formatTotalSqft(stats.totalSqft)}</span>
          </div>
          <div className="stat-tip-row">
            <span>Avg / bldg</span>
            <span id="tip-sqft-avg">{avgSqftStr}</span>
          </div>
        </div>
      </div>
      <div className="stat-item" id="stat-rtus">
        <span className="stat-val">{stats.totalRtus}</span>
        <span className="stat-lbl">RTUs</span>
        <div className="stat-tip">
          <div className="stat-tip-row">
            <span>Total</span>
            <span id="tip-rtus-total">{stats.totalRtus}</span>
          </div>
          <div className="stat-tip-row">
            <span>Avg / bldg</span>
            <span id="tip-rtus-avg">{stats.avgRtu}</span>
          </div>
          <div className="stat-tip-row">
            <span>0–10 yr</span>
            <span id="tip-rtus-a">{stats.ageBuckets[0]}</span>
          </div>
          <div className="stat-tip-row">
            <span>11–15 yr</span>
            <span id="tip-rtus-b">{stats.ageBuckets[1]}</span>
          </div>
          <div className="stat-tip-row">
            <span>16–19 yr</span>
            <span id="tip-rtus-c">{stats.ageBuckets[2]}</span>
          </div>
          <div className="stat-tip-row">
            <span>20+ yr</span>
            <span id="tip-rtus-d">{stats.ageBuckets[3]}</span>
          </div>
        </div>
      </div>
      <div className={`stat-item${stats.agingRtus > 0 ? ' warn' : ''}`} id="stat-old">
        <span className="stat-val">{stats.agingRtus}</span>
        <span className="stat-lbl">20+ yr</span>
        <div className="stat-tip">
          <div className="stat-tip-row">
            <span>RTUs ≥20 yr</span>
            <span id="tip-old-count">{stats.agingRtus}</span>
          </div>
          <div className="stat-tip-row">
            <span>% of RTUs</span>
            <span id="tip-old-pct">{stats.oldPct}</span>
          </div>
          <div className="stat-tip-row">
            <span>Buildings</span>
            <span id="tip-old-bldgs">{stats.oldBldgs}</span>
          </div>
        </div>
      </div>
      <div className={`stat-item${stats.mlBuildings > 0 ? ' bad' : ''}`} id="stat-ml">
        <span className="stat-val">{stats.mlBuildings}</span>
        <span className="stat-lbl">ML</span>
        <div className="stat-tip">
          <div className="stat-tip-row">
            <span>Buildings</span>
            <span id="tip-ml-bldgs">{stats.mlBuildings}</span>
          </div>
          <div className="stat-tip-row">
            <span>Total ML RTUs</span>
            <span id="tip-ml-count">{stats.totalMl}</span>
          </div>
        </div>
      </div>
      <div className={`stat-item${stats.vacantCount > 0 ? ' warn' : ''}`} id="stat-vacant">
        <span className="stat-val">{stats.vacantCount}</span>
        <span className="stat-lbl">Vacant</span>
        <div className="stat-tip">
          <div className="stat-tip-row">
            <span>Buildings</span>
            <span id="tip-vacant-bldgs">{stats.vacantCount}</span>
          </div>
          <div className="stat-tip-row">
            <span>% of shown</span>
            <span id="tip-vacant-pct">{stats.vacPct}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
