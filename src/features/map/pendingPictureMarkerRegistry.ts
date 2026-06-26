import {
  clearRtuDropTargetHighlight,
  updateRtuDropTargetHighlightFromMarker,
} from '@/features/map/rtuDropTargetHighlight'
import {
  addAppMarkerListener,
  createAppMarker,
  getAppMarkerPosition,
  setAppMarkerMap,
  setAppMarkerPosition,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import { RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { findNearestRtuAt, type StagedGpsPicture } from '@/lib/rtuPictureGpsAssign'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { useUiStore } from '@/stores/uiStore'
import type { Building, Rtu } from '@/types/domain'

interface PictureMarkerEntry {
  id: string
  marker: AppMapMarker
  dragStartListener: google.maps.MapsEventListener
  dragListener: google.maps.MapsEventListener
  dragEndListener: google.maps.MapsEventListener
  clickListener: google.maps.MapsEventListener
  pointerCleanup: () => void
  dblClickCleanup: () => void
}

const markersById = new Map<string, PictureMarkerEntry>()
const draggingIds = new Set<string>()
const assigningIds = new Set<string>()

const COORD_EPSILON = 1e-7
const ASSIGN_DEBOUNCE_MS = 400
const lastAssignAttemptAt = new Map<string, number>()

function coordsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > COORD_EPSILON
}

function openPendingPicturesViewer(pendingId: string): void {
  const items = usePendingRtuPictureStore.getState().items
  const index = items.findIndex((item) => item.id === pendingId)
  if (index < 0) return

  useUiStore.getState().openRtuPictureViewer({
    pictures: items.map((item, pictureIndex) => ({
      fileName: item.originalName,
      fullUrl: item.previewUrl,
      thumbUrl: item.previewUrl,
      index: pictureIndex + 1,
    })),
    index,
    buildingAddress: '',
    rtuName: 'Pending — drag onto RTU to assign',
  })
}

function attachDoubleClickPreview(marker: AppMapMarker, pendingId: string): () => void {
  const el = marker.content
  if (!(el instanceof HTMLElement)) return () => {}

  const handler = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    openPendingPicturesViewer(pendingId)
  }
  el.addEventListener('dblclick', handler)
  return () => el.removeEventListener('dblclick', handler)
}

function describeDropMiss(buildings: Building[], lat: number, lng: number): string {
  const nearest = findNearestRtuAt(buildings, lat, lng, Number.POSITIVE_INFINITY)
  if (!nearest) {
    return `No RTU markers found. Move within ${RTU_PICTURE_DROP_FEET} ft of an RTU pin, or click the RTU pin and use Assign pending photo.`
  }
  return `Too far to assign (need within ${RTU_PICTURE_DROP_FEET} ft). Nearest: ${nearest.rtu.name} (${Math.round(nearest.feet)} ft away). Tip: click the RTU pin → Assign pending photo.`
}

function pictureMarkerContent(previewUrl: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.dataset.pendingPictureMarker = '1'
  wrap.style.width = '40px'
  wrap.style.height = '40px'
  wrap.style.borderRadius = '50%'
  wrap.style.border = '2px solid #ffffff'
  wrap.style.overflow = 'hidden'
  wrap.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)'
  wrap.style.pointerEvents = 'auto'
  wrap.style.cursor = 'grab'
  wrap.style.touchAction = 'none'

  const img = document.createElement('img')
  img.src = previewUrl
  img.alt = ''
  img.draggable = false
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'cover'
  img.style.display = 'block'
  img.style.pointerEvents = 'none'
  wrap.appendChild(img)
  return wrap
}

function destroyEntry(entry: PictureMarkerEntry): void {
  google.maps.event.removeListener(entry.dragStartListener)
  google.maps.event.removeListener(entry.dragListener)
  google.maps.event.removeListener(entry.dragEndListener)
  google.maps.event.removeListener(entry.clickListener)
  entry.pointerCleanup()
  entry.dblClickCleanup()
  setAppMarkerMap(entry.marker, null)
}

export function clearAllPendingPictureMarkers(): void {
  clearRtuDropTargetHighlight()
  for (const entry of markersById.values()) {
    destroyEntry(entry)
  }
  markersById.clear()
  draggingIds.clear()
  assigningIds.clear()
  lastAssignAttemptAt.clear()
}

interface PendingMarkerHandlers {
  updatePosition: (id: string, lat: number, lng: number) => void
  assignToRtu: (
    id: string,
    building: Building,
    rtu: Rtu,
  ) => Promise<{ fileName: string; pictureIndex: number }>
}

function attemptAssignPendingPicture(
  pendingId: string,
  originalName: string,
  lat: number,
  lng: number,
  getBuildings: () => Building[],
  handlers: PendingMarkerHandlers,
): void {
  const now = Date.now()
  const lastAttempt = lastAssignAttemptAt.get(pendingId) ?? 0
  if (assigningIds.has(pendingId) || now - lastAttempt < ASSIGN_DEBOUNCE_MS) return
  lastAssignAttemptAt.set(pendingId, now)

  handlers.updatePosition(pendingId, lat, lng)

  const buildings = getBuildings()
  const match = findNearestRtuAt(buildings, lat, lng, RTU_PICTURE_DROP_FEET)
  if (!match) {
    showToastError(describeDropMiss(buildings, lat, lng))
    return
  }

  assigningIds.add(pendingId)
  void handlers
    .assignToRtu(pendingId, match.building, match.rtu)
    .then((result) => {
      showToastSuccess(`✓ Assigned ${originalName} → ${result.fileName} (${match.rtu.name})`)
    })
    .catch((error) => {
      showToastError(error instanceof Error ? error.message : 'Failed to assign picture')
    })
    .finally(() => {
      assigningIds.delete(pendingId)
    })
}

function attachPointerDropHandler(
  marker: AppMapMarker,
  pendingId: string,
  originalName: string,
  getBuildings: () => Building[],
  handlers: PendingMarkerHandlers,
): () => void {
  const el = marker.content
  if (!(el instanceof HTMLElement)) return () => {}

  let pointerDown = false
  let startX = 0
  let startY = 0
  let moved = false

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    pointerDown = true
    moved = false
    startX = event.clientX
    startY = event.clientY
    try {
      el.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pointerDown) return
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) {
      moved = true
    }
    if (moved) {
      updateRtuDropTargetHighlightFromMarker(getBuildings(), marker)
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!pointerDown) return
    pointerDown = false
    try {
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* ignore */
    }
    clearRtuDropTargetHighlight()
    if (!moved) return

    draggingIds.delete(pendingId)
    const pos = getAppMarkerPosition(marker)
    if (!pos) return
    attemptAssignPendingPicture(
      pendingId,
      originalName,
      pos.lat(),
      pos.lng(),
      getBuildings,
      handlers,
    )
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)

  return () => {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('pointercancel', onPointerUp)
  }
}

export function syncPendingPictureMarkers(
  map: google.maps.Map | null,
  items: StagedGpsPicture[],
  getBuildings: () => Building[],
  handlers: PendingMarkerHandlers,
): void {
  if (!map) {
    clearAllPendingPictureMarkers()
    return
  }

  const itemIds = new Set(items.map((item) => item.id))

  for (const [id, entry] of [...markersById.entries()]) {
    if (itemIds.has(id)) continue
    destroyEntry(entry)
    markersById.delete(id)
    draggingIds.delete(id)
    assigningIds.delete(id)
    lastAssignAttemptAt.delete(id)
  }

  for (const item of items) {
    const existing = markersById.get(item.id)
    if (existing) {
      setAppMarkerMap(existing.marker, map)
      if (draggingIds.has(item.id) || assigningIds.has(item.id)) continue
      const pos = getAppMarkerPosition(existing.marker)
      if (!pos || coordsDiffer(pos.lat(), item.lat) || coordsDiffer(pos.lng(), item.lng)) {
        setAppMarkerPosition(existing.marker, item.lat, item.lng)
      }
      continue
    }

    const pendingId = item.id
    const originalName = item.originalName
    const marker = createAppMarker({
      map,
      position: { lat: item.lat, lng: item.lng },
      draggable: true,
      title: `Photo: ${item.originalName} — drag onto RTU pin, or click RTU pin → Assign pending photo`,
      content: pictureMarkerContent(item.previewUrl),
      zIndex: 2000,
      anchorLeft: '-50%',
      anchorTop: '-50%',
    })

    const dblClickCleanup = attachDoubleClickPreview(marker, pendingId)
    const pointerCleanup = attachPointerDropHandler(
      marker,
      pendingId,
      originalName,
      getBuildings,
      handlers,
    )

    const dragStartListener = addAppMarkerListener(marker, 'dragstart', () => {
      draggingIds.add(pendingId)
      clearRtuDropTargetHighlight()
      const el = marker.content
      if (el instanceof HTMLElement) el.style.cursor = 'grabbing'
    })

    const dragListener = addAppMarkerListener(marker, 'drag', () => {
      updateRtuDropTargetHighlightFromMarker(getBuildings(), marker)
    })

    const dragEndListener = addAppMarkerListener(marker, 'dragend', () => {
      draggingIds.delete(pendingId)
      clearRtuDropTargetHighlight()
      const el = marker.content
      if (el instanceof HTMLElement) el.style.cursor = 'grab'
      const pos = getAppMarkerPosition(marker)
      if (!pos) return
      attemptAssignPendingPicture(
        pendingId,
        originalName,
        pos.lat(),
        pos.lng(),
        getBuildings,
        handlers,
      )
    })

    const clickListener = addAppMarkerListener(marker, 'click', (e) => {
      e.domEvent?.stopPropagation()
    })

    markersById.set(item.id, {
      id: item.id,
      marker,
      dragStartListener,
      dragListener,
      dragEndListener,
      clickListener,
      pointerCleanup,
      dblClickCleanup,
    })
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearAllPendingPictureMarkers()
  })
}
