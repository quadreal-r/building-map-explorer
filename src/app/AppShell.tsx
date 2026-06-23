import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CostBanner } from '@/features/cost-estimator/CostBanner'
import { MapPanel } from '@/features/map/MapPanel'
import { SettingsModal } from '@/features/settings/SettingsModal'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { useFilteredBuildings } from '@/hooks/useFilteredBuildings'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePortfolioData, persistPortfolio, type PortfolioData } from '@/hooks/usePortfolioData'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './AppShell.module.css'

const EMPTY_PORTFOLIO: PortfolioData = { buildings: [], utilities: [], polygons: [] }

export function AppShell() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = usePortfolioData()
  const [portfolioOverride, setPortfolioOverride] = useState<PortfolioData | null>(null)

  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const polygonDrawOpen = useUiStore((s) => s.isModalOpen('polygonDraw'))
  const openPolygonDraw = useUiStore((s) => s.openModal)
  const closePolygonDraw = useUiStore((s) => s.closeModal)
  const addMarkerOpen = useUiStore((s) => s.isModalOpen('addMarker'))
  const openAddMarker = useUiStore((s) => s.openModal)
  const closeAddMarker = useUiStore((s) => s.closeModal)

  const markSaved = usePortfolioStore((s) => s.markSaved)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const portfolio = portfolioOverride ?? data ?? EMPTY_PORTFOLIO

  const { filteredBuildings, listBuildings } = useFilteredBuildings(portfolio.buildings)

  useKeyboardShortcuts({ portfolio, onSaved: markSaved })

  const handlePortfolioImport = useCallback(
    (next: PortfolioData) => {
      persistPortfolio(next)
      setPortfolioOverride(next)
      queryClient.setQueryData(['portfolio'], next)
      usePortfolioStore.getState().patchPortfolio(next)
    },
    [queryClient],
  )

  const handlePortfolioPatch = useCallback(
    (next: PortfolioData) => {
      persistPortfolio(next)
      setPortfolioOverride(next)
      queryClient.setQueryData(['portfolio'], next)
      usePortfolioStore.getState().patchPortfolio(next)
    },
    [queryClient],
  )

  if (isLoading && !portfolioOverride) {
    return (
      <div className="app">
        <div className={styles.loading}>Loading portfolio…</div>
      </div>
    )
  }

  if (isError && !portfolio.buildings.length) {
    return (
      <div className="app">
        <div className={styles.loading}>Failed to load portfolio data.</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        allBuildings={portfolio.buildings}
        listBuildings={listBuildings}
        filteredBuildings={filteredBuildings}
        portfolio={portfolio}
        onNotesChange={handlePortfolioPatch}
      />
      <div className={styles.mainColumn}>
        <MapPanel
          portfolio={portfolio}
          mapBuildings={filteredBuildings}
          onPortfolioImport={handlePortfolioImport}
          onPortfolioPatch={handlePortfolioPatch}
          polygonDrawOpen={polygonDrawOpen}
          onPolygonDrawClose={() => closePolygonDraw('polygonDraw')}
          addMarkerOpen={addMarkerOpen}
          onAddMarkerClose={() => closeAddMarker('addMarker')}
        />
        <CostBanner buildings={filteredBuildings} />
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        portfolio={portfolio}
        onImport={handlePortfolioImport}
        onPortfolioPatch={handlePortfolioPatch}
        onOpenPolygonDraw={() => {
          closeSettings()
          openPolygonDraw('polygonDraw')
        }}
        onOpenAddMarker={() => {
          closeSettings()
          openAddMarker('addMarker')
        }}
        onSaved={markSaved}
      />
    </div>
  )
}
