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
 *   R2_JSON_BUCKET or R2_JSON_BUCKET_NAME (portfolio JSON bucket, default json)
 */
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

export function getR2JsonBucket() {
  return readEnv('R2_JSON_BUCKET', 'R2_JSON_BUCKET_NAME', 'CLOUDFLARE_R2_JSON_BUCKET') ?? 'json'
}

export function isR2JsonConfigured() {
  return Boolean(createR2Client() && getR2JsonBucket())
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

/** List image basenames in the R2 bucket (strips optional key prefix). */
export async function listR2PictureFileNames() {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
    )
  }

  const prefix = getR2KeyPrefix()
  const names = []
  let continuationToken

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      }),
    )

    for (const item of response.Contents ?? []) {
      const key = item.Key
      if (!key) continue
      const baseName = key.includes('/')
        ? key.slice(key.lastIndexOf('/') + 1)
        : prefix && key.startsWith(prefix)
          ? key.slice(prefix.length)
          : key
      if (baseName) names.push(baseName)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return [...new Set(names)].sort()
}

/** True when the object exists at the manifest file name (with optional key prefix). */
export async function r2PictureExists(fileName) {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) return false

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: r2ObjectKey(fileName),
      }),
    )
    return true
  } catch {
    return false
  }
}

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

export async function uploadJsonFileToR2(fileName, body) {
  const client = createR2Client()
  const bucket = getR2JsonBucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 JSON bucket is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_JSON_BUCKET.',
    )
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=60',
    }),
  )
}
