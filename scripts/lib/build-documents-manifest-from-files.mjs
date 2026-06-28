import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildRtuCatalog,
  isDocumentFileName,
  matchDocumentToRtus,
  rtuPictureKey,
} from './rtu-document-match.mjs'
import { loadBuildingsJson } from './rtu-gps-validate.mjs'
import { getProjectRoot } from './load-dotenv-local.mjs'

function sortDocumentFiles(files) {
  return [...files].sort((a, b) => a.localeCompare(b))
}

function collectDocumentFilesFromDir(dir) {
  const names = []
  if (!existsSync(dir)) return names
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && isDocumentFileName(entry.name)) names.push(entry.name)
  }
  return names.sort()
}

/** Build `{ entries }` documents manifest from PDF basenames + portfolio catalog. */
export function buildDocumentsManifestFromFileNames(fileNames, root = getProjectRoot()) {
  const docFiles = fileNames.filter(isDocumentFileName)
  const buildings = loadBuildingsJson(root)
  const catalog = buildRtuCatalog(buildings)

  const entries = {}
  const matched = []
  const unmatched = []
  const buildingWide = []

  for (const fileName of docFiles) {
    const result = matchDocumentToRtus(catalog, fileName)
    if (result.error || !result.targets?.length) {
      unmatched.push({
        fileName,
        reason: result.error ?? 'No match',
        buildingLabel: result.parsed?.buildingLabel ?? '',
        buildingNum: result.parsed?.buildingNum ?? '',
        unitCores: result.parsed?.unitCores?.join(', ') ?? '',
        matchedBuilding: result.building?.address ?? '',
      })
      continue
    }

    for (const target of result.targets) {
      const key = rtuPictureKey(target.entry.building.address, target.entry.rtu.name)
      const list = entries[key] ?? []
      if (!list.includes(fileName)) list.push(fileName)
      entries[key] = sortDocumentFiles(list)

      matched.push({
        fileName,
        rtuKey: key,
        buildingAddress: target.entry.building.address,
        rtuName: target.entry.rtu.name,
        scope: target.scope,
        unitCore: target.unitCore ?? '',
      })

      if (target.scope === 'building') {
        buildingWide.push({ fileName, rtuKey: key, buildingAddress: target.entry.building.address })
      }
    }
  }

  return {
    manifest: { entries },
    matched,
    unmatched,
    buildingWide,
    documentCount: docFiles.length,
    rtuCount: Object.keys(entries).length,
    linkedCount: matched.length,
  }
}

export function collectDocumentsManifestFileNames(manifest) {
  const names = new Set()
  for (const files of Object.values(manifest?.entries ?? {})) {
    for (const fileName of files) names.add(fileName)
  }
  return names
}

export { collectDocumentFilesFromDir, getProjectRoot }
