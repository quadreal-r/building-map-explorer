/**
 * Set CORS on the Cloudflare R2 JSON bucket so GitHub Pages and local dev can
 * fetch buildings.json (and related portfolio JSON) with the browser fetch API.
 *
 * Usage:
 *   npm run configure-r2-json-cors
 *
 * Requires R2 credentials in .env.local (same as upload-json-to-r2).
 */
import { PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { createR2Client, getR2JsonBucket } from './lib/r2-client.mjs'
import { loadDotEnvLocal } from './lib/load-dotenv-local.mjs'

const CORS_RULES = {
  CORSRules: [
    {
      AllowedOrigins: [
        'https://quadreal-r.github.io',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ],
}

async function main() {
  loadDotEnvLocal()
  const client = createR2Client()
  const bucket = getR2JsonBucket()
  if (!client) {
    console.error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local')
    process.exit(1)
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: CORS_RULES,
    }),
  )

  console.log(`CORS updated on r2://${bucket}`)
  console.log('Allowed origins:', CORS_RULES.CORSRules[0].AllowedOrigins.join(', '))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
