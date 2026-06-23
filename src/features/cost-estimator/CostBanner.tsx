import { useMemo, useState } from 'react'
import {
  RCB_DEFAULT_BASIS,
  RCB_DEFAULT_THRESHOLD,
  RCB_DEFAULT_YEAR,
  RCB_YEARS,
} from '@/lib/constants'
import {
  rcbCompute,
  rcbMoney,
  rcbProjection,
  type RcbBuildingSummary,
} from '@/lib/costEstimator'
import { exportRcbExcel } from '@/lib/excel'
import { formatFilterScope } from '@/lib/format'
import { useFilterStore } from '@/stores/filterStore'
import type { Building, CostBasis } from '@/types/domain'
import styles from './CostBanner.module.css'

export interface CostBannerProps {
  buildings: Building[]
}

type SortKey = keyof RcbBuildingSummary

export function CostBanner({ buildings }: CostBannerProps) {
  const [threshold, setThreshold] = useState(RCB_DEFAULT_THRESHOLD)
  const [basis, setBasis] = useState<CostBasis>(RCB_DEFAULT_BASIS)
  const [year, setYear] = useState(RCB_DEFAULT_YEAR)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: -1 | 1 }>({ key: 'cost', dir: -1 })

  const search = useFilterStore((s) => s.search)
  const park = useFilterStore((s) => s.park)
  const cluster = useFilterStore((s) => s.cluster)
  const manager = useFilterStore((s) => s.manager)

  const scopeLabel = formatFilterScope({ search, park, cluster, manager })

  const result = useMemo(
    () => rcbCompute(buildings, { basis, year, threshold, scope: scopeLabel }),
    [buildings, basis, year, threshold, scopeLabel],
  )

  const projection = useMemo(() => rcbProjection(result), [result])

  const sortedBuildings = useMemo(() => {
    const rows = [...result.perBldg]
    const { key, dir } = sort
    rows.sort((a, b) => {
      const x = a[key]
      const y = b[key]
      if (typeof x === 'string' && typeof y === 'string') {
        return x.localeCompare(y) * dir
      }
      return ((Number(x) || 0) - (Number(y) || 0)) * dir
    })
    return rows
  }, [result.perBldg, sort])

  const yearOptions = RCB_YEARS[basis] ?? [year]

  const handleBasisChange = (next: CostBasis) => {
    setBasis(next)
    const years = RCB_YEARS[next] ?? ['2026']
    setYear(years[0]!)
  }

  const footnote = useMemo(() => {
    const basisLbl =
      result.basis === 'hyb'
        ? `Total Cost / Hybrid Lennox / ${result.year}`
        : 'Total Cost / Standard Efficiency / Lennox Xion / 2025'
    let foot = `Budgetary estimate only — not a quote. Replacement year ${result.year}. All-in installed cost per the RTU Pricing sheet (${basisLbl}), matched by cooling tonnage rounded up to the nearest supplied tier (2–50 ton). Includes only units ${result.threshold}+ years old by install date.`
    if (result.basis === 'hyb') {
      foot += ' Hybrid Lennox figures escalate ~5%/yr (2026 base) per the pricing sheet.'
    }
    if (result.totals.excludedOld > 0) {
      foot += ` ${result.totals.excludedOld} aged unit(s) excluded for having no rated cooling tonnage (e.g. heating-only / make-up air).`
    }
    return foot
  }, [result])

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: (prev.dir * -1) as -1 | 1 }
        : { key, dir: key === 'address' || key === 'cluster' || key === 'manager' ? 1 : -1 },
    )
  }

  return (
    <div
      id="rcb-banner"
      className={`${styles.banner}${detailOpen ? ` ${styles.bannerOpen}` : ''}`}
    >
      <div id="rcb-bar" className={styles.bar}>
        <div className={styles.rcbTitle}>
          <span className={styles.rcbTitleT1}>RTU replacement cost</span>
          <span className={styles.rcbTitleT2} id="rcb-scope" title={scopeLabel}>
            {scopeLabel}
          </span>
        </div>
        <div className={styles.rcbKpis}>
          <div className={styles.rcbKpi}>
            <span className={styles.kVal} id="rcb-k-bldg">
              {result.totals.bldgCount.toLocaleString('en-CA')}
            </span>
            <span className={styles.kLab}>Buildings</span>
          </div>
          <div className={styles.rcbKpi}>
            <span className={styles.kVal} id="rcb-k-units">
              {result.totals.units.toLocaleString('en-CA')}
            </span>
            <span className={styles.kLab}>
              RTUs <span id="rcb-k-thr">≥{result.threshold}</span> yr
            </span>
          </div>
          <div className={styles.rcbKpi}>
            <span className={styles.kVal} id="rcb-k-tons">
              {(Math.round(result.totals.tons * 10) / 10).toLocaleString('en-CA')}
            </span>
            <span className={styles.kLab}>Total Tons</span>
          </div>
          <div className={styles.rcbKpi}>
            <span className={styles.kVal} id="rcb-k-avg">
              {rcbMoney(result.totals.units ? result.totals.cost / result.totals.units : 0)}
            </span>
            <span className={styles.kLab}>Avg / Unit</span>
          </div>
          <div className={`${styles.rcbKpi} ${styles.rcbKpiTotal}`}>
            <span className={styles.kVal} id="rcb-k-total">
              {rcbMoney(result.totals.cost)}
            </span>
            <span className={styles.kLab}>
              Est. Cost · <span id="rcb-k-year">{result.year}</span>
            </span>
          </div>
        </div>
        <div className={styles.rcbControls}>
          <label className={styles.rcbCtl}>
            Age ≥
            <input
              type="number"
              id="rcb-thr"
              min={0}
              max={60}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 20)}
            />{' '}
            yr
          </label>
          <label className={styles.rcbCtl}>
            Basis
            <select id="rcb-basis" value={basis} onChange={(e) => handleBasisChange(e.target.value as CostBasis)}>
              <option value="hyb">Hybrid Lennox</option>
              <option value="std">Standard / Xion</option>
            </select>
          </label>
          <label className={styles.rcbCtl}>
            Repl. year
            <select
              id="rcb-year"
              value={year}
              disabled={yearOptions.length <= 1}
              onChange={(e) => setYear(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${styles.rcbBtn} ${styles.rcbBtnXls}`}
            onClick={() => exportRcbExcel(result, scopeLabel)}
            title="Export this estimate to Excel"
          >
            Excel
          </button>
          <button
            type="button"
            className={styles.rcbBtn}
            onClick={() => setDetailOpen((v) => !v)}
            title="Show / hide line-item breakdown"
          >
            Detail
            <svg className={styles.rcbChev} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      <div id="rcb-detail" className={styles.detail}>
        <div className={styles.rcbDetailGrid}>
          <div className={styles.rcbTblwrap}>
            <h4>By building</h4>
            <table className={styles.rcbTbl} id="rcb-tbl-bldg">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('address')}>Address</th>
                  <th onClick={() => toggleSort('cluster')}>Cluster</th>
                  <th onClick={() => toggleSort('manager')}>Manager</th>
                  <th className="num" onClick={() => toggleSort('units')}>
                    RTUs
                  </th>
                  <th className="num" onClick={() => toggleSort('tons')}>
                    Tons
                  </th>
                  <th className="num" onClick={() => toggleSort('cost')}>
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {!sortedBuildings.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.rcbEmpty}>
                        No RTUs ≥ {result.threshold} years in the current selection.
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {sortedBuildings.map((r) => (
                      <tr key={r.address}>
                        <td>{r.address}</td>
                        <td>{r.cluster}</td>
                        <td>{r.manager}</td>
                        <td className="num">{r.units}</td>
                        <td className="num">{Math.round(r.tons * 10) / 10}</td>
                        <td className="num">{rcbMoney(r.cost)}</td>
                      </tr>
                    ))}
                    <tr className={styles.rcbTotal}>
                      <td>TOTAL — {result.totals.bldgCount} bldg</td>
                      <td />
                      <td />
                      <td className="num">{result.totals.units}</td>
                      <td className="num">{Math.round(result.totals.tons * 10) / 10}</td>
                      <td className="num">{rcbMoney(result.totals.cost)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.rcbTblwrap} style={{ maxWidth: 340 }}>
            <h4>By tonnage tier ({result.year})</h4>
            <table className={styles.rcbTbl} id="rcb-tbl-tier">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th className="num">Unit $</th>
                  <th className="num">Qty</th>
                  <th className="num">Extended</th>
                </tr>
              </thead>
              <tbody>
                {!Object.keys(result.tiers).length ? (
                  <tr>
                    <td colSpan={4}>
                      <div className={styles.rcbEmpty}>—</div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {Object.keys(result.tiers)
                      .map(Number)
                      .sort((a, b) => a - b)
                      .map((kk) => {
                        const t = result.tiers[String(kk)]!
                        return (
                          <tr key={kk}>
                            <td>{t.label}</td>
                            <td className="num">{rcbMoney(t.unit)}</td>
                            <td className="num">{t.qty}</td>
                            <td className="num">{rcbMoney(t.ext)}</td>
                          </tr>
                        )
                      })}
                    <tr className={styles.rcbTotal}>
                      <td>TOTAL</td>
                      <td />
                      <td className="num">{result.totals.units}</td>
                      <td className="num">{rcbMoney(result.totals.cost)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.rcbTblwrap} style={{ maxWidth: 300 }}>
            <h4>Projection by year</h4>
            <table className={styles.rcbTbl} id="rcb-tbl-proj">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="num">Total</th>
                  <th className="num">vs {projection[0]?.year ?? ''}</th>
                </tr>
              </thead>
              <tbody>
                {!projection.length || !result.totals.units ? (
                  <tr>
                    <td colSpan={3}>
                      <div className={styles.rcbEmpty}>—</div>
                    </td>
                  </tr>
                ) : (
                  projection.map((p) => {
                    const delta = p.total - (projection[0]?.total ?? 0)
                    const dStr = delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${rcbMoney(delta)}`
                    const selected = p.year === result.year
                    return (
                      <tr key={p.year} className={selected ? styles.selectedRow : undefined}>
                        <td>{p.year}</td>
                        <td className="num">{rcbMoney(p.total)}</td>
                        <td className="num">{dStr}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className={styles.rcbFoot} id="rcb-foot">
          {footnote}
        </div>
      </div>
    </div>
  )
}
