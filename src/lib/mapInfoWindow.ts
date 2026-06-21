import { RTU_AGE_CRITICAL, RTU_AGE_WARN } from '@/lib/constants'
import { getColor } from '@/lib/colors'
import { hasPlaceholderGps, hasVacant, mlCount } from '@/lib/dataQuality'
import { getRtuAge, getRtuYear, oldestRtuAge } from '@/lib/rtu'
import type { Building, LayerKey, Rtu, Utility } from '@/types/domain'
import { LAYER_COLORS } from '@/lib/constants'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildBuildingInfoHtml(building: Building, getManagerName: (m: string) => string): string {
  const bColor = getColor(building.park)
  const oldest = oldestRtuAge(building)
  const vac = hasVacant(building)
  const ml = mlCount(building)

  let badges = `<span class="iw-badge" style="background:${bColor}22;color:${bColor};border:1px solid ${bColor}44">${escapeHtml(building.park.replace(/\s*\(x\s*\d+\)/, ''))}</span>`
  if (oldest >= RTU_AGE_CRITICAL) {
    badges += ` <span class="iw-badge" style="background:rgba(255,80,80,.22);color:#ff6060;border:1px solid rgba(255,80,80,.5)">🔥 ${oldest} yr RTU</span>`
  } else if (oldest >= RTU_AGE_WARN) {
    badges += ` <span class="iw-badge" style="background:rgba(251,191,36,.22);color:#fbbf24;border:1px solid rgba(251,191,36,.5)">${oldest} yr RTU</span>`
  }
  if (vac) {
    badges += ' <span class="iw-badge" style="background:rgba(251,146,60,.2);color:#fb923c;border:1px solid rgba(251,146,60,.4)">VACANT</span>'
  }
  if (ml) {
    badges += ` <span class="iw-badge" style="background:rgba(167,139,250,.2);color:#a78bfa;border:1px solid rgba(167,139,250,.4)">ML×${ml}</span>`
  }

  const stats = [
    `<div class="iw-row"><strong>BU #</strong>${escapeHtml(building.bu || '—')}</div>`,
    `<div class="iw-row"><strong>Portfolio</strong>${escapeHtml(building.cluster || building.park || '—')}</div>`,
    `<div class="iw-row"><strong>Manager</strong>${escapeHtml(getManagerName(building.manager || '') || '—')}</div>`,
    `<div class="iw-row"><strong>Sq Ft</strong>${escapeHtml(building.sqft || '—')}</div>`,
  ].join('')

  let rtuHtml = ''
  if (building.rtus?.length) {
    let nCritical = 0
    let nWarn = 0
    for (const r of building.rtus) {
      const age = getRtuAge(r)
      if (age == null) continue
      if (age >= RTU_AGE_CRITICAL) nCritical++
      else if (age >= RTU_AGE_WARN) nWarn++
    }
    let agingLabel = ''
    if (nCritical > 0) {
      agingLabel = ` <span style="color:#ff6060;font-weight:700;font-size:10px">· ${nCritical} CRITICAL</span>`
    } else if (nWarn > 0) {
      agingLabel = ' <span style="color:#fbbf24;font-weight:700;font-size:10px">· SOME AGING</span>'
    }

    const items = building.rtus
      .map((r) => {
        const age = getRtuAge(r)
        const yr = getRtuYear(r)
        let ageBadge = ''
        if (age != null && age >= RTU_AGE_CRITICAL) {
          ageBadge = ` <span class="iw-rtu-age critical">${age} yrs</span>`
        } else if (age != null && age >= RTU_AGE_WARN) {
          ageBadge = ` <span class="iw-rtu-age warn">${age} yrs</span>`
        }
        const mModel = r.description.match(/Model[:\s]+([^\r\n]+)/i)
        const mMake = r.description.match(/Make[:\s]+([^\r\n]+)/i)
        const detail = [mModel?.[1]?.trim(), mMake?.[1]?.trim(), yr ? `(${yr})` : '']
          .filter(Boolean)
          .join(' · ')
        return `<div class="iw-rtu"><div class="iw-rtu-name">${escapeHtml(r.name)}${ageBadge}</div>${detail ? `<div class="iw-rtu-detail">${escapeHtml(detail)}</div>` : ''}</div>`
      })
      .join('')

    rtuHtml = `<div class="iw-section"><div class="iw-section-title">RTUs (${building.rtus.length})${agingLabel}</div>${items}</div>`
  }

  let tenantHtml = ''
  if (building.tenants?.length) {
    const items = building.tenants
      .map(
        (t) =>
          `<div class="iw-tenant"><span class="iw-tenant-unit">${escapeHtml(t.name)}</span>${escapeHtml(t.description || '')}</div>`,
      )
      .join('')
    tenantHtml = `<div class="iw-section"><div class="iw-section-title">Tenants (${building.tenants.length})</div>${items}</div>`
  }

  const gmapsLink = `https://www.google.com/maps?q=${building.lat},${building.lng}`

  return `<div class="iw"><div class="iw-head"><div class="iw-name">${escapeHtml(building.address)}</div><div class="iw-badges">${badges}</div></div><div class="iw-body">${stats}${rtuHtml}${tenantHtml}<a class="iw-link" href="${gmapsLink}" target="_blank" rel="noopener">Open in Google Maps ↗</a></div></div>`
}

export function buildDetailInfoHtml(
  layerKey: LayerKey,
  data: Rtu | Utility | { name?: string; description?: string; desc?: string },
): string {
  const cfg = LAYER_COLORS[layerKey]
  const name = 'name' in data ? data.name : ''
  const desc = ('description' in data ? data.description : '') || ('desc' in data ? data.desc : '') || ''
  const lines = desc.split(/\r?\n/).filter(Boolean)
  const rows = lines
    .map((line) => {
      const idx = line.indexOf(':')
      if (idx > 0) {
        return `<div class="iw-row"><strong>${escapeHtml(line.slice(0, idx).trim())}</strong>${escapeHtml(line.slice(idx + 1).trim())}</div>`
      }
      return `<div class="iw-row">${escapeHtml(line)}</div>`
    })
    .join('')

  let ageLine = ''
  if (layerKey === 'rtu' && 'description' in data) {
    const age = getRtuAge(data as Rtu)
    if (age != null) {
      if (age >= RTU_AGE_CRITICAL) {
        ageLine = `<span class="iw-rtu-age critical" style="margin-left:6px">${age} yrs old</span>`
      } else if (age >= RTU_AGE_WARN) {
        ageLine = `<span class="iw-rtu-age warn" style="margin-left:6px">${age} yrs old</span>`
      }
    }
  }

  const badge = layerKey === 'rtu' ? '#fbbf24' : layerKey === 'tenants' ? '#34d399' : cfg.fill

  return `<div class="iw"><div class="iw-head"><div class="iw-name">${escapeHtml(name ?? '')}${ageLine}</div><div class="iw-badges"><span class="iw-badge" style="background:${badge}22;color:${badge};border:1px solid ${badge}44">${layerKey.toUpperCase()}</span></div></div><div class="iw-body">${rows}</div></div>`
}

export function buildHoverTipHtml(building: Building, getManagerName: (m: string) => string): string {
  const vac = hasVacant(building)
  const ml = mlCount(building)
  const oldest = oldestRtuAge(building)
  const sqftStr = building.sqft || '—'
  const vacBadge = vac
    ? '<span class="ht-badge" style="background:rgba(251,146,60,.2);color:#fb923c">VACANT</span>'
    : ''
  const mlBadge = ml
    ? `<span class="ht-badge" style="background:rgba(167,139,250,.2);color:#a78bfa">ML×${ml}</span>`
    : ''
  const rtuBadge =
    oldest >= 20
      ? `<span class="ht-badge" style="background:rgba(251,191,36,.2);color:#fbbf24">🔥${oldest}yr</span>`
      : ''
  const rtuCount = building.rtus?.length ?? 0
  const tenCount = building.tenants?.length ?? 0
  const badgeRow =
    vacBadge || mlBadge || rtuBadge
      ? `<div class="ht-row">${vacBadge}${mlBadge}${rtuBadge}</div>`
      : ''

  return `<div class="ht-addr">${escapeHtml(building.address)}</div><div class="ht-park">${escapeHtml(building.park)}</div><div class="ht-row"><span class="ht-meta">📐 ${escapeHtml(sqftStr)} sf</span><span class="ht-meta">❄ ${rtuCount} RTUs</span><span class="ht-meta">🏢 ${tenCount} tenants</span></div>${badgeRow}<div class="ht-meta" style="margin-top:4px">👤 ${escapeHtml(getManagerName(building.manager || '') || '—')}</div>`
}

export function hasBadGps(building: Building): boolean {
  return hasPlaceholderGps(building)
}
