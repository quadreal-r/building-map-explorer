import { serializePortfolio } from '@/lib/legacySerialize'
import { showToastError, showToastSuccess } from '@/lib/toast'
import type { PortfolioData } from '@/types/domain'

export async function saveDatabase(portfolio: PortfolioData): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}portfolio-template.html`)
    if (!res.ok) throw new Error('portfolio-template.html not found in public/. Run: node scripts/build-portfolio-template.mjs')
    let html = await res.text()

    const { buildings, utilities, polygons } = serializePortfolio(portfolio)
    html = html
      .replace('__BUILDINGS__', JSON.stringify(buildings))
      .replace('__UTILITIES__', JSON.stringify(utilities))
      .replace('__POLYGONS__', JSON.stringify(polygons))

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
