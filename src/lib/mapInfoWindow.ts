import { RTU_AGE_CRITICAL, RTU_AGE_WARN } from '@/lib/constants'
import { getColor } from '@/lib/colors'
import { hasPlaceholderGps, hasVacant, mlCount } from '@/lib/dataQuality'
import { getRtuAge, getRtuYear, oldestRtuAge } from '@/lib/rtu'
import { showToastSuccess } from '@/lib/toast'
import type { Building, LayerKey, Rtu, Tenant, Utility } from '@/types/domain'
import { LAYER_COLORS } from '@/lib/constants'

const VACANT_RE = /^(vacant|no information)$/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function closeButton(): string {
  return '<button class="iw-close" data-iw-action="close" title="Close">✕</button>'
}

function moveButton(attrs: Record<string, string>): string {
  const dataAttrs = Object.entries(attrs)
    .map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`)
    .join('')
  return `<button class="iw-move-btn" data-iw-action="move"${dataAttrs} title="Move this marker">↔ Move</button>`
}

function actionFooter(buttons: string): string {
  return buttons ? `<div class="iw-foot"><div class="iw-actions">${buttons}</div></div>` : ''
}

function copyButton(): string {
  return `<button class="iw-copy-btn" data-iw-action="copy-all" title="Copy all information">📋 Copy</button>`
}

function copySource(text: string): string {
  return `<textarea class="iw-copy-source" readonly aria-hidden="true" tabindex="-1">${escapeHtml(text)}</textarea>`
}

function plainRow(label: string, value: string): string {
  return `${label.padEnd(12)}${value}`
}

function plainDetailLines(desc: string): string[] {
  return desc.split(/\r?\n/).filter(Boolean).map((line) => {
    const idx = line.indexOf(':')
    if (idx > 0) {
      return plainRow(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
    }
    return line
  })
}

export function copyPopupText(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).then(() => showToastSuccess('📋 Copied popup contents'))
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
  showToastSuccess('📋 Copied popup contents')
}

function buildingBadgeText(building: Building): string {
  const parts = [building.park.replace(/\s*\(x\s*\d+\)/, '').trim()]
  const oldest = oldestRtuAge(building)
  if (oldest >= RTU_AGE_CRITICAL) parts.push(`🔥 ${oldest} yr RTU`)
  else if (oldest >= RTU_AGE_WARN) parts.push(`${oldest} yr RTU`)
  if (hasVacant(building)) parts.push('VACANT')
  const ml = mlCount(building)
  if (ml) parts.push(`ML×${ml}`)
  return parts.join('  ')
}

export function buildBuildingInfoPlainText(building: Building): string {
  const lines: string[] = [building.address, buildingBadgeText(building), '']
  lines.push(plainRow('BU #', building.bu || '—'))
  lines.push(plainRow('Portfolio', building.cluster || building.park || '—'))
  lines.push(plainRow('Manager', building.manager || '—'))
  lines.push(plainRow('Sq Ft', building.sqft || '—'))

  if (building.rtus?.length) {
    let nCritical = 0
    let nWarn = 0
    for (const r of building.rtus) {
      const age = getRtuAge(r)
      if (age == null) continue
      if (age >= RTU_AGE_CRITICAL) nCritical++
      else if (age >= RTU_AGE_WARN) nWarn++
    }
    let title = `RTUs (${building.rtus.length})`
    if (nCritical > 0) title += ` · ${nCritical} CRITICAL`
    else if (nWarn > 0) title += ' · SOME AGING'
    lines.push('', title)

    for (const r of building.rtus) {
      const age = getRtuAge(r)
      const yr = getRtuYear(r)
      let nameLine = r.name
      if (age != null && age >= RTU_AGE_CRITICAL) nameLine += `  ${age} yrs`
      else if (age != null && age >= RTU_AGE_WARN) nameLine += `  ${age} yrs`
      lines.push(nameLine)
      const mModel = r.description.match(/Model[:\s]+([^\r\n]+)/i)
      const mMake = r.description.match(/Make[:\s]+([^\r\n]+)/i)
      const detail = [mModel?.[1]?.trim(), mMake?.[1]?.trim(), yr ? `(${yr})` : '']
        .filter(Boolean)
        .join(' · ')
      if (detail) lines.push(`  ${detail}`)
    }
  }

  if (building.tenants?.length) {
    lines.push('', `Tenants (${building.tenants.length})`)
    for (const t of building.tenants) {
      const desc = t.description || ''
      lines.push(desc ? `${t.name}  ${desc}` : t.name)
    }
  }

  return lines.join('\n').trimEnd()
}

export function buildDetailInfoPlainText(
  layerKey: LayerKey,
  data: Rtu | Tenant | Utility,
  options?: { buildingAddress?: string },
): string {
  void options
  const name = data.name ?? ''
  const lines: string[] = [name]

  if (layerKey === 'rtu') {
    const age = getRtuAge(data as Rtu)
    if (age != null) {
      if (age >= RTU_AGE_CRITICAL) lines[0] = `${name}  ${age} yrs old`
      else if (age >= RTU_AGE_WARN) lines[0] = `${name}  ${age} yrs old`
    }
  }

  lines.push('')
  lines.push(...plainDetailLines(data.description ?? ''))

  return lines.join('\n').trimEnd()
}

function isTenantVacant(tenant: Tenant): boolean {
  return VACANT_RE.test((tenant.description ?? '').trim())
}

export function buildBuildingInfoHtml(building: Building): string {
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
    `<div class="iw-row"><strong>Manager</strong>${escapeHtml(building.manager || '—')}</div>`,
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
      .map((t) => {
        const vacClass = isTenantVacant(t) ? ' vacant' : ''
        return `<div class="iw-tenant${vacClass}"><span class="iw-tenant-unit">${escapeHtml(t.name)}</span>${escapeHtml(t.description || '')}</div>`
      })
      .join('')
    tenantHtml = `<div class="iw-section"><div class="iw-section-title">Tenants (${building.tenants.length})</div>${items}</div>`
  }

  const moveBtn = moveButton({ 'iw-kind': 'building', 'iw-address': building.address })
  const plainText = buildBuildingInfoPlainText(building)

  return `<div class="iw">${copySource(plainText)}<div class="iw-head"><div class="iw-name">${escapeHtml(building.address)}</div><div class="iw-badges">${badges}</div>${closeButton()}</div><div class="iw-body">${stats}${rtuHtml}${tenantHtml}</div>${actionFooter(`${copyButton()}${moveBtn}`)}</div>`
}

export function buildDetailInfoHtml(
  layerKey: LayerKey,
  data: Rtu | Tenant | Utility,
  options?: { showDelete?: boolean; buildingAddress?: string },
): string {
  const cfg = LAYER_COLORS[layerKey]
  const name = data.name ?? ''
  const desc = data.description ?? ''
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
  if (layerKey === 'rtu') {
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

  const moveBtn = moveButton({
    'iw-kind': 'detail',
    'iw-layer': layerKey,
    'iw-name': name,
    'iw-building': options?.buildingAddress ?? '',
  })
  const deleteBtn =
    options?.showDelete !== false
      ? `<button class="iw-del-btn" data-iw-action="delete" data-iw-layer="${layerKey}" data-iw-name="${escapeHtml(name)}" data-iw-building="${escapeHtml(options?.buildingAddress ?? '')}" title="Delete this marker">🗑 Delete</button>`
      : ''
  const plainText = buildDetailInfoPlainText(layerKey, data, options)

  return `<div class="iw">${copySource(plainText)}<div class="iw-head"><div class="iw-name">${escapeHtml(name)}${ageLine}</div><div class="iw-badges"><span class="iw-badge" style="background:${badge}22;color:${badge};border:1px solid ${badge}44">${layerKey.toUpperCase()}</span></div>${closeButton()}</div><div class="iw-body">${rows}</div>${actionFooter(`${copyButton()}${moveBtn}${deleteBtn}`)}</div>`
}

export function hasBadGps(building: Building): boolean {
  return hasPlaceholderGps(building)
}
