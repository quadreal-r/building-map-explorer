# Sidebar feature

Portfolio navigation: search, dropdown filters, stats, RTU histogram, advanced/DQ filters, layer toggles, and building list grouped by park.

| Component | Role |
|-----------|------|
| `Sidebar.tsx` | Shell composing all sidebar sections |
| `StatsStrip.tsx` | KPI strip with hover tooltips |
| `RtuHistogram.tsx` | Age bucket bar chart |
| `AdvancedFilters.tsx` | Vacant / RTU / ML advanced chips |
| `BuildingList.tsx` | Grouped list with status tags |

Uses Zustand stores (`filterStore`, `layerStore`, `selectionStore`) and hooks (`useFilteredBuildings`).

Legacy CSS classes (`.sidebar`, `.building-item`, `.layer-btn`, etc.) are defined in `src/styles/legacy.css`.
