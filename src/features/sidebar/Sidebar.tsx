import { useMemo } from 'react'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Select } from '@/components/Select/Select'
import { Chip } from '@/components/Chip/Chip'
import { LAYER_COLORS } from '@/lib/constants'
import { collectFilterOptions } from '@/lib/filters'
import { useFilterStore } from '@/stores/filterStore'
import { useLayerStore } from '@/stores/layerStore'
import { useSelectionStore } from '@/stores/selectionStore'
import type { Building, DqFilterState, LayerKey } from '@/types/domain'
import { AdvancedFilters } from './AdvancedFilters'
import { BuildingList } from './BuildingList'
import { BuildingNotesEditor } from './BuildingNotesEditor'
import { RtuHistogram } from './RtuHistogram'
import { SearchHitNav } from './SearchHitNav'
import { StatsStrip } from './StatsStrip'
import styles from './Sidebar.module.css'

const LAYER_LABELS: Record<LayerKey, string> = {
  rtu: 'RTUs',
  tenants: 'Tenants',
  sprinkler: 'Sprinkler',
  electrical: 'Electrical',
  hydrant: 'Hydrant',
  gas: 'Gas',
}

const DQ_CHIPS: { key: keyof DqFilterState; label: string; variant: 'dq-gps' | 'dq-rtu' | 'dq-vacant' | 'dq-ml' }[] = [
  { key: 'gps', label: '📍 GPS?', variant: 'dq-gps' },
  { key: 'rtu', label: 'RTU ≥19', variant: 'dq-rtu' },
  { key: 'vacant', label: 'Vacant', variant: 'dq-vacant' },
  { key: 'ml', label: 'ML', variant: 'dq-ml' },
]

export interface SidebarProps {
  allBuildings: Building[]
  listBuildings: Building[]
  filteredBuildings: Building[]
}

export function Sidebar({ allBuildings, listBuildings, filteredBuildings }: SidebarProps) {
  const search = useFilterStore((s) => s.search)
  const park = useFilterStore((s) => s.park)
  const cluster = useFilterStore((s) => s.cluster)
  const manager = useFilterStore((s) => s.manager)
  const dq = useFilterStore((s) => s.dq)
  const setSearch = useFilterStore((s) => s.setSearch)
  const setPark = useFilterStore((s) => s.setPark)
  const setCluster = useFilterStore((s) => s.setCluster)
  const setManager = useFilterStore((s) => s.setManager)
  const toggleDqFilter = useFilterStore((s) => s.toggleDqFilter)

  const layers = useLayerStore((s) => s.layers)
  const toggleLayer = useLayerStore((s) => s.toggleLayer)

  const sidebarCollapsed = useSelectionStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSelectionStore((s) => s.toggleSidebar)

  const options = useMemo(() => collectFilterOptions(allBuildings), [allBuildings])

  return (
    <>
      {sidebarCollapsed ? (
        <button type="button" className={styles.pullTab} onClick={toggleSidebar} title="Expand sidebar">
          ▶
        </button>
      ) : null}
      <aside className={`sidebar${sidebarCollapsed ? ` ${styles.sidebarCollapsed}` : ''}`}>
        <div className="sidebar-header" style={{ position: 'relative' }}>
          <button
            type="button"
            id="sidebar-toggle-btn"
            className={styles.collapseBtn}
            onClick={toggleSidebar}
            title="Collapse sidebar"
          >
            ◀
          </button>
          <div className="logo-row">
            <div>
              <div className="logo">QuadReal · Industrial</div>
              <div className="sidebar-title">Building Map Explorer</div>
            </div>
          </div>
          <div className="sidebar-meta" id="portfolio-meta">
            {allBuildings.length} buildings · Ontario
          </div>
        </div>

        <div className="controls">
          <SearchInput value={search} onValueChange={setSearch} id="search" />
          <Select
            id="park-filter"
            options={options.parks.map((p) => ({ value: p, label: p }))}
            value={park}
            onChange={(e) => setPark(e.target.value)}
            placeholder="All portfolios"
          />
          <Select
            id="cluster-filter"
            options={options.clusters.map((c) => ({ value: c, label: c }))}
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
            placeholder="All clusters"
          />
          <Select
            id="manager-filter"
            options={options.managers.map((m) => ({ value: m, label: m }))}
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            placeholder="All managers"
          />
          <div className="result-count" id="result-count">
            {listBuildings.length} buildings
          </div>
        </div>

        <SearchHitNav buildings={filteredBuildings} />
        <BuildingNotesEditor />

        <StatsStrip buildings={filteredBuildings} totalPortfolioCount={allBuildings.length} />
        <RtuHistogram buildings={filteredBuildings} />
        <AdvancedFilters />

        <div className="dq-filter-wrap">
          {DQ_CHIPS.map(({ key, label, variant }) => (
            <Chip
              key={key}
              variant={variant}
              active={dq[key]}
              className={`dq-chip active-${key}`}
              onClick={() => toggleDqFilter(key)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="layer-toggles" id="layer-toggles">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`layer-btn${layers[key] ? ' active' : ''}`}
              data-layer={key}
              onClick={() => toggleLayer(key)}
            >
              <span className="dot" style={{ background: LAYER_COLORS[key].fill }} />
              {LAYER_LABELS[key]}
            </button>
          ))}
        </div>

        <BuildingList buildings={listBuildings} />
      </aside>
    </>
  )
}
