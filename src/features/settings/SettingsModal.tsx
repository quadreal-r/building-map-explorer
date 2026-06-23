import { useMemo, useState } from 'react'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { Modal } from '@/components/Modal/Modal'
import { APP_THEMES } from '@/lib/themes'
import { collectFilterOptions } from '@/lib/filters'
import { saveDatabase } from '@/lib/saveDatabase'
import { showToastSuccess } from '@/lib/toast'
import { usePortfolioStore } from '@/stores/portfolioStore'
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
  const unsaved = usePortfolioStore((s) => s.unsaved)

  const dragMode = useSelectionStore((s) => s.dragMode)
  const toggleDragMode = useSelectionStore((s) => s.toggleDragMode)

  const [savingHtml, setSavingHtml] = useState(false)

  const managers = useMemo(
    () => collectFilterOptions(portfolio.buildings).managers,
    [portfolio.buildings],
  )

  const [draftTheme, setDraftTheme] = useState(themeIndex)
  const [draftManagers, setDraftManagers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const manager of managers) {
      initial[manager] = manager
    }
    return initial
  })

  const handleApply = async () => {
    applyTheme(draftTheme)
    setThemeIndex(draftTheme)

    let nextPortfolio = portfolio
    let anyChange = false
    for (const [original, name] of Object.entries(draftManagers)) {
      const trimmed = name.trim() || original
      if (trimmed !== original) anyChange = true
    }
    if (anyChange) {
      nextPortfolio = {
        ...portfolio,
        buildings: portfolio.buildings.map((b) => {
          const renamed = draftManagers[b.manager]
          if (!renamed?.trim() || renamed.trim() === b.manager) return b
          return { ...b, manager: renamed.trim() }
        }),
      }
      onPortfolioPatch(nextPortfolio)
    }

    await saveSettings()
    closeSettings()
    showToastSuccess('✓ Settings applied')
  }

  const closeSettings = onClose

  const previewTheme = (index: number) => {
    setDraftTheme(index)
    applyTheme(index)
  }

  const handleSaveToHtml = async () => {
    setSavingHtml(true)
    try {
      const ok = await saveDatabase(portfolio)
      if (ok) onSaved?.()
    } finally {
      setSavingHtml(false)
    }
  }

  return (
    <>
      <div className={styles.body}>
        <section>
          <div className={styles.sectionLabel}>Colour theme</div>
          <div className={styles.themeGrid}>
            {APP_THEMES.map((theme, index) => (
              <button
                key={theme.name}
                type="button"
                className={`${styles.themeSwatch}${draftTheme === index ? ` ${styles.active}` : ''}`}
                onClick={() => previewTheme(index)}
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
              />
            </div>
          ))}
          <p className={styles.hint}>Renames update building records when you apply settings.</p>
        </section>

        <section>
          <div className={styles.sectionLabel}>Tools</div>
          <div className={styles.tools}>
            <button
              type="button"
              className="btn-action"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={toggleDragMode}
            >
              {dragMode ? '✓ Edit positions (on)' : 'Edit positions'}
            </button>
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
            <ImportExportButtons portfolio={portfolio} onImport={onImport} />
            <button
              type="button"
              id="btn-save"
              className={`btn-action btn-save${unsaved ? ' unsaved' : ''}`}
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => void handleSaveToHtml()}
              disabled={savingHtml}
              title="Download current data as a standalone HTML file"
            >
              {savingHtml ? 'Saving…' : 'Save to HTML'}
            </button>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.applyBtn} onClick={() => void handleApply()}>
          Apply &amp; save
        </button>
      </div>
    </>
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

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={420} align="right">
      {open ? (
        <SettingsForm
          key={themeIndex}
          portfolio={portfolio}
          themeIndex={themeIndex}
          onClose={onClose}
          onImport={onImport}
          onPortfolioPatch={onPortfolioPatch}
          onOpenPolygonDraw={onOpenPolygonDraw}
          onOpenAddMarker={onOpenAddMarker}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  )
}
