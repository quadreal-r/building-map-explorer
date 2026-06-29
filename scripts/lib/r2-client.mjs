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
 *   R2_DOCUMENTS_BUCKET or R2_DOCUMENTS_BUCKET_NAME (RTU documents bucket, default rtu-documents)
 *   VITE_RTU_DOCUMENTS_BASE_URL (public CDN base for rtu-documents bucket)
 */
import { CopyObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

export function getR2DocumentsBucket() {
  return (
    readEnv('R2_DOCUMENTS_BUCKET', 'R2_DOCUMENTS_BUCKET_NAME', 'CLOUDFLARE_R2_DOCUMENTS_BUCKET') ??
    'rtu-documents'
  )
}

export function getR2DocumentsKeyPrefix() {
  const prefix = readEnv('R2_DOCUMENTS_KEY_PREFIX', 'R2_DOCUMENTS_PREFIX') ?? ''
  if (!prefix) return ''
  return prefix.endsWith('/') ? prefix : `${prefix}/`
}

export function r2DocumentsObjectKey(fileName) {
  return `${getR2DocumentsKeyPrefix()}${fileName}`
}

export function guessDocumentContentType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }
  return map[ext] ?? 'application/octet-stream'
}

export async function uploadRtuDocumentToR2(fileName, body, contentType) {
  const client = createR2Client()
  const bucket = getR2DocumentsBucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 documents bucket is not configured. Set R2 credentials and R2_DOCUMENTS_BUCKET.',
    )
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2DocumentsObjectKey(fileName),
      Body: body,
      ContentType: contentType ?? guessDocumentContentType(fileName),
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

export function isR2DocumentsConfigured() {
  return Boolean(createR2Client() && getR2DocumentsBucket())
}

export function getR2DocumentsPublicBaseUrl() {
  const url = readEnv(
    'R2_DOCUMENTS_PUBLIC_URL',
    'VITE_RTU_DOCUMENTS_BASE_URL',
    'R2_DOCUMENTS_PUBLIC_BASE_URL',
  )
  if (!url) return null
  return url.endsWith('/') ? url : `${url}/`
}

/** List document basenames in the rtu-documents bucket (strips optional key prefix). */
export async function listR2DocumentFileNames() {
  const client = createR2Client()
  const bucket = getR2DocumentsBucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 documents bucket is not configured. Set R2 credentials and R2_DOCUMENTS_BUCKET.',
    )
  }

  const prefix = getR2DocumentsKeyPrefix()
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

export function isR2JsonConfigured() {
  return Boolean(createR2Client() && getR2JsonBucket())
}

/** Which env vars are missing for R2 S3 API (for error messages). */
export function missingR2CredentialKeys() {
  const missing = []
  if (!readEnv('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID')) missing.push('R2_ACCOUNT_ID')
  if (!readEnv('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID')) missing.push('R2_ACCESS_KEY_ID')
  if (!readEnv('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY')) {
    missing.push('R2_SECRET_ACCESS_KEY')
  }
  return missing
}

export function describeR2JsonConfigProblem() {
  const missing = missingR2CredentialKeys()
  if (missing.length) {
    return `Missing in .env.local (or shell env): ${missing.join(', ')}`
  }
  const accountId = readEnv('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID') ?? ''
  if (accountId.startsWith('cfat_')) {
    return 'R2_ACCOUNT_ID looks like an API token (cfat_…). Use your 32-character Account ID from Cloudflare Dashboard → Overview.'
  }
  if (!getR2JsonBucket()) {
    return 'R2_JSON_BUCKET is empty'
  }
  return null
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

/** List full R2 object keys (includes optional key prefix). */
export async function listAllR2PictureObjectKeys() {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
    )
  }

  const prefix = getR2KeyPrefix()
  const keys = []
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
      if (item.Key) keys.push(item.Key)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

/** Delete all objects in the RTU pictures bucket (respects R2_KEY_PREFIX when set). */
export async function deleteAllR2PictureObjects({ dryRun = false, onProgress } = {}) {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error('R2 is not configured.')
  }

  const keys = await listAllR2PictureObjectKeys()
  if (!keys.length) return { deleted: 0, total: 0 }

  if (dryRun) return { deleted: 0, total: keys.length, dryRun: true }

  let deleted = 0
  const batchSize = 1000
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    )
    deleted += batch.length
    onProgress?.(deleted, keys.length)
  }

  return { deleted, total: keys.length }
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

/** Read picture bytes from R2 (manifest or cloud key). */
export async function readRtuPictureFromR2(fileName) {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error('R2 is not configured.')
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: r2ObjectKey(fileName),
    }),
  )
  if (!response.Body) throw new Error(`Empty body for ${fileName}`)
  return Buffer.from(await response.Body.transformToByteArray())
}

/** Duplicate an existing R2 object under a new filename (cloud alias). */
export async function copyRtuPictureOnR2(sourceFileName, destFileName) {
  const client = createR2Client()
  const bucket = getR2Bucket()
  if (!client || !bucket) {
    throw new Error('R2 is not configured.')
  }

  const sourceKey = r2ObjectKey(sourceFileName)
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`,
      Key: r2ObjectKey(destFileName),
      ContentType: guessPictureContentType(destFileName),
      MetadataDirective: 'REPLACE',
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
