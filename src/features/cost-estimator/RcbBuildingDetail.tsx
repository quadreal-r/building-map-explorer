import {
  formatRtuTons,
  rcbLineItemsForBuilding,
  rcbMoney,
  rcbTierBreakdownForItems,
  type RcbBuildingSummary,
  type RcbComputeResult,
} from '@/lib/costEstimator'
import styles from './CostBanner.module.css'

export interface RcbBuildingDetailProps {
  building: RcbBuildingSummary
  result: RcbComputeResult
  onBack: () => void
}

export function RcbBuildingDetail({ building, result, onBack }: RcbBuildingDetailProps) {
  const lineItems = rcbLineItemsForBuilding(result, building.address)
  const tierRows = rcbTierBreakdownForItems(lineItems)

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
        </div>
        <div className={styles.buildingDetailKpis}>
          <span>
            <strong>{building.units}</strong> RTUs
          </span>
          <span>
            <strong>{Math.round(building.tons * 10) / 10}</strong> tons
          </span>
          <span className={styles.buildingDetailCost}>
            <strong>{rcbMoney(building.cost)}</strong>
          </span>
        </div>
      </div>

      <div className={styles.rcbDetailGrid}>
        <div className={styles.rcbTblwrap}>
          <h4>Eligible RTUs · {result.year}</h4>
          <table className={styles.rcbTbl}>
            <thead>
              <tr>
                <th>RTU</th>
                <th>Model</th>
                <th>Serial</th>
                <th>Make</th>
                <th>Suite</th>
                <th className="num">Install</th>
                <th className="num">Age</th>
                <th className="num">Tons</th>
                <th className="num">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {!lineItems.length ? (
                <tr>
                  <td colSpan={9}>
                    <div className={styles.rcbEmpty}>No eligible RTUs for this building.</div>
                  </td>
                </tr>
              ) : (
                <>
                  {lineItems.map((item) => (
                    <tr key={item.rtu}>
                      <td>{item.rtu}</td>
                      <td>{item.model || '—'}</td>
                      <td>{item.serial || '—'}</td>
                      <td>{item.make || '—'}</td>
                      <td>{item.suite || '—'}</td>
                      <td className="num">{item.year ?? '—'}</td>
                      <td className="num">{item.age ?? '—'}</td>
                      <td className="num">{formatRtuTons(item.tons)}</td>
                      <td className="num">{rcbMoney(item.cost)}</td>
                    </tr>
                  ))}
                  <tr className={styles.rcbTotal}>
                    <td colSpan={7}>TOTAL — {building.units} RTU</td>
                    <td className="num">{formatRtuTons(building.tons)}</td>
                    <td className="num">{rcbMoney(building.cost)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.rcbTblwrap} style={{ maxWidth: 340 }}>
          <h4>By tonnage tier</h4>
          <table className={styles.rcbTbl}>
            <thead>
              <tr>
                <th>Tier</th>
                <th className="num">Unit $</th>
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
                    <td className="num">{building.units}</td>
                    <td className="num">{rcbMoney(building.cost)}</td>
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
