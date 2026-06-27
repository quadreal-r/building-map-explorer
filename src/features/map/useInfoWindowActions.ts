import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { confirm } from '@/stores/confirmStore'
import {
  addAppMarkerListener,
  getAppMarkerPosition,
  setAppMarkerCursor,
  setAppMarkerDraggable,
  setAppMarkerPosition,
  setAppMarkerVisible,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import {
  buildBuildingInfoHtml,
  buildDetailEditHtml,
  buildDetailInfoHtml,
  copyPopupText,
} from '@/lib/mapInfoWindow'
import { closeAllMapPopups, ensureInfoWindowVisible } from '@/lib/mapPopups'
import { afterMapViewChange } from '@/lib/mapRotation'
import {
  addRtuPicturesFromFiles,
  deleteRtuPicture,
  hideRtuManifestPicture,
  listRtuPictures,
  notifyRtuPicturesChanged,
  rtuPictureKey,
  type RtuPicture,
} from '@/lib/rtuPictures'
import {
  countPendingPicturesNearRtu,
  findNearestPendingPictureToRtu,
} from '@/lib/rtuPictureGpsAssign'
import { RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { polygonsForBuilding } from '@/lib/polygonBuildings'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { useUiStore } from '@/stores/uiStore'
import { showToastError, showToastSuccess } from '@/lib/toast'
import {
  markMarkerDragJustEnded,
  syncDetailMarkerPositions,
  type ActiveDetailInfo,
  type BuildingMarkerEntry,
  type DetailMarkerEntry,
  type MapMarkersCallbacks,
  type PolygonBuildingIndex,
} from '@/features/map/mapMarkersState'
import type { Building, LayerKey, Polygon, Rtu, Utility } from '@/types/domain'

export function useInfoWindowActions(
  map: google.maps.Map | null,
  buildingMarkersRef: MutableRefObject<BuildingMarkerEntry[]>,
  detailMarkersRef: MutableRefObject<DetailMarkerEntry[]>,
  infoWindowRef: MutableRefObject<google.maps.InfoWindow | null>,
  activeInfoMarkerRef: MutableRefObject<AppMapMarker | null>,
  activeDetailInfoRef: MutableRefObject<ActiveDetailInfo | null>,
  activeRtuPicturesRef: MutableRefObject<RtuPicture[]>,
  soloMoveRef: MutableRefObject<{ marker: AppMapMarker; label?: AppMapMarker } | null>,
  soloMoveListenerRef: MutableRefObject<google.maps.MapsEventListener | null>,
  callbacksRef: MutableRefObject<MapMarkersCallbacks>,
  polygonIndexRef: MutableRefObject<PolygonBuildingIndex>,
  portfolioRef: MutableRefObject<{ buildings: Building[]; utilities: Utility[]; polygons: Polygon[] }>,
  clearActiveRtuPictures: () => void,
  refreshRtuPicturesView: () => Promise<void>,
) {
  const stopSoloMove = useCallback(() => {
    const solo = soloMoveRef.current
    if (!solo) return
    const globalDrag = useSelectionStore.getState().dragMode
    setAppMarkerDraggable(solo.marker, globalDrag)
    setAppMarkerCursor(solo.marker, globalDrag ? 'grab' : null)
    if (soloMoveListenerRef.current) {
      google.maps.event.removeListener(soloMoveListenerRef.current)
      soloMoveListenerRef.current = null
    }
    soloMoveRef.current = null
  }, [soloMoveRef, soloMoveListenerRef])

  const startSoloMove = useCallback(
    (marker: AppMapMarker, label?: AppMapMarker) => {
      stopSoloMove()
      infoWindowRef.current?.close()
      activeInfoMarkerRef.current = null
      soloMoveRef.current = { marker, label }
      setAppMarkerDraggable(marker, true)
      setAppMarkerCursor(marker, 'grab')
      showToastSuccess('- Drag marker to reposition.')
      soloMoveListenerRef.current = addAppMarkerListener(marker, 'dragend', () => {
        const pos = getAppMarkerPosition(marker)
        if (pos) {
          const lat = pos.lat()
          const lng = pos.lng()
          const buildingEntry = buildingMarkersRef.current.find((e) => e.marker === marker)
          if (buildingEntry) {
            setAppMarkerPosition(buildingEntry.label, lat, lng)
            callbacksRef.current.onBuildingMoved?.(buildingEntry.building, lat, lng)
          } else {
            const detailEntry = detailMarkersRef.current.find((e) => e.marker === marker)
            if (detailEntry) {
              syncDetailMarkerPositions(detailEntry, lat, lng)
              callbacksRef.current.onDetailMoved?.(
                detailEntry.type,
                detailEntry.data,
                lat,
                lng,
                detailEntry.building,
              )
            }
          }
        }
        stopSoloMove()
        markMarkerDragJustEnded()
        showToastSuccess('- Position updated - save to HTML to keep changes.')
      })
    },
    [
      infoWindowRef,
      activeInfoMarkerRef,
      buildingMarkersRef,
      detailMarkersRef,
      callbacksRef,
      soloMoveRef,
      soloMoveListenerRef,
      stopSoloMove,
    ],
  )

  const openBuildingInfo = useCallback(
    (building: Building, marker: AppMapMarker) => {
      if (!map || !infoWindowRef.current) return
      if (activeInfoMarkerRef.current === marker) {
        closeAllMapPopups()
        return
      }
      closeAllMapPopups()
      activeDetailInfoRef.current = null
      clearActiveRtuPictures()
      const tenantPolygons = polygonsForBuilding(polygonIndexRef.current, building.address)
      const managerRenames = useSettingsStore.getState().managerRenames
      infoWindowRef.current.setContent(
        buildBuildingInfoHtml(building, tenantPolygons, managerRenames),
      )
      infoWindowRef.current.open({ map, anchor: marker })
      ensureInfoWindowVisible(map, infoWindowRef.current)
      activeInfoMarkerRef.current = marker
      afterMapViewChange(map)
    },
    [map, infoWindowRef, activeInfoMarkerRef, activeDetailInfoRef, polygonIndexRef, portfolioRef, clearActiveRtuPictures],
  )

  const detailHtmlOptions = useCallback(
    (entry: DetailMarkerEntry, pendingPictureAssignCount = 0) => ({
      buildingAddress: entry.building?.address,
      pendingPictureAssignCount,
    }),
    [],
  )

  const openDetailInfo = useCallback(
    (entry: DetailMarkerEntry) => {
      if (!map || !infoWindowRef.current) return
      const { type, data, marker } = entry
      if (activeInfoMarkerRef.current === marker) {
        closeAllMapPopups()
        return
      }
      closeAllMapPopups()
      clearActiveRtuPictures()
      activeDetailInfoRef.current = { entry, view: 'info', pictureIndex: 0 }
      const rtu = entry.type === 'rtu' ? (entry.data as Rtu) : null
      const pendingItems = usePendingRtuPictureStore.getState().items
      const pendingPictureAssignCount =
        rtu != null
          ? countPendingPicturesNearRtu(pendingItems, rtu.lat, rtu.lng)
          : 0
      infoWindowRef.current.setContent(
        buildDetailInfoHtml(type, data, detailHtmlOptions(entry, pendingPictureAssignCount)),
      )
      infoWindowRef.current.open({ map, anchor: marker })
      ensureInfoWindowVisible(map, infoWindowRef.current)
      activeInfoMarkerRef.current = marker
      setAppMarkerVisible(marker, true)
      afterMapViewChange(map)
    },
    [map, infoWindowRef, activeInfoMarkerRef, activeDetailInfoRef, clearActiveRtuPictures, detailHtmlOptions],
  )

  const attachInfoWindowActions = useCallback(() => {
    const iw = infoWindowRef.current
    if (!iw) return
    google.maps.event.addListenerOnce(iw, 'domready', () => {
      const container = document.querySelector('.gm-style-iw-d')
      if (!container) return

      container.querySelector('[data-iw-action="close"]')?.addEventListener('click', () => {
        iw.close()
        activeInfoMarkerRef.current = null
        activeDetailInfoRef.current = null
        clearActiveRtuPictures()
      })

      container.querySelector('[data-iw-action="copy-all"]')?.addEventListener('click', () => {
        const source = container.querySelector('.iw-copy-source') as HTMLTextAreaElement | null
        if (source?.value) copyPopupText(source.value)
      })

      container.querySelector('[data-iw-action="move"]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement
        const kind = btn.getAttribute('data-iw-kind')
        if (kind === 'building') {
          const address = btn.getAttribute('data-iw-address') ?? ''
          const entry = buildingMarkersRef.current.find((m) => m.building.address === address)
          if (!entry) return
          startSoloMove(entry.marker, entry.label)
          return
        }
        if (kind === 'detail') {
          const layerKey = btn.getAttribute('data-iw-layer') as LayerKey
          const name = btn.getAttribute('data-iw-name') ?? ''
          const buildingAddr = btn.getAttribute('data-iw-building') ?? ''
          const entry = detailMarkersRef.current.find(
            (dm) =>
              dm.type === layerKey &&
              dm.data.name === name &&
              (buildingAddr ? dm.building?.address === buildingAddr : !dm.building),
          )
          if (!entry) return
          startSoloMove(entry.marker)
        }
      })

      const delBtn = container.querySelector('[data-iw-action="delete"]')
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          void (async () => {
            const layerKey = delBtn.getAttribute('data-iw-layer') as LayerKey
            const name = delBtn.getAttribute('data-iw-name') ?? ''
            const buildingAddr = delBtn.getAttribute('data-iw-building') ?? ''
            const entry = detailMarkersRef.current.find(
              (dm) =>
                dm.type === layerKey &&
                dm.data.name === name &&
                (buildingAddr ? dm.building?.address === buildingAddr : !dm.building),
            )
            if (!entry) return
            if (!(await confirm(`Delete marker "${name}"?`))) return
            iw.close()
            activeInfoMarkerRef.current = null
            callbacksRef.current.onDeleteDetail?.(entry.type, entry.data, entry.building)
          })()
        })
      }

      container.querySelector('[data-iw-action="edit-text"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.entry.type !== 'rtu') return
        ctx.view = 'edit'
        iw.setContent(
          buildDetailEditHtml(ctx.entry.data as Rtu, {
            buildingAddress: ctx.entry.building?.address,
          }),
        )
      })

      container.querySelector('[data-iw-action="edit-cancel"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.view !== 'edit') return
        ctx.view = 'info'
        const { type, data } = ctx.entry
        const pendingPictureAssignCount =
          type === 'rtu'
            ? countPendingPicturesNearRtu(
                usePendingRtuPictureStore.getState().items,
                (data as Rtu).lat,
                (data as Rtu).lng,
              )
            : 0
        iw.setContent(
          buildDetailInfoHtml(type, data, detailHtmlOptions(ctx.entry, pendingPictureAssignCount)),
        )
      })

      container.querySelector('[data-iw-action="edit-save"]')?.addEventListener('click', () => {
        void (async () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'edit' || !ctx.entry.building) return
          const nameInput = container.querySelector('[data-iw-field="name"]') as HTMLInputElement | null
          const descInput = container.querySelector(
            '[data-iw-field="description"]',
          ) as HTMLTextAreaElement | null
          if (!nameInput || !descInput) return
          const oldName =
            container.querySelector('.iw-edit')?.getAttribute('data-iw-rtu-name') ??
            ctx.entry.data.name ??
            ''
          try {
            await callbacksRef.current.onEditDetail?.(
              'rtu',
              ctx.entry.building,
              oldName,
              { name: nameInput.value, description: descInput.value },
            )
          } catch {
            return
          }
          iw.close()
          activeInfoMarkerRef.current = null
          activeDetailInfoRef.current = null
        })()
      })

      container.querySelector('[data-iw-action="pictures"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.entry.type !== 'rtu') return
        ctx.view = 'pictures'
        ctx.pictureIndex = 0
        void refreshRtuPicturesView()
      })

      container
        .querySelector('[data-iw-action="picture-assign-pending"]')
        ?.addEventListener('click', () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx || ctx.entry.type !== 'rtu' || !ctx.entry.building) return
          const rtu = ctx.entry.data as Rtu
          const building = ctx.entry.building
          const items = usePendingRtuPictureStore.getState().items
          const nearest = findNearestPendingPictureToRtu(items, rtu.lat, rtu.lng)
          if (!nearest) {
            showToastError(
              `No pending photos within ${RTU_PICTURE_DROP_FEET} ft of ${rtu.name}. Drag photo markers closer first.`,
            )
            return
          }
          void usePendingRtuPictureStore
            .getState()
            .assignToRtu(nearest.item.id, building, rtu)
            .then((result) => {
              showToastSuccess(
                `- Assigned ${nearest.item.originalName} - ${result.fileName} (${rtu.name})`,
              )
              const remaining = countPendingPicturesNearRtu(
                usePendingRtuPictureStore.getState().items,
                rtu.lat,
                rtu.lng,
              )
              if (ctx.view === 'info') {
                infoWindowRef.current?.setContent(
                  buildDetailInfoHtml('rtu', rtu, detailHtmlOptions(ctx.entry, remaining)),
                )
              }
            })
            .catch((error) => {
              showToastError(error instanceof Error ? error.message : 'Failed to assign picture')
            })
        })

      container
        .querySelector('[data-iw-action="pictures-back"]')
        ?.addEventListener('click', () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx) return
          clearActiveRtuPictures()
          ctx.view = 'info'
          ctx.pictureIndex = 0
          const { type, data } = ctx.entry
          iw.setContent(buildDetailInfoHtml(type, data, detailHtmlOptions(ctx.entry)))
        })

      const stepPicture = (delta: number) => {
        const ctx = activeDetailInfoRef.current
        const total = activeRtuPicturesRef.current.length
        if (!ctx || ctx.view !== 'pictures' || total <= 1) return
        ctx.pictureIndex = (ctx.pictureIndex + delta + total) % total
        void refreshRtuPicturesView()
      }

      container
        .querySelector('[data-iw-action="picture-prev"]')
        ?.addEventListener('click', () => stepPicture(-1))
      container
        .querySelector('[data-iw-action="picture-next"]')
        ?.addEventListener('click', () => stepPicture(1))

      container
        .querySelector('[data-iw-action="picture-open-viewer"]')
        ?.addEventListener('click', () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return
          const buildingAddress = ctx.entry.building?.address
          if (!buildingAddress) return
          void listRtuPictures(buildingAddress, ctx.entry.data.name).then((pictures) => {
            if (!pictures.length) return
            activeRtuPicturesRef.current = pictures
            const pictureIndex = Math.min(ctx.pictureIndex, pictures.length - 1)
            useUiStore.getState().openRtuPictureViewer({
              pictures: pictures.map((p) => ({
                fileName: p.fileName,
                fullUrl: p.fullUrl,
                thumbUrl: p.thumbUrl,
                index: p.index,
              })),
              index: pictureIndex,
              buildingAddress,
              rtuName: ctx.entry.data.name,
            })
          })
        })

      container
        .querySelector('[data-iw-action="picture-add"]')
        ?.addEventListener('click', () => {
          const input = container.querySelector(
            '[data-iw-picture-input]',
          ) as HTMLInputElement | null
          input?.click()
        })

      const fileInput = container.querySelector(
        '[data-iw-picture-input]',
      ) as HTMLInputElement | null
      fileInput?.addEventListener('change', () => {
        void (async () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return
          const buildingAddress = ctx.entry.building?.address
          if (!buildingAddress || !fileInput.files?.length) return
          const added = await addRtuPicturesFromFiles(
            buildingAddress,
            ctx.entry.data.name,
            [...fileInput.files],
          )
          fileInput.value = ''
          if (added.length) {
            ctx.pictureIndex = added.length - 1
            showToastSuccess(`- ${added.length} picture${added.length === 1 ? '' : 's'} added`)
          }
          await refreshRtuPicturesView()
        })()
      })

      container
        .querySelector('[data-iw-action="picture-delete"]')
        ?.addEventListener('click', () => {
          void (async () => {
            const ctx = activeDetailInfoRef.current
            const btn = container.querySelector(
              '[data-iw-action="picture-delete"]',
            ) as HTMLElement | null
            if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures' || !btn) return

            const fileName = btn.getAttribute('data-iw-picture-file') ?? ''
            const isStatic = btn.getAttribute('data-iw-picture-static') === '1'
            const buildingAddress = ctx.entry.building?.address
            if (!buildingAddress || !fileName) return

            if (isStatic) {
              hideRtuManifestPicture(
                rtuPictureKey(buildingAddress, ctx.entry.data.name),
                fileName,
              )
              notifyRtuPicturesChanged()
              showToastSuccess(
                '- Picture hidden - use Settings - Sync to Cloudflare & GitHub to hide for everyone.',
              )
              await refreshRtuPicturesView()
              return
            }

            if (!(await confirm(`Delete picture "${fileName}"?`))) return

            const result = await deleteRtuPicture(
              buildingAddress,
              ctx.entry.data.name,
              fileName,
            )
            if (result === 'deleted') {
              showToastSuccess('- Picture deleted')
              await refreshRtuPicturesView()
            }
          })()
        })
    })
  }, [
    infoWindowRef,
    activeInfoMarkerRef,
    activeDetailInfoRef,
    activeRtuPicturesRef,
    buildingMarkersRef,
    detailMarkersRef,
    callbacksRef,
    startSoloMove,
    clearActiveRtuPictures,
    refreshRtuPicturesView,
    detailHtmlOptions,
  ])

  return { stopSoloMove, startSoloMove, openBuildingInfo, openDetailInfo, attachInfoWindowActions }
}
