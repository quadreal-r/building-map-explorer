import { useMemo, useState } from 'react'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { Modal } from '@/components/Modal/Modal'
import { APP_THEMES } from '@/lib/themes'
import { collectFilterOptions } from '@/lib/filters'
import { saveDatabase } from '@/lib/saveDatabase'
import { showToastSuccess } from '@/lib/toast'
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

  const managers = useMemo(
    () => collectFilterOptions(portfolio.buildings).managers,
    [portfolio.buildings],
  )

  const [draftManagers, setDraftManagers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const manager of managers) {
      initial[manager] = manager
    }
    return initial
  })

  const applyManagerRename = (original: string, nextName: string) => {
    const trimmed = nextName.trim() || original
    if (trimmed === original) return
    onPortfolioPatch({
      ...portfolio,
      buildings: portfolio.buildings.map((b) =>
        b.manager === original ? { ...b, manager: trimmed } : b,
      ),
    })
    showToastSuccess('✓ Manager name updated')
  }

  const handleThemeSelect = (index: number) => {
    applyTheme(index)
    setThemeIndex(index)
    void saveSettings()
  }

  const handleEditPositions = () => {
    setDragMode(!dragMode)
    onClose()
  }

  const handleImport = (data: PortfolioData) => {
    onImport(data)
    onClose()
    const save = window.confirm(
      'Import complete. Save to HTML to keep these changes on this computer?',
    )
    if (!save) return
    void saveDatabase(data).then((ok) => {
      if (ok) {
        onSaved?.()
        showToastSuccess('✓ Saved to HTML')
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={420} align="right">
      <div className={styles.body}>
        <section>
          <div className={styles.sectionLabel}>Colour theme</div>
          <div className={styles.themeGrid}>
            {APP_THEMES.map((theme, index) => (
              <button
                key={theme.name}
                type="button"
                className={`${styles.themeSwatch}${themeIndex === index ? ` ${styles.active}` : ''}`}
                onClick={() => handleThemeSelect(index)}
              >
                <div className={styles.themeName}>{theme.name}</div>
                <div className={styles.themePalette}>
                  {theme.palette.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className={styles.sectionLabel}>Property manager names</div>
          {managers.map((manager) => (
            <div key={manager} className={styles.mgrRow}>
              <span className={styles.mgrLabel} title={manager}>
                {manager}
              </span>
              <input
                className={styles.mgrInput}
                data-original={manager}
                value={draftManagers[manager] ?? manager}
                onChange={(e) =>
                  setDraftManagers((prev) => ({ ...prev, [manager]: e.target.value }))
                }
                onBlur={(e) => applyManagerRename(manager, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </div>
          ))}
          <p className={styles.hint}>Renames apply when you leave each field.</p>
        </section>

        <section>
          <div className={styles.sectionLabel}>Tools</div>
          <div className={styles.tools}>
            <button
              type="button"
              className="btn-action"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={handleEditPositions}
            >
              {dragMode ? `✓ Edit positions (on${dragSelectedCount ? ` · ${dragSelectedCount} selected` : ''})` : 'Edit positions'}
            </button>
            {dragMode ? (
              <button
                type="button"
                className="btn-action"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  clearDragSelect()
                  onClose()
                }}
                disabled={dragSelectedCount === 0}
              >
                Clear map selection
              </button>
            ) : null}
            <p className={styles.hint}>
              Drag a box on the map to select markers and polygons, or click to toggle selection (Ctrl/Shift+click or Ctrl/Shift+drag to add). Drag any selected item to move the group.
            </p>
            <button
              type="button"
              className="btn-action"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                onClose()
                onOpenAddMarker()
              }}
            >
              Add marker
            </button>
            <button
              type="button"
              className="btn-action"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                onClose()
                onOpenPolygonDraw()
              }}
              title="Add a new polygon by clicking points on the map"
            >
              Add polygon
            </button>
            <ImportExportButtons
              portfolio={portfolio}
              onImport={handleImport}
              onExportComplete={onClose}
            />
          </div>
        </section>
      </div>
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
      key={themeIndex}
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
