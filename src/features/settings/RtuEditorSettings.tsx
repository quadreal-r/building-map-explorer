import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal/Modal'
import { isLegacySuiteMarkerName } from '@/lib/legacySuiteMarkers'
import { showToastError, showToastSuccess } from '@/lib/toast'
import type { Building, PortfolioData } from '@/types/domain'
import selectStyles from '@/components/Select/Select.module.css'
import styles from './SettingsModal.module.css'

export interface RtuEditorSettingsProps {
  open: boolean
  onClose: () => void
  portfolio: PortfolioData
  onPortfolioPatch: (data: PortfolioData) => void
}

function rtusForBuilding(building: Building | undefined) {
  return (building?.rtus ?? []).filter((rtu) => !isLegacySuiteMarkerName(rtu.name))
}

export function RtuEditorSettings({
  open,
  onClose,
  portfolio,
  onPortfolioPatch,
}: RtuEditorSettingsProps) {
  const buildings = portfolio.buildings
  const [buildingAddress, setBuildingAddress] = useState(buildings[0]?.address ?? '')
  const building = buildings.find((b) => b.address === buildingAddress)
  const rtus = useMemo(() => rtusForBuilding(building), [building])
  const [rtuName, setRtuName] = useState(rtus[0]?.name ?? '')

  const selectedRtu = rtus.find((rtu) => rtu.name === rtuName)

  const handleBuildingChange = (address: string) => {
    setBuildingAddress(address)
    const nextBuilding = buildings.find((b) => b.address === address)
    const nextRtus = rtusForBuilding(nextBuilding)
    setRtuName(nextRtus[0]?.name ?? '')
  }

  const dispatchMapAction = (type: 'open' | 'move') => {
    if (!buildingAddress || !rtuName) {
      showToastError('Select a building and RTU first.')
      return
    }
    onClose()
    window.dispatchEvent(
      new CustomEvent(type === 'open' ? 'map:openDetail' : 'map:rtuSoloMove', {
        detail: {
          layerKey: 'rtu',
          name: rtuName,
          buildingAddress,
        },
      }),
    )
    if (type === 'move') {
      showToastSuccess('Drag the RTU marker on the map to move it.')
    }
  }

  const handleDelete = () => {
    if (!building || !selectedRtu) {
      showToastError('Select a building and RTU first.')
      return
    }
    if (!window.confirm(`Delete RTU "${selectedRtu.name}" from ${building.address}?`)) return
    onPortfolioPatch({
      ...portfolio,
      buildings: portfolio.buildings.map((b) =>
        b.address === building.address
          ? { ...b, rtus: b.rtus?.filter((rtu) => rtu.name !== selectedRtu.name) }
          : b,
      ),
    })
    const remaining = rtusForBuilding(building).filter((rtu) => rtu.name !== selectedRtu.name)
    setRtuName(remaining[0]?.name ?? '')
    showToastSuccess('✓ RTU deleted — sync to update Cloudflare.')
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit RTU" width={420} align="center">
      <div className={styles.body}>
        <p className={styles.mgrFieldLabel} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
          Move or delete RTUs here. Use the map popup to edit name and description.
        </p>

        <label className={styles.mgrFieldLabel} htmlFor="rtu-editor-building">
          Building
        </label>
        <select
          id="rtu-editor-building"
          className={selectStyles.select}
          value={buildingAddress}
          onChange={(e) => handleBuildingChange(e.target.value)}
        >
          {buildings.map((b) => (
            <option key={b.address} value={b.address}>
              {b.address}
            </option>
          ))}
        </select>

        <label className={styles.mgrFieldLabel} htmlFor="rtu-editor-rtu" style={{ marginTop: 8 }}>
          RTU
        </label>
        <select
          id="rtu-editor-rtu"
          className={selectStyles.select}
          value={rtuName}
          disabled={!rtus.length}
          onChange={(e) => setRtuName(e.target.value)}
        >
          {rtus.length ? (
            rtus.map((rtu) => (
              <option key={rtu.name} value={rtu.name}>
                {rtu.name}
              </option>
            ))
          ) : (
            <option value="">No RTUs on this building</option>
          )}
        </select>

        {selectedRtu ? (
          <p className={styles.mgrFieldLabel} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
            {selectedRtu.description?.split('\n')[0] || 'No description'}
          </p>
        ) : null}

        <div className={styles.tools} style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-action"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            disabled={!selectedRtu}
            onClick={() => dispatchMapAction('open')}
          >
            Show on map
          </button>
          <button
            type="button"
            className="btn-action"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            disabled={!selectedRtu}
            onClick={() => dispatchMapAction('move')}
          >
            ↔ Move on map
          </button>
          <button
            type="button"
            className="btn-action"
            style={{ width: '100%', justifyContent: 'flex-start', color: '#f87171' }}
            disabled={!selectedRtu}
            onClick={handleDelete}
          >
            🗑 Delete RTU
          </button>
        </div>
      </div>
    </Modal>
  )
}
