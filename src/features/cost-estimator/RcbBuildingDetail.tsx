import { useMemo, useState } from 'react'
import { RCB_YEARS } from '@/lib/constants'
import {
  formatRtuTons,
  rcbLineItemsForBuilding,
  rcbLineItemsWithReplacementYears,
  rcbMoney,
  rcbReplacementYearKey,
  rcbTierBreakdownForItems,
  type RcbScheduledLineItem,
  type RcbBuildingSummary,
  type RcbComputeResult,
} from '@/lib/costEstimator'
import styles from './CostBanner.module.css'

export interface RcbBuildingDetailProps {
  building: RcbBuildingSummary
  result: RcbComputeResult
  defaultReplacementYear: string
  replacementYearByRtu: Record<string, string>
  onReplacementYearChange: (address: string, rtu: string, year: string) => void
  onBack: () => void
}

type RtuSortKey = 'rtu' | 'replacementYear' | 'installed' | 'age' | 'tons' | 'cost'

function compareRtuRows(a: RcbScheduledLineItem, b: RcbScheduledLineItem, key: RtuSortKey): number {
  switch (key) {
    case 'rtu':
      return a.rtu.localeCompare(b.rtu)
    case 'replacementYear':
      return Number(a.replacementYear) - Number(b.replacementYear)
    case 'installed':
      return (a.year ?? 0) - (b.year ?? 0)
    case 'age':
      return (a.age ?? 0) - (b.age ?? 0)
    case 'tons':
      return (a.tons ?? 0) - (b.tons ?? 0)
    case 'cost':
      return a.cost - b.cost
    default:
      return 0
  }
}

export function RcbBuildingDetail({
  building,
  result,
  defaultReplacementYear,
  replacementYearByRtu,
  onReplacementYearChange,
  onBack,
}: RcbBuildingDetailProps) {
  const [replacementYearFilter, setReplacementYearFilter] = useState('')
  const [sort, setSort] = useState<{ key: RtuSortKey; dir: -1 | 1 }>({
    key: 'rtu',
    dir: 1,
  })

  const yearOptions = RCB_YEARS[result.basis] ?? [defaultReplacementYear]

  const lineItems = useMemo(() => {
    const base = rcbLineItemsForBuilding(result, building.address)
    return rcbLineItemsWithReplacementYears(
      base,
      result.basis,
      defaultReplacementYear,
      replacementYearByRtu,
    )
  }, [building.address, defaultReplacementYear, replacementYearByRtu, result])

  const displayedItems = useMemo(() => {
    let rows = [...lineItems]
    if (replacementYearFilter) {
      rows = rows.filter((item) => item.replacementYear === replacementYearFilter)
    }
    const { key, dir } = sort
    rows.sort((a, b) => compareRtuRows(a, b, key) * dir)
    return rows
  }, [lineItems, replacementYearFilter, sort])

  const tierRows = useMemo(() => rcbTierBreakdownForItems(displayedItems), [displayedItems])

  const scheduledCost = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.cost, 0),
    [lineItems],
  )

  const displayedCost = useMemo(
    () => displayedItems.reduce((sum, item) => sum + item.cost, 0),
    [displayedItems],
  )

  const deferredCount = useMemo(
    () =>
      lineItems.filter(
        (item) => Number(item.replacementYear) > Number(defaultReplacementYear),
      ).length,
    [defaultReplacementYear, lineItems],
  )

  const toggleSort = (key: RtuSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: (prev.dir * -1) as -1 | 1 }
        : { key, dir: key === 'rtu' ? 1 : -1 },
    )
  }

  const sortIndicator = (key: RtuSortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '')

  return (
    <div className={styles.buildingDetail}>
      <div className={styles.buildingDetailHeader}>
        <button type="button" className={styles.rcbBackBtn} onClick={onBack}>
          ← Buildings
        </button>
        <div className={styles.buildingDetailTitle}>
          <h4>{building.address}</h4>
          <p>
            {building.park}
            {building.cluster ? ` · ${building.cluster}` : ''}
            {building.manager ? ` · ${building.manager}` : ''}
          </p>
          <p className={styles.buildingDetailHint}>
            Global estimate year {defaultReplacementYear}
            {deferredCount > 0
              ? ` · ${deferredCount} RTU${deferredCount === 1 ? '' : 's'} scheduled later`
              : ''}
            {replacementYearFilter
              ? ` · Showing ${displayedItems.length} of ${lineItems.length} RTUs (${replacementYearFilter})`
              : ''}
          </p>
        </div>
        <div className={styles.buildingDetailKpis}>
          <span>
            <strong>{building.units}</strong> RTUs
          </span>
          <span>
            <strong>{Math.round(building.tons * 10) / 10}</strong> tons
          </span>
          <span className={styles.buildingDetailCost}>
            <strong>{rcbMoney(scheduledCost)}</strong>
          </span>
        </div>
      </div>

      <div className={styles.rcbDetailGrid}>
        <div className={styles.rcbTblwrap}>
          <h4>Eligible RTUs — assign replacement year</h4>
          <table className={styles.rcbTbl}>
            <thead>
              <tr>
                <th>RTU</th>
                <th>Model</th>
                <th>Serial</th>
                <th>Make</th>
                <th>Suite</th>
                <th className="num">Installed</th>
                <th className="num">Age</th>
                <th className="num">Tons</th>
                <th className={styles.replYearTh}>
                  <button
                    type="button"
                    className={styles.sortableTh}
                    onClick={() => toggleSort('replacementYear')}
                    title="Sort by replacement year"
                  >
                    Repl. year{sortIndicator('replacementYear')}
                  </button>
                  <select
                    className={styles.rcbYearFilter}
                    value={replacementYearFilter}
                    title="Show RTUs scheduled for a specific replacement year"
                    onChange={(e) => setReplacementYearFilter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">All years</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="num">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {!displayedItems.length ? (
                <tr>
                  <td colSpan={10}>
                    <div className={styles.rcbEmpty}>
                      {replacementYearFilter
                        ? `No RTUs scheduled for ${replacementYearFilter}.`
                        : 'No eligible RTUs for this building.'}
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {displayedItems.map((item) => {
                    const deferred =
                      Number(item.replacementYear) > Number(defaultReplacementYear)
                    const assigned =
                      replacementYearByRtu[rcbReplacementYearKey(item.address, item.rtu)] !=
                      null
                    return (
                      <tr
                        key={item.rtu}
                        className={deferred ? styles.deferredRtuRow : undefined}
                      >
                        <td>{item.rtu}</td>
                        <td>{item.model || '—'}</td>
                        <td>{item.serial || '—'}</td>
                        <td>{item.make || '—'}</td>
                        <td>{item.suite || '—'}</td>
                        <td className="num">{item.year ?? '—'}</td>
                        <td className="num">{item.age ?? '—'}</td>
                        <td className="num">{formatRtuTons(item.tons)}</td>
                        <td>
                          <select
                            className={`${styles.rcbYearSelect}${
                              assigned || deferred ? ` ${styles.rcbYearSelectAssigned}` : ''
                            }`}
                            value={item.replacementYear}
                            title={`Replacement year for ${item.rtu} (global default ${defaultReplacementYear})`}
                            onChange={(e) =>
                              onReplacementYearChange(item.address, item.rtu, e.target.value)
                            }
                          >
                            {yearOptions.map((y) => (
                              <option key={y} value={y}>
                                {y}
                                {y === defaultReplacementYear ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">{rcbMoney(item.cost)}</td>
                      </tr>
                    )
                  })}
                  <tr className={styles.rcbTotal}>
                    <td colSpan={8}>
                      {replacementYearFilter
                        ? `TOTAL — ${displayedItems.length} RTU (${replacementYearFilter})`
                        : `TOTAL — ${building.units} RTU`}
                    </td>
                    <td />
                    <td className="num">
                      {rcbMoney(replacementYearFilter ? displayedCost : scheduledCost)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.rcbTblwrap} style={{ maxWidth: 340 }}>
          <h4>By tonnage tier (scheduled)</h4>
          <table className={styles.rcbTbl}>
            <thead>
              <tr>
                <th>Tier</th>
                <th className="num">Avg unit $</th>
                <th className="num">Qty</th>
                <th className="num">Extended</th>
              </tr>
            </thead>
            <tbody>
              {!tierRows.length ? (
                <tr>
                  <td colSpan={4}>
                    <div className={styles.rcbEmpty}>—</div>
                  </td>
                </tr>
              ) : (
                <>
                  {tierRows.map((tier) => (
                    <tr key={tier.tier}>
                      <td>{tier.label}</td>
                      <td className="num">{rcbMoney(tier.unit)}</td>
                      <td className="num">{tier.qty}</td>
                      <td className="num">{rcbMoney(tier.ext)}</td>
                    </tr>
                  ))}
                  <tr className={styles.rcbTotal}>
                    <td>TOTAL</td>
                    <td />
                    <td className="num">{displayedItems.length}</td>
                    <td className="num">
                      {rcbMoney(replacementYearFilter ? displayedCost : scheduledCost)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
