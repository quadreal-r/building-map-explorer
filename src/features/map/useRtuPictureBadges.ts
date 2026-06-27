import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { buildRtuPicturesHtml } from '@/lib/mapInfoWindow'
import {
  getRtuPictureCountMap,
  listRtuPictures,
  loadRtuPictureManifest,
  resolveManifestRtuKey,
  revokeRtuPictureUrls,
  rtuPictureKey,
  type RtuPicture,
} from '@/lib/rtuPictures'
import { syncDetailMarkerAppearance } from '@/features/map/mapMarkersState'
import type { ActiveDetailInfo, DetailMarkerEntry } from '@/features/map/mapMarkersState'
import type { PortfolioData, Rtu } from '@/types/domain'

export function useRtuPictureBadges(
  map: google.maps.Map | null,
  portfolio: Pick<PortfolioData, 'buildings' | 'polygons' | 'utilities'>,
  detailMarkersRef: MutableRefObject<DetailMarkerEntry[]>,
  activeDetailInfoRef: MutableRefObject<ActiveDetailInfo | null>,
  activeRtuPicturesRef: MutableRefObject<RtuPicture[]>,
  infoWindowRef: MutableRefObject<google.maps.InfoWindow | null>,
  refreshDetailVisibility: () => void,
) {
  const clearActiveRtuPictures = useCallback(() => {
    revokeRtuPictureUrls(activeRtuPicturesRef.current.filter((p) => p.source === 'indexeddb'))
    activeRtuPicturesRef.current = []
  }, [activeRtuPicturesRef])

  const refreshRtuPicturesView = useCallback(async () => {
    const ctx = activeDetailInfoRef.current
    const iw = infoWindowRef.current
    if (!ctx || !iw || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return

    const buildingAddress = ctx.entry.building?.address ?? ''
    if (!buildingAddress) return

    clearActiveRtuPictures()
    const pictures = await listRtuPictures(buildingAddress, ctx.entry.data.name)
    activeRtuPicturesRef.current = pictures
    if (pictures.length) {
      ctx.pictureIndex = Math.min(Math.max(ctx.pictureIndex, 0), pictures.length - 1)
    } else {
      ctx.pictureIndex = 0
    }

    iw.setContent(
      buildRtuPicturesHtml(
        ctx.entry.data as Rtu,
        buildingAddress,
        pictures,
        ctx.pictureIndex,
      ),
    )
  }, [activeDetailInfoRef, activeRtuPicturesRef, infoWindowRef, clearActiveRtuPictures])

  const refreshRtuPictureBadges = useCallback(async () => {
    if (!map) return
    const [counts, manifest] = await Promise.all([
      getRtuPictureCountMap(),
      loadRtuPictureManifest(),
    ])

    detailMarkersRef.current = detailMarkersRef.current.map((dm) => {
      if (dm.type !== 'rtu' || !dm.building) {
        return { ...dm, pictureCount: 0 }
      }

      const key = rtuPictureKey(dm.building.address, dm.data.name)
      const manifestKey = resolveManifestRtuKey(dm.building.address, dm.data.name, manifest)
      const count = Math.max(counts.get(key) ?? 0, counts.get(manifestKey) ?? 0)
      const updated = { ...dm, pictureCount: count }
      syncDetailMarkerAppearance(updated, false)
      return updated
    })

    refreshDetailVisibility()
  }, [map, portfolio, detailMarkersRef, refreshDetailVisibility])

  return { clearActiveRtuPictures, refreshRtuPicturesView, refreshRtuPictureBadges }
}
