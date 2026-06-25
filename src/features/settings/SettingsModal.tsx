import { useState, useCallback, useMemo } from 'react'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { BulkRtuPictureImport } from '@/features/settings/BulkRtuPictureImport'
import { RtuPricingSettings } from '@/features/settings/RtuPricingSettings'
import { SettingsToolButton } from '@/features/settings/SettingsToolButton'
import { Modal } from '@/components/Modal/Modal'
import { Tooltip } from '@/components/Tooltip/Tooltip'
import tooltipStyles from '@/components/Tooltip/Tooltip.module.css'
import { APP_THEMES } from '@/lib/themes'
import selectStyles from '@/components/Select/Select.module.css'
import {
  addManagerSlot,
  applyManagerSlots,
  managerSlotLabel,
  managerSlotsFromPortfolio,
  type ManagerSlot,
} from '@/lib/managerNames'
import { saveDatabase } from '@/lib/saveDatabase'
import { exportDeployBundleToDisk } from '@/lib/deployBundle'
import { showToastError, showToastSuccess } from '@/lib/toast'
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

const ADD_MANAGER_VALUE = '__add_manager__'

function PropertyManagerNamesEditor({
  portfolio,
  onPortfolioPatch,
}: {
  portfolio: PortfolioData
  onPortfolioPatch: (data: PortfolioData) => void
}) {
  const setManagerRename = useSettingsStore((s) => s.setManagerRename)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [slots, setSlots] = useState<ManagerSlot[]>(() =>
    managerSlotsFromPortfolio(portfolio.buildings),
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

  const handleAddManager = () => {
    const committed = commitDraft(selectedIndex, draftName, slots)
    const nextSlots = addManagerSlot(committed)
    const newIndex = nextSlots.length - 1
    setSlots(nextSlots)
    setSelectedIndex(newIndex)
    setDraftName('')
  }

  const handleApply = () => {
    const committed = commitDraft(selectedIndex, draftName, slots)
    const { portfolio: nextPortfolio, changed, managerRenames: appliedRenames } =
      applyManagerSlots(portfolio, committed)

    for (const [original, name] of Object.entries(appliedRenames)) {
      setManagerRename(original, name)
    }
    void saveSettings()

    if (changed) {
      onPortfolioPatch(nextPortfolio)
      const nextSlots = managerSlotsFromPortfolio(nextPortfolio.buildings)
      setSlots(nextSlots)
      setSelectedIndex(Math.min(selectedIndex, nextSlots.length - 1))
      setDraftName(nextSlots[Math.min(selectedIndex, nextSlots.length - 1)]?.name ?? '')
      showToastSuccess('✓ Manager names updated — save to HTML to keep changes.')
      return
    }

    showToastSuccess('✓ Manager names saved.')
  }

  return (
    <>
      <div className={styles.mgrFieldList}>
        <select
          className={selectStyles.select}
          value={String(selectedIndex)}
          onChange={(e) => handleSlotPickerChange(e.target.value)}
          aria-label="Select manager to edit"
        >
          {slots.map((slot, index) => (
            <option key={`${slot.original}-${index}`} value={String(index)}>
              {slot.name || managerSlotLabel(index)}
            </option>
          ))}
        </select>
        <input
          type="text"
          className={`${selectStyles.select} ${styles.mgrNameInput}`}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={managerSlotLabel(selectedIndex)}
          aria-label={`Edit ${managerSlotLabel(selectedIndex)}`}
        />
        <select
          className={selectStyles.select}
          value=""
          onChange={(e) => {
            if (e.target.value === ADD_MANAGER_VALUE) handleAddManager()
          }}
          aria-label="Add manager slot"
        >
          <option value="">Add Manager</option>
          <option value={ADD_MANAGER_VALUE}>Add Manager</option>
        </select>
      </div>
      <p className={styles.hint}>
        Pick a manager above, edit the name, then apply. Add Manager stays available for extra slots.
      </p>
      <button type="button" className={styles.mgrApplyBtn} onClick={handleApply}>
        Apply manager names
      </button>
    </>
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

  const managerEditorKey = useMemo(() => {
    if (!open) return 'closed'
    return managerSlotsFromPortfolio(portfolio.buildings)
      .map((slot) => `${slot.original}\t${slot.name}`)
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
    const save = window.confirm(
      'Import complete. Export to HTML to keep these changes on this computer?',
    )
    if (!save) return
    void saveDatabase(data).then((ok) => {
      if (ok) {
        onSaved?.()
      }
    })
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
          <div className={styles.sectionLabel}>Property manager names</div>
          <Tooltip
            content="Edit manager names shown in the sidebar All property managers filter."
            position="left"
            wide
            className={`${tooltipStyles.wrapBlock} ${styles.toolBtnWrap}`}
          >
            <PropertyManagerNamesEditor
              key={managerEditorKey}
              portfolio={portfolio}
              onPortfolioPatch={onPortfolioPatch}
            />
          </Tooltip>
        </section>

        <section>
          <div className={styles.sectionLabel}>RTU replacement pricing</div>
          <div className={styles.tools}>
            <SettingsToolButton
              tooltip="Edit supply, install, and other per-tonnage replacement costs used by the cost estimator."
              onClick={() => setPricingOpen(true)}
            >
              Edit RTU&apos;s Pricing
            </SettingsToolButton>
          </div>
        </section>

        <section>
          <div className={styles.sectionLabel}>Tools</div>
          <div className={styles.tools}>
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
            />
            <BulkRtuPictureImport portfolio={portfolio} onBusyChange={setUploadBusy} />
          </div>
        </section>
      </div>
      <RtuPricingSettings open={pricingOpen} onClose={() => setPricingOpen(false)} />
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
