import { showToastError, showToastSuccess } from '@/lib/toast'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'

const PORTFOLIO_PLACEHOLDER = 'window.__BME_EMBEDDED_PORTFOLIO__=null'
const SETTINGS_PLACEHOLDER = 'window.__BME_EMBEDDED_SETTINGS__=null'

export async function saveDatabase(portfolio: PortfolioData): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}portable-template.html`)
    if (!res.ok) {
      throw new Error(
        'portable-template.html not found. Run: npm run build:portable (needs a production build with .env.local)',
      )
    }
    let html = await res.text()

    if (!html.includes(PORTFOLIO_PLACEHOLDER)) {
      throw new Error('Portable template is outdated. Run: npm run build:portable')
    }

    const portfolioPayload = JSON.stringify(portfolio).replace(/</g, '\\u003c')
    html = html.replace(PORTFOLIO_PLACEHOLDER, `window.__BME_EMBEDDED_PORTFOLIO__=${portfolioPayload}`)

    if (html.includes(SETTINGS_PLACEHOLDER)) {
      const { themeIndex, managerRenames } = useSettingsStore.getState()
      const settingsPayload = JSON.stringify({ themeIndex, managerRenames }).replace(/</g, '\\u003c')
      html = html.replace(SETTINGS_PLACEHOLDER, `window.__BME_EMBEDDED_SETTINGS__=${settingsPayload}`)
    }

    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    const stamp = `v${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    a.download = `building_map_explorer_${stamp}.html`
    a.click()
    URL.revokeObjectURL(a.href)
    showToastSuccess('✓ Saved to HTML')
    return true
  } catch (e) {
    showToastError(e instanceof Error ? e.message : 'Save failed')
    return false
  }
}
