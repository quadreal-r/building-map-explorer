import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildHardRefreshViewStateFromStores,
  captureHardRefreshViewState,
  consumeHardRefreshViewState,
  consumeSuppressBuildingMapFocus,
  hasPendingHardRefreshView,
  markHardRefreshViewApplied,
  registerLiveMapViewReader,
  saveHardRefreshViewState,
  suppressNextBuildingMapFocus,
  wasHardRefreshViewApplied,
} from '@/lib/hardRefresh'
import { useMapRotationStore } from '@/stores/mapRotationStore'
import { useMapViewStore } from '@/stores/mapViewStore'
import { useSelectionStore } from '@/stores/selectionStore'

describe('hardRefresh', () => {
  beforeEach(() => {
    sessionStorage.clear()
    registerLiveMapViewReader(null)
    useMapViewStore.setState({ snapshot: null })
    useMapRotationStore.setState({ heading: 0, tilt: 0 })
    useSelectionStore.setState({ currentBuilding: null })
  })

  it('builds view state from map snapshot and stores', () => {
    useMapViewStore.getState().setSnapshot({ lat: 43.5, lng: -79.6, zoom: 14 })
    useMapRotationStore.setState({ heading: 30, tilt: 5 })

    const state = buildHardRefreshViewStateFromStores()
    expect(state).toEqual({
      lat: 43.5,
      lng: -79.6,
      zoom: 14,
      heading: 30,
      tilt: 5,
      buildingAddress: null,
    })
  })

  it('save and consume round-trip', () => {
    saveHardRefreshViewState({
      lat: 1,
      lng: 2,
      zoom: 12,
      heading: 0,
      tilt: 0,
      buildingAddress: '100 Main St',
    })
    expect(hasPendingHardRefreshView()).toBe(true)
    expect(consumeHardRefreshViewState()).toMatchObject({
      lat: 1,
      lng: 2,
      zoom: 12,
      buildingAddress: '100 Main St',
    })
    expect(sessionStorage.getItem('bme-hard-refresh-view')).toBeNull()
  })

  it('prefers live map reader over store snapshot when capturing view', () => {
    useMapViewStore.getState().setSnapshot({ lat: 1, lng: 1, zoom: 8 })
    registerLiveMapViewReader(() => ({
      lat: 43.516,
      lng: -79.677,
      zoom: 18,
      heading: 15,
      tilt: 0,
      buildingAddress: '2320 Bristol Circle',
    }))
    expect(captureHardRefreshViewState()).toMatchObject({
      lat: 43.516,
      lng: -79.677,
      zoom: 18,
      buildingAddress: '2320 Bristol Circle',
    })
  })

  it('tracks applied view and suppresses building focus pan once', () => {
    expect(wasHardRefreshViewApplied()).toBe(false)
    markHardRefreshViewApplied()
    expect(wasHardRefreshViewApplied()).toBe(true)

    suppressNextBuildingMapFocus()
    expect(consumeSuppressBuildingMapFocus()).toBe(true)
    expect(consumeSuppressBuildingMapFocus()).toBe(false)
  })
})
