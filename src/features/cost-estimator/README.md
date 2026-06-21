# Cost estimator feature

RTU replacement cost banner (RCB) ported from the legacy single-file app.

| File | Role |
|------|------|
| `CostBanner.tsx` | KPI bar, threshold/basis/year controls, detail tables, Excel export |

Computation lives in `@/lib/costEstimator`; Excel export in `@/lib/excel` (`exportRcbExcel`).

The banner tracks the current **filtered** building set (same scope as sidebar filters). Toggle visibility via the **Hide/Show** control (backed by `uiStore.costBannerOpen`).
