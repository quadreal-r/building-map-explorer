/**
 * Legacy tenant suite markers were stored as rtus[] or buildings.tenants[] before polygons.
 * Polygons replaced them — skip map markers and strip from normalized portfolio data.
 */
export function isLegacySuiteMarkerName(name: string): boolean {
  return /^(Suite|Unit)\s*#?\s*\d/i.test(name.trim())
}
