# Components

Reusable UI primitives styled with CSS modules to match the legacy blue theme (`src/styles/legacy.css` CSS variables).

| Component | Path | Purpose |
|-----------|------|---------|
| `Button` | `Button/` | Action buttons (`default`, `primary`, `save`, `ghost`) |
| `Chip` | `Chip/` | Filter chips for DQ and advanced filters |
| `Tag` | `Tag/` | Building list badges (sqft, RTU, tenant, etc.) |
| `Modal` | `Modal/` | Overlay dialog with escape / backdrop close |
| `Tooltip` | `Tooltip/` | Hover tooltip for stats and icons |
| `Select` | `Select/` | Styled native `<select>` with placeholder option |
| `SearchInput` | `SearchInput/` | Search field with magnifier icon |

Each folder contains the component, CSS module, and a Vitest test.

## Usage

```tsx
import { Button } from '@/components/Button'
import { Chip } from '@/components/Chip/Chip'
import { SearchInput } from '@/components/SearchInput/SearchInput'
```

Import via `@/` path alias. Components use theme tokens (`--surface`, `--border`, `--accent`, etc.) with hex fallbacks when global CSS is not loaded.
