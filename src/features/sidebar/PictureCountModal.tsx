import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal/Modal'
import type { PictureCountSummary } from '@/lib/rtuPictureCountSummary'
import { requestBuildingMapFocus } from '@/lib/searchHits'
import styles from './PictureCountModal.module.css'

type TabId = 'park' | 'building' | 'missing'

export interface PictureCountModalProps {
  open: boolean
  onClose: () => void
  summary: PictureCountSummary | null
  loading?: boolean
  buildingCount: number
}

export function PictureCountModal({
  open,
  onClose,
  summary,
  loading = false,
  buildingCount,
}: PictureCountModalProps) {
  const [tab, setTab] = useState<TabId>('park')

  const missingCount = summary?.rtusMissingPictures.length ?? 0

  const tabLabel = useMemo(
    () => ({
      park: `By park (${summary?.byPark.length ?? 0})`,
      building: `By building (${summary?.byBuilding.length ?? 0})`,
      missing: `No photos (${missingCount})`,
    }),
    [summary, missingCount],
  )

  return (
    <Modal open={open} onClose={onClose} title="RTU picture counts" width={560}>
      <div className={styles.body}>
        {loading && !summary ? (
          <p className={styles.loading}>Loading picture counts…</p>
        ) : summary ? (
          <>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue}>{summary.totalPictures}</span>
                <span className={styles.summaryLabel}>Pictures</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue}>
                  {summary.rtusWithPictures}/{summary.rtusTotal}
                </span>
                <span className={styles.summaryLabel}>RTUs with photos</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryValue}>{buildingCount}</span>
                <span className={styles.summaryLabel}>Buildings shown</span>
              </div>
            </div>

            <div className={styles.tabs}>
              {(['park', 'building', 'missing'] as TabId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.tab}${tab === id ? ` ${styles.tabActive}` : ''}`}
                  onClick={() => setTab(id)}
                >
                  {tabLabel[id]}
                </button>
              ))}
            </div>

            <div className={styles.tableWrap}>
              {tab === 'park' ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Park</th>
                      <th>Pictures</th>
                      <th>RTUs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byPark.map((row) => (
                      <tr key={row.park}>
                        <td className={styles.nameCell}>{row.park}</td>
                        <td className={styles.countCell}>{row.pictures}</td>
                        <td className={styles.mutedCell}>
                          {row.rtusWithPictures}/{row.rtusTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {tab === 'building' ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Building</th>
                      <th>Pictures</th>
                      <th>RTUs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byBuilding.map((row) => (
                      <tr key={row.address}>
                        <td className={styles.nameCell}>
                          <button
                            type="button"
                            className={styles.focusLink}
                            onClick={() => {
                              requestBuildingMapFocus(row.address)
                              onClose()
                            }}
                            title="Focus on map"
                          >
                            {row.address}
                          </button>
                        </td>
                        <td className={styles.countCell}>{row.pictures}</td>
                        <td className={styles.mutedCell}>
                          {row.rtusWithPictures}/{row.rtusTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {tab === 'missing' ? (
                summary.rtusMissingPictures.length ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>RTU</th>
                        <th>Building</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rtusMissingPictures.map((row) => (
                        <tr key={`${row.address}|${row.rtuName}`}>
                          <td className={styles.nameCell}>{row.rtuName}</td>
                          <td className={styles.mutedCell}>
                            <button
                              type="button"
                              className={styles.focusLink}
                              onClick={() => {
                                requestBuildingMapFocus(row.address)
                                onClose()
                              }}
                              title="Focus on map"
                            >
                              {row.address}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.empty}>Every RTU in the current list has at least one picture.</p>
                )
              ) : null}
            </div>

            <p className={styles.hint}>
              Counts use the Cloudflare manifest plus any photos stored in this browser. Toggle map badges with
              Pic count in the sidebar.
            </p>
          </>
        ) : (
          <p className={styles.empty}>No picture count data available.</p>
        )}
      </div>
    </Modal>
  )
}
