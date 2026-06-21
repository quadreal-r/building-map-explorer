import { useMemo, useState } from 'react'
import { useFilterStore } from '@/stores/filterStore'
import type { Building } from '@/types/domain'

export interface SearchHitNavProps {
  buildings: Building[]
}

/** Prev/next navigation when search matches RTU/tenant detail markers only. */
export function SearchHitNav({ buildings }: SearchHitNavProps) {
  const search = useFilterStore((s) => s.search).trim().toLowerCase()
  const [index, setIndex] = useState(0)

  const hits = useMemo(() => {
    if (!search) return []
    const q = search
    const addressMatch = buildings.some(
      (b) =>
        b.address.toLowerCase().includes(q) ||
        b.bu?.toLowerCase().includes(q) ||
        b.cluster?.toLowerCase().includes(q) ||
        b.manager?.toLowerCase().includes(q),
    )
    if (addressMatch) return []

    const list: { label: string; lat: number; lng: number }[] = []
    for (const b of buildings) {
      for (const r of b.rtus ?? []) {
        if (
          r.name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)
        ) {
          list.push({ label: `${b.address} · ${r.name}`, lat: r.lat, lng: r.lng })
        }
      }
      for (const t of b.tenants ?? []) {
        if (
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q)
        ) {
          list.push({ label: `${b.address} · ${t.name}`, lat: t.lat, lng: t.lng })
        }
      }
    }
    return list
  }, [buildings, search])

  if (hits.length <= 1) return null

  const safeIndex = Math.min(index, hits.length - 1)
  const hit = hits[safeIndex]!

  const panTo = (i: number) => {
    const next = ((i % hits.length) + hits.length) % hits.length
    setIndex(next)
    window.dispatchEvent(
      new CustomEvent('map:panTo', {
        detail: { lat: hits[next]!.lat, lng: hits[next]!.lng, zoom: 18 },
      }),
    )
  }

  return (
    <div
      id="search-hit-nav"
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '4px 14px 6px',
        fontSize: 11,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span title={hit.label}>
        {safeIndex + 1} of {hits.length}
      </span>
      <button type="button" className="btn-action" style={{ padding: '2px 8px' }} onClick={() => panTo(safeIndex - 1)}>
        ← Prev
      </button>
      <button type="button" className="btn-action" style={{ padding: '2px 8px' }} onClick={() => panTo(safeIndex + 1)}>
        Next →
      </button>
    </div>
  )
}
