/**
 * Google Maps AdvancedMarkerElement wrapper (replaces deprecated google.maps.Marker).
 */

export type AppMapMarker = google.maps.marker.AdvancedMarkerElement

type MarkerListenerEvent = 'click' | 'dragstart' | 'drag' | 'dragend'

interface MarkerMeta {
  attachedMap: google.maps.Map | null
  visible: boolean
}

const markerMeta = new WeakMap<AppMapMarker, MarkerMeta>()

const LISTENER_EVENT: Record<MarkerListenerEvent, string> = {
  click: 'gmp-click',
  dragstart: 'gmp-dragstart',
  drag: 'gmp-drag',
  dragend: 'gmp-dragend',
}

function getMeta(marker: AppMapMarker): MarkerMeta {
  let meta = markerMeta.get(marker)
  if (!meta) {
    meta = { attachedMap: marker.map ?? null, visible: true }
    markerMeta.set(marker, meta)
  }
  return meta
}

function syncMarkerVisibility(marker: AppMapMarker): void {
  const meta = getMeta(marker)
  marker.map = meta.visible ? meta.attachedMap : null
}

function symbolPathD(path: google.maps.Symbol['path']): string {
  if (path === google.maps.SymbolPath.CIRCLE) {
    return 'M 0,0 m -1,0 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0'
  }
  return String(path ?? '')
}

function buildSymbolContent(icon: google.maps.Symbol): HTMLElement {
  const scale = icon.scale ?? 5
  const size = Math.max(12, Math.round(scale * 5))
  const wrap = document.createElement('div')
  wrap.style.width = `${size}px`
  wrap.style.height = `${size}px`
  wrap.style.display = 'flex'
  wrap.style.alignItems = 'center'
  wrap.style.justifyContent = 'center'
  wrap.style.pointerEvents = 'auto'

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '-1.2 -1.2 2.4 2.4')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.style.overflow = 'visible'

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', symbolPathD(icon.path))
  path.setAttribute('fill', icon.fillColor ?? '#2563eb')
  path.setAttribute('fill-opacity', String(icon.fillOpacity ?? 1))
  path.setAttribute('stroke', icon.strokeColor ?? '#fff')
  path.setAttribute('stroke-width', String((icon.strokeWeight ?? 1) / scale))
  svg.appendChild(path)
  wrap.appendChild(svg)
  return wrap
}

function buildIconUrlContent(icon: google.maps.Icon): HTMLElement {
  const img = document.createElement('img')
  img.src = icon.url ?? ''
  img.draggable = false
  img.style.display = 'block'
  const w = icon.scaledSize?.width ?? 24
  const h = icon.scaledSize?.height ?? 24
  img.width = w
  img.height = h
  const wrap = document.createElement('div')
  wrap.appendChild(img)
  return wrap
}

function buildLabelContent(
  label: google.maps.MarkerLabel,
  labelOffsetY = 0,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.pointerEvents = 'none'

  const anchor = document.createElement('div')
  anchor.style.width = '1px'
  anchor.style.height = '1px'
  wrap.appendChild(anchor)

  const span = document.createElement('span')
  span.textContent = label.text ?? ''
  span.style.color = label.color ?? '#fff'
  span.style.fontSize = label.fontSize ?? '11px'
  span.style.fontWeight = label.fontWeight ?? '500'
  span.style.fontFamily = label.fontFamily ?? 'Inter,sans-serif'
  span.style.whiteSpace = 'nowrap'
  span.style.textShadow = '0 0 3px rgba(0,0,0,0.85)'
  span.style.transform = `translateY(${labelOffsetY}px)`
  if (label.className) span.className = label.className
  wrap.appendChild(span)
  return wrap
}

export interface CreateAppMarkerOptions {
  map?: google.maps.Map | null
  position: google.maps.LatLngLiteral
  title?: string
  zIndex?: number
  draggable?: boolean
  clickable?: boolean
  icon?: google.maps.Symbol | google.maps.Icon
  label?: google.maps.MarkerLabel
  /** Pixels below anchor for label-only markers (building labels ≈ 22). */
  labelOffsetY?: number
}

export function createAppMarker(options: CreateAppMarkerOptions): AppMapMarker {
  const { AdvancedMarkerElement } = google.maps.marker

  let content: HTMLElement
  if (options.label && !options.icon) {
    content = buildLabelContent(options.label, options.labelOffsetY ?? 0)
  } else if (options.icon && 'url' in options.icon && options.icon.url) {
    content = buildIconUrlContent(options.icon)
  } else if (options.icon) {
    content = buildSymbolContent(options.icon as google.maps.Symbol)
  } else {
    content = document.createElement('div')
  }

  if (options.label && options.icon) {
    const labeled = buildLabelContent(options.label, options.labelOffsetY ?? 18)
    const symbol = buildSymbolContent(options.icon as google.maps.Symbol)
    const combo = document.createElement('div')
    combo.style.display = 'flex'
    combo.style.flexDirection = 'column'
    combo.style.alignItems = 'center'
    combo.appendChild(symbol)
    const text = labeled.querySelector('span')
    if (text) combo.appendChild(text)
    content = combo
  }

  if (options.clickable === false) {
    content.style.pointerEvents = 'none'
  }

  const marker = new AdvancedMarkerElement({
    map: options.map ?? undefined,
    position: options.position,
    title: options.title,
    zIndex: options.zIndex,
    gmpDraggable: options.draggable ?? false,
    content,
  })

  markerMeta.set(marker, {
    attachedMap: options.map ?? null,
    visible: true,
  })

  return marker
}

export function getAppMarkerPosition(marker: AppMapMarker): google.maps.LatLng | null {
  const pos = marker.position
  if (!pos) return null
  if (pos instanceof google.maps.LatLng) return pos
  return new google.maps.LatLng(pos.lat, pos.lng)
}

export function setAppMarkerPosition(
  marker: AppMapMarker,
  lat: number,
  lng: number,
): void {
  marker.position = { lat, lng }
}

export function setAppMarkerMap(marker: AppMapMarker, map: google.maps.Map | null): void {
  const meta = getMeta(marker)
  meta.attachedMap = map
  syncMarkerVisibility(marker)
}

export function setAppMarkerVisible(marker: AppMapMarker, visible: boolean): void {
  const meta = getMeta(marker)
  meta.visible = visible
  syncMarkerVisibility(marker)
}

export function setAppMarkerDraggable(marker: AppMapMarker, draggable: boolean): void {
  marker.gmpDraggable = draggable
}

export function setAppMarkerZIndex(marker: AppMapMarker, zIndex: number): void {
  marker.zIndex = zIndex
}

export function setAppMarkerIcon(
  marker: AppMapMarker,
  icon: google.maps.Symbol | google.maps.Icon,
): void {
  marker.content =
    'url' in icon && icon.url ? buildIconUrlContent(icon) : buildSymbolContent(icon as google.maps.Symbol)
}

export function setAppMarkerLabel(marker: AppMapMarker, label: google.maps.MarkerLabel): void {
  marker.content = buildLabelContent(label, 0)
}

export function setAppMarkerCursor(marker: AppMapMarker, cursor: string | null): void {
  const el = marker.content
  if (el instanceof HTMLElement) {
    el.style.cursor = cursor ?? ''
  }
}

export function setAppMarkerClickable(marker: AppMapMarker, clickable: boolean): void {
  const el = marker.content
  if (el instanceof HTMLElement) {
    el.style.pointerEvents = clickable ? 'auto' : 'none'
  }
}

export function addAppMarkerListener(
  marker: AppMapMarker,
  event: MarkerListenerEvent,
  handler: (e: google.maps.MapMouseEvent) => void,
): google.maps.MapsEventListener {
  return marker.addListener(LISTENER_EVENT[event], handler)
}
