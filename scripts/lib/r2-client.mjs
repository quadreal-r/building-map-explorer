/**
 * Cloudflare R2 (S3-compatible) client for RTU picture uploads.
 *
 * GitHub / local env (any alias supported):
 *   R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID or CLOUDFLARE_R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY or CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME or R2_BUCKET or CLOUDFLARE_R2_BUCKET
 *   R2_PUBLIC_URL or VITE_RTU_PICTURES_BASE_URL (public CDN base, trailing slash optional)
 *   R2_KEY_PREFIX (optional object key prefix, e.g. rtu-pictures/)
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function isR2Configured() {
  return Boolean(createR2Client() && getR2Bucket())
}

export function createR2Client() {
  const accountId = readEnv('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID')
  const accessKeyId = readEnv('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID')
  const secretAccessKey = readEnv(
    'R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  )
  if (!accountId || !accessKeyId || !secretAccessKey) return null

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function getR2Bucket() {
  return readEnv('R2_BUCKET_NAME', 'R2_BUCKET', 'CLOUDFLARE_R2_BUCKET')
}

export function getR2PublicBaseUrl() {
  const url = readEnv('R2_PUBLIC_URL', 'VITE_RTU_PICTURES_BASE_URL')
  if (!url) return null
  return url.endsWith('/') ? url : `${url}/`
}

export function getR2KeyPrefix() {
  const prefix = readEnv('R2_KEY_PREFIX') ?? ''
  if (!prefix) return ''
  return prefix.endsWith('/') ? prefix : `${prefix}/`
}

export function r2ObjectKey(fileName) {
  return `${getR2KeyPrefix()}${fileName}`
}

export function guessPictureContentType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Upload one RTU picture buffer to R2. Overwrites existing object at the same key. */
export async function uploadRtuPictureToR2(fileName, body, contentType) {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
    )
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2ObjectKey(fileName),
      Body: body,
      ContentType: contentType ?? guessPictureContentType(fileName),
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}
