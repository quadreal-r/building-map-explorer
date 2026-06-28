/**
 * Bulk-upload RTU document files to Cloudflare R2 bucket rtu-documents.
 *
 * Usage:
 *   npm run upload-rtu-documents-r2
 *   npm run upload-rtu-documents-r2 -- --from-folder "C:/Users/Robert/Documents/RTU-Docs"
 *   npm run upload-rtu-documents-r2 -- --from-folder "C:/path" --skip-existing
 *   npm run upload-rtu-documents-r2 -- --from-folder "C:/path" --all-files
 *
 * By default uploads every filename listed in documents-manifest.json.
 * With --from-folder, finds those files anywhere under the folder tree.
 * With --all-files, uploads every document-like file in the folder (not only manifest names).
 *
 * Loads .env.local from project root when present.
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_DOCUMENTS_BUCKET (default rtu-documents)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getR2DocumentsPublicBaseUrl,
  guessDocumentContentType,
  isR2DocumentsConfigured,
  listR2DocumentFileNames,
  uploadRtuDocumentToR2,
} from './lib/r2-client.mjs'
import { loadDotEnvLocal, ROOT } from './lib/load-dotenv-local.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = join(ROOT, 'public', 'database', 'rtu-documents')
const MANIFEST_PATH = join(DOCS_DIR, 'documents-manifest.json')

const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|zip)$/i

function parseArgs(argv) {
  let fromFolder = null
  let skipExisting = false
  let allFiles = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--from-folder') fromFolder = argv[++i] ?? null
    else if (arg === '--skip-existing') skipExisting = true
    else if (arg === '--all-files') allFiles = true
    else if (!arg.startsWith('-')) fromFolder = arg
  }
  return { fromFolder, skipExisting, allFiles }
}

function loadManifestFileNames() {
  const names = new Set()
  if (!existsSync(MANIFEST_PATH)) return names

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    for (const files of Object.values(manifest.entries ?? {})) {
      for (const fileName of files) {
        if (typeof fileName === 'string' && fileName.trim()) names.add(fileName.trim())
      }
    }
  } catch (error) {
    console.warn(`Could not parse manifest: ${error instanceof Error ? error.message : error}`)
  }
  return names
}

function collectManifestFileNames(manifestNames) {
  const names = new Set(manifestNames)
  if (existsSync(DOCS_DIR)) {
    for (const entry of readdirSync(DOCS_DIR)) {
      if (DOCUMENT_EXT.test(entry)) names.add(entry)
    }
  }
  return [...names].sort()
}

/** basename → absolute path (first match wins; skips folders named "old"). */
function buildFolderFileIndex(rootDir) {
  const index = new Map()
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (/old/i.test(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && DOCUMENT_EXT.test(entry.name) && !index.has(entry.name)) {
        index.set(entry.name, full)
      }
    }
  }
  walk(rootDir)
  return index
}

function resolveSourcePath(fileName, fromFolder, folderIndex) {
  if (fromFolder) {
    return folderIndex.get(fileName) ?? null
  }
  const local = join(DOCS_DIR, fileName)
  return existsSync(local) ? local : null
}

async function main() {
  loadDotEnvLocal()
  const { fromFolder, skipExisting, allFiles } = parseArgs(process.argv)

  if (!isR2DocumentsConfigured()) {
    console.error(
      'R2 documents bucket is not configured. Set in .env.local:\n' +
        '  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY\n' +
        '  R2_DOCUMENTS_BUCKET=rtu-documents (optional, this is the default)',
    )
    process.exit(1)
  }

  if (fromFolder && !existsSync(fromFolder)) {
    console.error(`Folder not found: ${fromFolder}`)
    process.exit(1)
  }

  const manifestNames = loadManifestFileNames()
  const folderIndex = fromFolder ? buildFolderFileIndex(fromFolder) : null

  let fileNames
  if (allFiles && fromFolder) {
    fileNames = [...folderIndex.keys()].sort()
    if (!fileNames.length) {
      console.log(`No document files found under ${fromFolder}`)
      return
    }
    console.log(`--all-files: uploading ${fileNames.length} file(s) from folder (ignoring manifest list)`)
  } else {
    fileNames = collectManifestFileNames(manifestNames)
    if (!fileNames.length) {
      console.log(
        'No files in documents-manifest.json. Add entries first, or use --from-folder ... --all-files',
      )
      return
    }
  }

  const publicBase = getR2DocumentsPublicBaseUrl()
  const sourceLabel = fromFolder ? `folder ${fromFolder}` : DOCS_DIR

  const r2Existing = skipExisting ? new Set(await listR2DocumentFileNames()) : null
  const r2ByLower = skipExisting
    ? new Map([...r2Existing].map((n) => [n.toLowerCase(), n]))
    : null

  console.log(
    `Uploading up to ${fileNames.length} file(s) to rtu-documents from ${sourceLabel}${skipExisting ? ' (skip existing on R2)' : ''}`,
  )

  let uploaded = 0
  let skipped = 0
  let skippedOnR2 = 0

  for (const fileName of fileNames) {
    if (
      r2Existing &&
      (r2Existing.has(fileName) || r2ByLower.has(fileName.toLowerCase()))
    ) {
      skippedOnR2 += 1
      continue
    }

    const filePath = resolveSourcePath(fileName, fromFolder, folderIndex)
    if (!filePath) {
      skipped += 1
      console.warn(`Skip (missing locally): ${fileName}`)
      continue
    }

    const body = readFileSync(filePath)
    await uploadRtuDocumentToR2(fileName, body, guessDocumentContentType(fileName))
    uploaded += 1
    if (uploaded % 50 === 0 || uploaded === 1) {
      console.log(`Uploaded ${uploaded}: ${fileName}`)
    }
  }

  console.log(
    `\nDone. Uploaded ${uploaded} file(s) to R2${skipped ? `, skipped ${skipped} missing locally` : ''}${skippedOnR2 ? `, skipped ${skippedOnR2} already on R2` : ''}.`,
  )
  if (publicBase) {
    console.log(`\nPublic base URL: ${publicBase}`)
  } else {
    console.log('\nTip: set VITE_RTU_DOCUMENTS_BASE_URL in .env.local for map links.')
  }
  if (allFiles && uploaded) {
    console.log(
      '\nRemember to add new filenames to public/database/rtu-documents/documents-manifest.json',
    )
    console.log('Then run: npm run upload-json-to-r2')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
