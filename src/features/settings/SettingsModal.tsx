import { useState, useCallback, useMemo } from 'react'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { RtuPictureGpsAssign } from '@/features/settings/RtuPictureGpsAssign'
import {
  GitHubDeploySyncFields,
  GitHubDeploySyncButton,
} from '@/features/settings/GitHubDeploySync'
import { useGitHubDeploySync } from '@/features/settings/useGitHubDeploySync'
import { RtuPricingSettings } from '@/features/settings/RtuPricingSettings'
import { RtuEditorSettings } from '@/features/settings/RtuEditorSettings'
import { SettingsSectionLabel } from '@/features/settings/SettingsSectionLabel'
import { SettingsToolButton } from '@/features/settings/SettingsToolButton'
import { Modal } from '@/components/Modal/Modal'
import { APP_THEMES } from '@/lib/themes'
import selectStyles from '@/components/Select/Select.module.css'
import {
  applyManagerSlots,
  managerSlotLabel,
  managerSlotsFromPortfolio,
  type ManagerSlot,
} from '@/lib/managerNames'
import { saveDatabase } from '@/lib/saveDatabase'
import { exportDeployBundleToDisk } from '@/lib/deployBundle'
import { clearLocalRtuPictureStorage, clearStaleLocalRtuPictures } from '@/lib/rtuPictures'
import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'
import { downloadSyncStatusExcel } from '@/lib/syncStatusReport'
import { usesRemoteJsonData } from '@/lib/jsonDataUrls'
import { pullRemoteUpdatesToLocal } from '@/lib/pullRemoteUpdates'
import { collectUnsyncedChangesSummary } from '@/lib/unsyncedChanges'
import { confirm } from '@/stores/confirmStore'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'
import styles from './SettingsModal.module.css'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  portfolio: PortfolioData
  onImport: (data: PortfolioData) => void
  onPortfolioPatch: (data: PortfolioData) => void
  onOpenPolygonDraw: () => void
  onOpenAddMarker: () => void
  onSaved?: () => void
}

interface SettingsFormProps {
  open: boolean
  portfolio: PortfolioData
  themeIndex: number
  onClose: () => void
  onImport: (data: PortfolioData) => void
  onPortfolioPatch: (data: PortfolioData) => void
  onOpenPolygonDraw: () => void
  onOpenAddMarker: () => void
  onSaved?: () => void
}

function PropertyManagerNamesEditor({
  portfolio,
  onPortfolioPatch,
}: {
  portfolio: PortfolioData
  onPortfolioPatch: (data: PortfolioData) => void
}) {
  const managerRenames = useSettingsStore((s) => s.managerRenames)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [slots, setSlots] = useState<ManagerSlot[]>(() =>
    managerSlotsFromPortfolio(portfolio.buildings, managerRenames),
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [draftName, setDraftName] = useState(() => slots[0]?.name ?? '')

  const commitDraft = (index: number, name: string, currentSlots: ManagerSlot[]): ManagerSlot[] => {
    if (index < 0 || index >= currentSlots.length) return currentSlots
    const next = [...currentSlots]
    next[index] = { ...next[index]!, name }
    return next
  }

  const handleSlotPickerChange = (value: string) => {
    const nextIndex = Number.parseInt(value, 10)
    if (Number.isNaN(nextIndex)) return
    const committed = commitDraft(selectedIndex, draftName, slots)
    setSlots(committed)
    setSelectedIndex(nextIndex)
    setDraftName(committed[nextIndex]?.name ?? '')
  }

  const handleApply = () => {
    const committed = commitDraft(selectedIndex, draftName, slots)
    const { portfolio: nextPortfolio, changed, managerRenames: nextRenames } = applyManagerSlots(
      portfolio,
      committed,
      managerRenames,
    )

    useSettingsStore.setState({ managerRenames: nextRenames })
    void saveSettings()

    if (changed) {
      onPortfolioPatch(nextPortfolio)
      const nextSlots = managerSlotsFromPortfolio(nextPortfolio.buildings, nextRenames)
      setSlots(nextSlots)
      setSelectedIndex(Math.min(selectedIndex, nextSlots.length - 1))
      setDraftName(nextSlots[Math.min(selectedIndex, nextSlots.length - 1)]?.name ?? '')
      showToastSuccess('✓ Manager names updated — save to HTML to keep changes.')
      return
    }

    showToastSuccess('✓ Manager names saved.')
  }

  return (
    <div className={styles.mgrEditor}>
      <label className={styles.mgrFieldLabel} htmlFor="manager-slot-picker">
        Manager slot
      </label>
      <select
        id="manager-slot-picker"
        className={selectStyles.select}
        value={String(selectedIndex)}
        onChange={(e) => handleSlotPickerChange(e.target.value)}
        aria-label="Select manager slot"
      >
        {slots.map((slot, index) => (
          <option key={slot.key} value={String(index)}>
            {managerSlotLabel(index)}
          </option>
        ))}
      </select>
      <label className={styles.mgrFieldLabel} htmlFor="manager-display-name">
        Display name
      </label>
      <input
        id="manager-display-name"
        type="text"
        className={styles.mgrInput}
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        placeholder={managerSlotLabel(selectedIndex)}
        aria-label={`Display name for ${managerSlotLabel(selectedIndex)}`}
      />
      <button type="button" className={styles.mgrApplyBtn} onClick={handleApply}>
        Apply manager names
      </button>
    </div>
  )
}

function SettingsForm({
  open,
  portfolio,
  themeIndex,
  onClose,
  onImport,
  onPortfolioPatch,
  onOpenPolygonDraw,
  onOpenAddMarker,
  onSaved,
}: SettingsFormProps) {
  const setThemeIndex = useSettingsStore((s) => s.setThemeIndex)
  const applyTheme = useSettingsStore((s) => s.applyTheme)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const dragMode = useSelectionStore((s) => s.dragMode)
  const dragSelectedCount = useSelectionStore((s) => s.dragSelectedKeys.length)
  const setDragMode = useSelectionStore((s) => s.setDragMode)
  const clearDragSelect = useSelectionStore((s) => s.clearDragSelect)

  const [uploadBusy, setUploadBusy] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [rtuEditorOpen, setRtuEditorOpen] = useState(false)

  const githubSync = useGitHubDeploySync({
    portfolio,
    disabled: uploadBusy,
    onBusyChange: setUploadBusy,
  })

  const managerEditorKey = useMemo(() => {
    if (!open) return 'closed'
    const renames = useSettingsStore.getState().managerRenames
    return managerSlotsFromPortfolio(portfolio.buildings, renames)
      .map((slot) => `${slot.key}\t${slot.name}`)
      .join('|')
  }, [open, portfolio.buildings])

  const handleClose = useCallback(() => {
    if (uploadBusy) return
    onClose()
  }, [onClose, uploadBusy])

  const handleThemeSelect = (index: number) => {
    applyTheme(index)
    setThemeIndex(index)
    void saveSettings()
  }

  const handleEditPositions = () => {
    setDragMode(!dragMode)
    handleClose()
  }

  const handleImport = (data: PortfolioData) => {
    onImport(data)
    handleClose()
    void confirm('Import complete. Export to HTML to keep these changes on this computer?').then(
      (save) => {
        if (!save) return
        void saveDatabase(data).then((ok) => {
          if (ok) onSaved?.()
        })
      },
    )
  }

  const handleExportHtml = () => {
    void saveDatabase(portfolio).then((ok) => {
      if (ok) {
        onSaved?.()
        handleClose()
      }
    })
  }

  const handleExportDeployBundle = () => {
    setUploadBusy(true)
    void exportDeployBundleToDisk(portfolio)
      .then((result) => {
        const mb = (result.bundle.pictures.reduce((n, p) => n + p.base64.length, 0) / (1024 * 1024)).toFixed(1)
        if (result.picturesOmitted) {
          showToastError(
            `Bundle saved without ${result.pictureCount} pictures (file too large). Re-export pictures separately or use Bulk RTU Picture Import on GitHub deploy.`,
          )
          return
        }
        showToastSuccess(
          `✓ Deploy bundle saved (${result.pictureCount} pictures, ~${mb} MB image data)`,
        )
      })
      .catch((e) => {
        if (e instanceof Error && e.message === 'Export cancelled') return
        showToastError(e instanceof Error ? e.message : 'Export failed')
      })
      .finally(() => setUploadBusy(false))
  }

  const handleClearAllLocalPictures = () => {
    void (async () => {
      if (
        !(await confirm(
          'Remove every RTU photo stored in this browser? Map picture counts will disappear until you bulk-import and sync again. Cloudflare is not changed.',
        ))
      ) {
        return
      }
      setUploadBusy(true)
      try {
        usePendingRtuPictureStore.getState().clear()
        const removed = await clearLocalRtuPictureStorage()
        invalidateUnsyncedChanges()
        showToastSuccess(
          removed > 0
            ? `✓ Cleared ${removed} local RTU photo(s) from this browser.`
            : '✓ No local RTU photos on this browser.',
        )
      } catch (error) {
        showToastError(error instanceof Error ? error.message : 'Could not clear local pictures')
      } finally {
        setUploadBusy(false)
      }
    })()
  }

  const handleLoadFromCloudflare = () => {
    if (!usesRemoteJsonData()) {
      showToastError(
        'This build does not load portfolio JSON from Cloudflare. Add VITE_JSON_DATA_BASE_URL to .env.local (same URL as GitHub Pages secrets) and restart the dev server.',
      )
      return
    }
    void (async () => {
      const unsynced = await collectUnsyncedChangesSummary()
      if (unsynced.length > 0) {
        if (
          !(await confirm(
            'This browser has unsynced edits. Loading from Cloudflare will replace them with the last synced copy (GitHub / other PC). Continue?',
          ))
        ) {
          return
        }
      }
      setUploadBusy(true)
      try {
        const { portfolio: pulled, source } = await pullRemoteUpdatesToLocal()
        onPortfolioPatch(pulled)
        invalidateUnsyncedChanges()
        showToastSuccess(
          source === 'cloudflare'
            ? '✓ Loaded portfolio, schedule, and pricing from Cloudflare.'
            : '✓ Loaded portfolio from the app bundle (Cloudflare fetch blocked — CORS on the R2 JSON bucket may be missing).',
        )
      } catch (error) {
        showToastError(error instanceof Error ? error.message : 'Could not load from Cloudflare')
      } finally {
        setUploadBusy(false)
      }
    })()
  }

  const handleClearStaleLocalPictures = () => {
    if (!usesRemoteJsonData()) {
      showToastError('Cloudflare JSON is not configured for this build.')
      return
    }
    setUploadBusy(true)
    void clearStaleLocalRtuPictures()
      .then(({ removed, remaining }) => {
        invalidateUnsyncedChanges()
        if (remaining === 0) {
          showToastSuccess(
            removed > 0
              ? `✓ Cleared ${removed} stale local picture copy(ies). Photos load from Cloudflare.`
              : '✓ No stale local picture copies — everything loads from Cloudflare.',
          )
          return
        }
        showToastSuccess(
          `✓ Cleared ${removed} stale copy(ies). ${remaining} new photo(s) on this PC still need sync.`,
        )
      })
      .catch((error) => {
        showToastError(error instanceof Error ? error.message : 'Could not clear stale pictures')
      })
      .finally(() => setUploadBusy(false))
  }

  const handleDownloadSyncReport = () => {
    setUploadBusy(true)
    void downloadSyncStatusExcel()
      .then(() => {
        showToastSuccess('✓ Sync status report downloaded (Excel)')
      })
      .catch((error) => {
        showToastError(error instanceof Error ? error.message : 'Could not download report')
      })
      .finally(() => setUploadBusy(false))
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      preventClose={uploadBusy}
      title="Settings"
      width={420}
      align="right"
    >
      <div className={styles.body}>
        <section>
          <div className={styles.sectionLabel}>Colour theme</div>
          <select
            className={selectStyles.select}
            value={String(themeIndex)}
            onChange={(e) => handleThemeSelect(Number.parseInt(e.target.value, 10))}
            aria-label="Colour theme"
          >
            {APP_THEMES.map((theme, index) => (
              <option key={theme.name} value={String(index)}>
                {theme.name}
              </option>
            ))}
          </select>
        </section>

        <section>
          <SettingsSectionLabel
            help="Buildings stay on Manager 1–4. Pick a slot, edit the display name, then apply."
          >
            Property managers
          </SettingsSectionLabel>
          <PropertyManagerNamesEditor
            key={managerEditorKey}
            portfolio={portfolio}
            onPortfolioPatch={onPortfolioPatch}
          />
        </section>

        <section>
          <SettingsSectionLabel>Edits</SettingsSectionLabel>
          <div className={styles.tools}>
            <SettingsToolButton
              tooltip="Pick an RTU to show on the map, move its pin, or delete it."
              onClick={() => setRtuEditorOpen(true)}
            >
              Edit RTU
            </SettingsToolButton>
            <SettingsToolButton
              tooltip="Edit supply, install, and other per-tonnage replacement costs used by the cost estimator."
              onClick={() => setPricingOpen(true)}
            >
              Edit RTU&apos;s Pricing
            </SettingsToolButton>
            <SettingsToolButton
              tooltip="Turn on map edit mode: drag a box to select markers and polygons, then drag any selected item to move the group. Ctrl/Shift+click or drag to add to selection."
              onClick={handleEditPositions}
            >
              {dragMode
                ? `✓ Edit Multiple Positions (on${dragSelectedCount ? ` · ${dragSelectedCount} selected` : ''})`
                : 'Edit Multiple Positions'}
            </SettingsToolButton>
            {dragMode ? (
              <SettingsToolButton
                tooltip="Clear the current map selection without turning off edit mode."
                onClick={() => {
                  clearDragSelect()
                  handleClose()
                }}
                disabled={dragSelectedCount === 0}
              >
                Clear map selection
              </SettingsToolButton>
            ) : null}
            <SettingsToolButton
              tooltip="Place a new building, RTU, or utility marker on the map."
              onClick={() => {
                handleClose()
                onOpenAddMarker()
              }}
            >
              Add marker
            </SettingsToolButton>
            <SettingsToolButton
              tooltip="Draw a new tenant polygon by clicking points on the map."
              onClick={() => {
                handleClose()
                onOpenPolygonDraw()
              }}
            >
              Add polygon
            </SettingsToolButton>
            <ImportExportButtons
              portfolio={portfolio}
              buildings={portfolio.buildings}
              onImport={handleImport}
              mode="import"
            />
            <RtuPictureGpsAssign onBusyChange={setUploadBusy} />
            <SettingsToolButton
              tooltip="Remove all RTU photos cached in this browser (IndexedDB). Use after clearing Cloudflare pictures so map counts go to zero. Does not change Cloudflare."
              onClick={handleClearAllLocalPictures}
              disabled={uploadBusy}
            >
              Clear all local RTU pictures
            </SettingsToolButton>
          </div>
        </section>

        <section>
          <SettingsSectionLabel
            help={
              <>
                <p>
                  By default the GitHub token stays in this browser tab only and is cleared when you
                  close it. Only enable remember on a private computer. The token is stored in this
                  browser&apos;s localStorage, not on Cloudflare or GitHub.
                </p>
                <p>
                  Sync uploads map data and pictures to Cloudflare, commits portfolio JSON to GitHub,
                  and triggers a GitHub Pages rebuild. <b>App UI changes</b> (e.g. removed buttons)
                  must be on <code>main</code> first — run <code>npm run push-live</code> from the
                  project folder, then sync. Token needs <b>repo</b> and <b>workflow</b> scopes. Add
                  the same token as repo secret <code>BME_SYNC_PAT</code>.
                </p>
              </>
            }
          >
            Cloudflare &amp; GitHub sync
          </SettingsSectionLabel>
          <GitHubDeploySyncFields sync={githubSync} disabled={uploadBusy} />
          <div className={styles.tools} style={{ marginTop: 8 }}>
            {usesRemoteJsonData() ? (
              <>
                <SettingsToolButton
                  tooltip="Replace this browser’s portfolio, schedule, and pricing with the copy on Cloudflare (from the last Settings sync on any PC). Use after syncing on another machine or on the live GitHub site."
                  onClick={handleLoadFromCloudflare}
                  disabled={uploadBusy}
                >
                  Load portfolio from Cloudflare
                </SettingsToolButton>
                <SettingsToolButton
                  tooltip="Remove browser copies of RTU photos that are already listed in the Cloudflare manifest. Use this if the unsynced warning keeps coming back after sync."
                  onClick={handleClearStaleLocalPictures}
                  disabled={uploadBusy}
                >
                  Clear stale local picture copies
                </SettingsToolButton>
              </>
            ) : null}
            <SettingsToolButton
              tooltip="Download Excel sync report. For a full per-file CDN audit run npm run report-sync-status in the project folder."
              onClick={handleDownloadSyncReport}
              disabled={uploadBusy}
            >
              Download sync status report (Excel)
            </SettingsToolButton>
          </div>
        </section>

        <section>
          <SettingsSectionLabel>Save &amp; deploy</SettingsSectionLabel>
          <div className={styles.tools}>
            <GitHubDeploySyncButton sync={githubSync} disabled={uploadBusy} />
            <SettingsToolButton
              variant="export"
              tooltip="Save portfolio, RTU schedule, pricing, and IndexedDB pictures as deploy-bundle.json. Run npm run apply-deploy-bundle, then commit and push to update GitHub Pages."
              onClick={handleExportDeployBundle}
              disabled={uploadBusy}
            >
              Export data for GitHub deploy
            </SettingsToolButton>
            <SettingsToolButton
              variant="export"
              tooltip="Download a self-contained HTML file with the map, filters, cost estimator, and all portfolio data. Opens offline; Ctrl+S works from the map too."
              onClick={handleExportHtml}
            >
              Export Application to HTML
            </SettingsToolButton>
            <ImportExportButtons
              portfolio={portfolio}
              buildings={portfolio.buildings}
              onImport={handleImport}
              onExportComplete={handleClose}
              mode="export"
            />
          </div>
        </section>
      </div>
      <RtuPricingSettings open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <RtuEditorSettings
        open={rtuEditorOpen}
        onClose={() => setRtuEditorOpen(false)}
        portfolio={portfolio}
        onPortfolioPatch={onPortfolioPatch}
      />
    </Modal>
  )
}

export function SettingsModal({
  open,
  onClose,
  portfolio,
  onImport,
  onPortfolioPatch,
  onOpenPolygonDraw,
  onOpenAddMarker,
  onSaved,
}: SettingsModalProps) {
  const themeIndex = useSettingsStore((s) => s.themeIndex)

  if (!open) return null

  return (
    <SettingsForm
      open={open}
      portfolio={portfolio}
      themeIndex={themeIndex}
      onClose={onClose}
      onImport={onImport}
      onPortfolioPatch={onPortfolioPatch}
      onOpenPolygonDraw={onOpenPolygonDraw}
      onOpenAddMarker={onOpenAddMarker}
      onSaved={onSaved}
    />
  )
}
