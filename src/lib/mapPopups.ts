export const MAP_CLOSE_POPUPS_EVENT = 'map:closePopups'

/** Close building, RTU/detail, and polygon InfoWindows. */
export function closeAllMapPopups(): void {
  window.dispatchEvent(new CustomEvent(MAP_CLOSE_POPUPS_EVENT))
}
