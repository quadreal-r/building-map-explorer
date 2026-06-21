import { useMemo, useState } from 'react'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { Modal } from '@/components/Modal/Modal'
import { APP_THEMES } from '@/lib/themes'
import { collectFilterOptions } from '@/lib/filters'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { useAuthContext } from '@/hooks/useAuthContext'
import { useSelectionStore } from '@/stores/selectionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'
import styles from './SettingsModal.module.css'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  portfolio: PortfolioData
  onImport: (data: PortfolioData) => void
  onOpenLogin: () => void
  onOpenPolygonDraw: () => void
}

interface SettingsFormProps {
  portfolio: PortfolioData
  themeIndex: number
  managerRenames: Record<string, string>
  onClose: () => void
  onImport: (data: PortfolioData) => void
  onOpenLogin: () => void
  onOpenPolygonDraw: () => void
}

function SettingsForm({
  portfolio,
  themeIndex,
  managerRenames,
  onClose,
  onImport,
  onOpenLogin,
  onOpenPolygonDraw,
}: SettingsFormProps) {
  const setThemeIndex = useSettingsStore((s) => s.setThemeIndex)
  const applyTheme = useSettingsStore((s) => s.applyTheme)
  const setManagerRename = useSettingsStore((s) => s.setManagerRename)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const dragMode = useSelectionStore((s) => s.dragMode)
  const toggleDragMode = useSelectionStore((s) => s.toggleDragMode)

  const { isAuthenticated } = useAuthContext()

  const managers = useMemo(
    () => collectFilterOptions(portfolio.buildings).managers,
    [portfolio.buildings],
  )

  const [draftTheme, setDraftTheme] = useState(themeIndex)
  const [draftManagers, setDraftManagers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const manager of managers) {
      initial[manager] = managerRenames[manager] ?? manager
    }
    return initial
  })

  const handleApply = async () => {
    applyTheme(draftTheme)
    setThemeIndex(draftTheme)
    for (const [original, name] of Object.entries(draftManagers)) {
      setManagerRename(original, name)
    }
    await saveSettings()
    onClose()
  }

  const previewTheme = (index: number) => {
    setDraftTheme(index)
    applyTheme(index)
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
                value={draftManagers[manager] ?? manager}
                onChange={(e) =>
                  setDraftManagers((prev) => ({ ...prev, [manager]: e.target.value }))
                }
              />
            </div>
          ))}
          <p className={styles.hint}>Renames apply to sidebar tags, filters, and map info windows.</p>
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
                onOpenPolygonDraw()
              }}
              title="Add a new polygon by clicking points on the map"
            >
              Add polygon
            </button>
            <ImportExportButtons portfolio={portfolio} onImport={onImport} />
            {isSupabaseConfigured ? (
              <button type="button" className="btn-action" onClick={onOpenLogin}>
                {isAuthenticated ? 'Account / sign out' : 'Sign in'}
              </button>
            ) : null}
          </div>
          {!isAuthenticated && isSupabaseConfigured ? (
            <p className={styles.hint}>Sign in to edit polygons and persist settings to Supabase.</p>
          ) : null}
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
  onOpenLogin,
  onOpenPolygonDraw,
}: SettingsModalProps) {
  const themeIndex = useSettingsStore((s) => s.themeIndex)
  const managerRenames = useSettingsStore((s) => s.managerRenames)

  const formKey = `${themeIndex}:${JSON.stringify(managerRenames)}`

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={420} align="right">
      {open ? (
        <SettingsForm
          key={formKey}
          portfolio={portfolio}
          themeIndex={themeIndex}
          managerRenames={managerRenames}
          onClose={onClose}
          onImport={onImport}
          onOpenLogin={onOpenLogin}
          onOpenPolygonDraw={onOpenPolygonDraw}
        />
      ) : null}
    </Modal>
  )
}
