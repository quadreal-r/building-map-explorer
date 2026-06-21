import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoginModal } from '@/features/auth/LoginModal'
import { CostBanner } from '@/features/cost-estimator/CostBanner'
import { MapPanel } from '@/features/map/MapPanel'
import { SettingsModal } from '@/features/settings/SettingsModal'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { useFilteredBuildings } from '@/hooks/useFilteredBuildings'
import { usePortfolioData, type PortfolioData } from '@/hooks/usePortfolioData'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './AppShell.module.css'

const EMPTY_PORTFOLIO: PortfolioData = { buildings: [], utilities: [], polygons: [] }

export function AppShell() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = usePortfolioData()
  const [portfolioOverride, setPortfolioOverride] = useState<PortfolioData | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)

  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const polygonDrawOpen = useUiStore((s) => s.isModalOpen('polygonDraw'))
  const openPolygonDraw = useUiStore((s) => s.openModal)
  const closePolygonDraw = useUiStore((s) => s.closeModal)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const portfolio = portfolioOverride ?? data ?? EMPTY_PORTFOLIO

  const { filteredBuildings, listBuildings } = useFilteredBuildings(portfolio.buildings)

  const handlePortfolioImport = (next: PortfolioData) => {
    setPortfolioOverride(next)
    queryClient.setQueryData(['portfolio'], next)
  }

  const handlePortfolioPatch = (next: PortfolioData) => {
    setPortfolioOverride(next)
    queryClient.setQueryData(['portfolio'], next)
  }

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
      />
      <div className={styles.mainColumn}>
        <MapPanel
          portfolio={portfolio}
          mapBuildings={filteredBuildings}
          onPortfolioImport={handlePortfolioImport}
          onPortfolioPatch={handlePortfolioPatch}
          polygonDrawOpen={polygonDrawOpen}
          onPolygonDrawClose={() => closePolygonDraw('polygonDraw')}
        />
        <CostBanner buildings={filteredBuildings} />
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        portfolio={portfolio}
        onImport={handlePortfolioImport}
        onOpenLogin={() => {
          closeSettings()
          setLoginOpen(true)
        }}
        onOpenPolygonDraw={() => {
          closeSettings()
          openPolygonDraw('polygonDraw')
        }}
      />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
