# Stores

Zustand stores for client-side UI and filter state. Each store is independent and can be imported directly.

## `filterStore`

Search text, park/cluster/manager dropdowns, advanced tri-state filters (`adv`: `vacant`, `rtu`, `hasrtu`, `ml`), advanced panel open state, and data-quality chip filters (`dq`: `gps`, `rtu`, `vacant`, `ml`).

## `layerStore`

Map layer visibility toggles: `rtu`, `tenants`, `sprinkler`, `electrical`, `hydrant`, `gas`. All layers default to visible.

## `selectionStore`

`currentBuilding`, `dragMode` (marker repositioning), and `sidebarCollapsed`.

## `uiStore`

Generic modal registry (`openModal`, `closeModal`, `toggleModal`), plus `settingsOpen` and `costBannerOpen` for the settings overlay and RTU replacement cost banner.

## Usage

```ts
import { useFilterStore } from '@/stores/filterStore'
import { useLayerStore } from '@/stores/layerStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useUiStore } from '@/stores/uiStore'

const search = useFilterStore((s) => s.search)
const setSearch = useFilterStore((s) => s.setSearch)
```

Use selector functions to avoid unnecessary re-renders when only a slice of state is needed.
