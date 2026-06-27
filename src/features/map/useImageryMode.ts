import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { ESRI_TILE_URL, IMAGERY_MODES, USGS_TILE_URL } from '@/lib/constants'

export function useImageryMode(
  map: google.maps.Map | null,
  imageryModeRef: MutableRefObject<number>,
  imageryOverlayRef: MutableRefObject<google.maps.ImageMapType | null>,
) {
  const removeImageryOverlay = useCallback(() => {
    if (!map || !imageryOverlayRef.current) return
    const idx = map.overlayMapTypes.getArray().indexOf(imageryOverlayRef.current)
    if (idx >= 0) map.overlayMapTypes.removeAt(idx)
    imageryOverlayRef.current = null
  }, [map, imageryOverlayRef])

  const applyTileOverlay = useCallback(
    (getTileUrl: (coord: google.maps.Point, zoom: number) => string, _name: string) => {
      if (!map) return
      removeImageryOverlay()
      const imgType = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) => getTileUrl(coord, zoom),
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 20,
        name: _name,
        opacity: 1,
      })
      map.setMapTypeId('roadmap')
      map.overlayMapTypes.insertAt(0, imgType)
      imageryOverlayRef.current = imgType
    },
    [map, imageryOverlayRef, removeImageryOverlay],
  )

  const cycleImagery = useCallback(() => {
    if (!map) return null
    imageryModeRef.current = (imageryModeRef.current + 1) % 3
    const mode = imageryModeRef.current
    if (mode === 0) {
      removeImageryOverlay()
      map.setMapTypeId('hybrid')
    } else if (mode === 1) {
      applyTileOverlay(
        (coord, zoom) =>
          ESRI_TILE_URL.replace('{z}', String(zoom))
            .replace('{y}', String(coord.y))
            .replace('{x}', String(coord.x)),
        'Esri',
      )
    } else {
      applyTileOverlay(
        (coord, zoom) =>
          USGS_TILE_URL.replace('{z}', String(zoom))
            .replace('{y}', String(coord.y))
            .replace('{x}', String(coord.x)),
        'USGS',
      )
    }
    return IMAGERY_MODES[mode] ?? IMAGERY_MODES[0]!
  }, [map, imageryModeRef, removeImageryOverlay, applyTileOverlay])

  return { cycleImagery, applyTileOverlay, removeImageryOverlay }
}
