import { useCallback, useEffect, useMemo, useState } from 'react'
import { collectSearchHits, openSearchHit, type SearchHit } from '@/lib/searchHits'
import { useFilterStore } from '@/stores/filterStore'
import type { Building, Polygon } from '@/types/domain'

export interface SearchHitNavProps {
  buildings: Building[]
  polygons: Polygon[]
}

/** Prev/next navigation when search matches RTU markers, tenant polygons, or buildings. */
export function SearchHitNav({ buildings, polygons }: SearchHitNavProps) {
  const search = useFilterStore((s) => s.search).trim()
  const [index, setIndex] = useState(0)

  const hits = useMemo(
    (): SearchHit[] => collectSearchHits(buildings, polygons, search),
    [buildings, polygons, search],
  )

  const openHit = useCallback((target: SearchHit, i: number) => {
    setIndex(i)
    openSearchHit(target)
  }, [])

  useEffect(() => {
    setIndex(0)
    if (hits.length >= 1) {
      openHit(hits[0]!, 0)
    }
  }, [search, hits, openHit])

  if (!hits.length) return null

  const safeIndex = Math.min(index, hits.length - 1)
  const hit = hits[safeIndex]!

  const panTo = (i: number) => {
    const next = ((i % hits.length) + hits.length) % hits.length
    openHit(hits[next]!, next)
  }

  if (hits.length <= 1) return null

  return (
    <div
      id="search-hit-nav"
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '5px 14px 6px',
        fontSize: 11,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)',
      }}
    >
      <span id="shn-count" title={hit.label} style={{ flex: 1, fontFamily: "'DM Mono', monospace" }}>
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
