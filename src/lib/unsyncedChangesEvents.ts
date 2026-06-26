type UnsyncedChangesListener = () => void

const unsyncedChangesListeners = new Set<UnsyncedChangesListener>()

export function onUnsyncedChangesInvalidate(listener: UnsyncedChangesListener): () => void {
  unsyncedChangesListeners.add(listener)
  return () => unsyncedChangesListeners.delete(listener)
}

export function invalidateUnsyncedChanges(): void {
  for (const listener of unsyncedChangesListeners) listener()
}
