/** Pending RTU document files for Settings sync (base64 in deploy bundle chunks). */

import type { DeployDocumentEntry } from '@/types/deployBundle'

export interface DeployDocumentExportSummary {
  documents: DeployDocumentEntry[]
  failedFileNames: string[]
  pendingCount: number
}

/** Pending browser uploads for RTU documents. IndexedDB upload UI is future work. */
export async function exportPendingDocumentsForDeploy(): Promise<DeployDocumentExportSummary> {
  return { documents: [], failedFileNames: [], pendingCount: 0 }
}

export async function markRtuDocumentsDeployed(_fileNames: string[]): Promise<void> {
  /* no-op until browser document uploads are implemented */
}
