import { useMemo } from 'react'
import { getRtuAge } from '@/lib/rtu'
import type { Building } from '@/types/domain'

export interface RtuHistogramProps {
  buildings: Building[]
}

const BUCKET_LABELS = ['0-10', '11-15', '16-19', '20+'] as const
const BUCKET_COLORS = ['#34d399', '#60a5fa', '#fb923c', '#f87171'] as const

export function RtuHistogram({ buildings }: RtuHistogramProps) {
  const { buckets, maxBucket } = useMemo(() => {
    const buckets = [0, 0, 0, 0]
    for (const b of buildings) {
      for (const r of b.rtus ?? []) {
        const age = getRtuAge(r)
        if (age == null) continue
        if (age >= 20) buckets[3]!++
        else if (age >= 16) buckets[2]!++
        else if (age >= 11) buckets[1]!++
        else buckets[0]!++
      }
    }
    return { buckets, maxBucket: Math.max(1, ...buckets) }
  }, [buildings])

  return (
    <div className="rtu-histogram">
      <div className="hist-title">RTU age distribution</div>
      <div className="hist-bars">
        {buckets.map((count, i) => {
          const pct = Math.max(4, Math.round((count / maxBucket) * 100))
          return (
            <div key={BUCKET_LABELS[i]} className="hist-bar-wrap">
              <div
                className="hist-bar"
                id={`hb${i}`}
                style={{ height: `${pct}%`, background: BUCKET_COLORS[i] }}
                title={`${BUCKET_LABELS[i]} yrs: ${count} RTUs`}
              />
              <span className="hist-lbl">{BUCKET_LABELS[i]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
