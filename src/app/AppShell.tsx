import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { VersionStamp } from '@/components/VersionStamp/VersionStamp'
import { CostBanner } from '@/features/cost-estimator/CostBanner'
import { MapPanel } from '@/features/map/MapPanel'
import { RtuPictureViewer } from '@/features/rtu-pictures/RtuPictureViewer'
import { SettingsModal } from '@/features/settings/SettingsModal'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { useFilteredBuildings } from '@/hooks/useFilteredBuildings'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { RemoteSyncUpdateModal } from '@/features/sync/RemoteSyncUpdateModal'
import { useRemoteSyncUpdateCheck } from '@/hooks/useRemoteSyncUpdateCheck'
import { usePortfolioData, persistPortfolio, type PortfolioData } from '@/hooks/usePortfolioData'
import { loadBundledHiddenRtuPictures } from '@/lib/hiddenRtuPictures'
import { notifyRtuPicturesChanged } from '@/lib/rtuPictures'
import { showToastSuccess } from '@/lib/toast'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './AppShell.module.css'

const EMPTY_PORTFOLIO: PortfolioData = { buildings: [], utilities: [], polygons: [] }

export function AppShell() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = usePortfolioData()
  const [portfolioOverride, setPortfolioOverride] = useState<PortfolioData | null>(null)

  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loadRtuPricing = useRtuPricingStore((s) => s.load)
  const loadRtuSchedule = useRtuScheduleStore((s) => s.load)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const polygonDrawOpen = useUiStore((s) => s.isModalOpen('polygonDraw'))
  const openPolygonDraw = useUiStore((s) => s.openModal)
  const closePolygonDraw = useUiStore((s) => s.closeModal)
  const addMarkerOpen = useUiStore((s) => s.isModalOpen('addMarker'))
  const openAddMarker = useUiStore((s) => s.openModal)
  const closeAddMarker = useUiStore((s) => s.closeModal)
  const rtuPictureViewer = useUiStore((s) => s.rtuPictureViewer)
  const closeRtuPictureViewer = useUiStore((s) => s.closeRtuPictureViewer)
  const setRtuPictureViewerIndex = useUiStore((s) => s.setRtuPictureViewerIndex)
  const updateRtuPictureViewerPictures = useUiStore((s) => s.updateRtuPictureViewerPictures)

  const markSaved = usePortfolioStore((s) => s.markSaved)

  useEffect(() => {
    void loadBundledHiddenRtuPictures().then((changed) => {
      if (changed) notifyRtuPicturesChanged()
    })
    void loadSettings()
    void loadRtuPricing()
    void loadRtuSchedule()
  }, [loadSettings, loadRtuPricing, loadRtuSchedule])

  const portfolio = portfolioOverride ?? data ?? EMPTY_PORTFOLIO

  const { filteredBuildings, listBuildings, costScopeBuildings } = useFilteredBuildings(
    portfolio.buildings,
    portfolio.polygons,
  )

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

  const remoteSync = useRemoteSyncUpdateCheck(portfolio, handlePortfolioImport)
  const {
    open: remoteSyncOpen,
    meta: remoteSyncMeta,
    localSummary: remoteSyncLocalSummary,
    loading: remoteSyncLoading,
    dismiss: dismissRemoteSync,
    loadUpdates: loadRemoteUpdates,
  } = remoteSync

  const handleLoadRemoteUpdates = useCallback(() => {
    void loadRemoteUpdates().then((next) => {
      if (next) showToastSuccess('✓ Loaded latest data from Cloudflare on this PC')
    })
  }, [loadRemoteUpdates])

  const handleAddMarkerClose = useCallback(() => {
    closeAddMarker('addMarker')
  }, [closeAddMarker])

  const handlePolygonDrawClose = useCallback(() => {
    closePolygonDraw('polygonDraw')
  }, [closePolygonDraw])

  if (isLoading && !portfolioOverride) {
    return (
      <div className="app">
        <VersionStamp placement="fixed" />
        <div className={styles.loading}>Loading portfolio…</div>
      </div>
    )
  }

  if (isError && !portfolio.buildings.length) {
    return (
      <div className="app">
        <VersionStamp placement="fixed" />
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
          onPolygonDrawClose={handlePolygonDrawClose}
          addMarkerOpen={addMarkerOpen}
          onAddMarkerClose={handleAddMarkerClose}
        />
        <CostBanner buildings={costScopeBuildings} />
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
      {rtuPictureViewer ? (
        <RtuPictureViewer
          open
          pictures={rtuPictureViewer.pictures}
          index={rtuPictureViewer.index}
          rtuName={rtuPictureViewer.rtuName}
          buildingAddress={rtuPictureViewer.buildingAddress}
          onClose={closeRtuPictureViewer}
          onIndexChange={setRtuPictureViewerIndex}
          onPicturesUpdated={updateRtuPictureViewerPictures}
        />
      ) : null}
      <RemoteSyncUpdateModal
        open={remoteSyncOpen}
        meta={remoteSyncMeta}
        localSummary={remoteSyncLocalSummary}
        loading={remoteSyncLoading}
        onDismiss={dismissRemoteSync}
        onLoadUpdates={handleLoadRemoteUpdates}
      />
    </div>
  )
}
