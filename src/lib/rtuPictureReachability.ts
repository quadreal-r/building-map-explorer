import { rtuPictureFileUrl } from '@/lib/rtuPictureUrls'

/** True when an RTU picture URL responds (HEAD or image load — browsers block cross-origin HEAD on R2). */
export async function isRtuPictureReachableOnCdn(fileName: string): Promise<boolean> {
  const url = rtuPictureFileUrl(fileName)
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (response.ok) return true
  } catch {
    /* HEAD may be blocked by CORS — fall back to image load */
  }

  if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(fileName)) return false

  const IMAGE_PROBE_TIMEOUT_MS = 8000

  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(false), IMAGE_PROBE_TIMEOUT_MS)
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = `${url}${url.includes('?') ? '&' : '?'}reach=${Date.now()}`
  })
}
