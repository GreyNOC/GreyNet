# GreyNet — Production Readiness

Brief, honest summary of what the v0.6 production-repair effort changed,
what is still pending, how to verify a release, and the known risks.

## What was fixed

### Packaging
- `progression.js` is now in `package.json` `build.files` (was missing — the
  packaged Electron app loaded a script that wasn't bundled).
- All new modules added below are also in `build.files`. Verified by
  inspecting `dist/win-unpacked/resources/app.asar` after `npm run build`.
- Dropped phantom `worldmap.jpg` / `worldmap.webp` entries (only `.png`
  exists).
- `tests/production.spec.js` enforces this by checking that every
  `<script src=>` in `index.html` exists on disk **and** is in `build.files`.

### Architecture validator (`validator.js`)
- `validateArchitectureGraph(state)` returns:
  ```
  {
    complete, fullPathExists,
    sectionStatus: {
      local|city|planet|orbit|deepspace: {
        complete, blockers, warnings, recommendations, stats
      }
    },
    paths, orphanedObjects, recommendations
  }
  ```
- Per-section logic:
  - **Local** — ≥3 devices in the active site, ≥1 link, ≥1 edge/security/core
    device (firewall, router, L3 switch, IDS, WAF, or VPN).
  - **City** — ≥1 city, ≥1 placed site (endpoint with `siteId`), ≥1 city
    infrastructure endpoint, ≥1 city link between them.
  - **Planet** — ≥2 planet-scale nodes (sites OR global infra), real
    inter-site or site-to-infra connectivity.
  - **Orbit** — ground anchor (ground station OR ground-uplink infra), ≥1
    orbital asset, ≥1 uplink/downlink/feeder link that actually crosses
    ground↔orbit.
  - **Deep Space** — ≥1 unit, plus an explicit DS↔orbit handoff link
    (DS unit → orbit asset) OR an anchored+internally-linked unit with
    a working orbit layer.
- `hasFullArchitecturePath(state)` and `sectionRecommendations(state, sec)`
  helpers; namespaced as `window.GreyNetValidation`.

### Progression
- `progression.js` `checkSectionComplete()` delegates to the validator.
  Legacy count-based checks remain only as a fallback if `validator.js`
  fails to load (defensive — never silently masks).
- Locked-section dialog now shows live validator-driven "Still needed"
  bullets (uses `showModalAlert` instead of native `alert()`).

### Warnings tray
- Tray now surfaces architecture findings grouped by `[Local]`, `[City]`,
  `[Planet]`, `[Orbit]`, `[Deep Space]`, `[Global]`. Each entry maps to
  one of: `err` (blocker), `warn` (warning or orphan), `info`
  (recommendation).
- Orphan objects are clickable — clicking selects the offending IDs on
  the canvas.
- Tray properly clears when the diagram becomes complete (previously
  retained stale body HTML after hiding).

### AI assistant (`ai-actions.js`)
- System prompt is built from the LIVE constants tables (so newly-added
  asset/link types never drift out of sync).
- Full coverage: `addDevice`, `addLink`, `addZone`, `addSite`,
  `addSiteLink`, `addCity`, `addEndpoint`, `addCityLink`, `addPlanetInfra`,
  `addSpaceAsset`, `addSpaceLink`, `addDeepSpaceUnit`, `addDeepSpaceLink`.
- Meta actions: `connectArchitecturePath`, `repairArchitecture`,
  `explainDesign`, `suggestNextStep`. `repair`/`suggest` now run the
  validator and emit a concrete punch list rather than rejecting silently.
- `applyAiActionsV2` validates every action, rejects unknown types/enums,
  rejects duplicate links, rejects dangling references; returns
  `{ appliedCount, skippedCount, skipped:[{type,reason}], notes }`.
- Skipped actions surface to the user via a toast; raw provider errors
  never reach the renderer (`main.js` `throwSanitized` maps HTTP failures
  to categorical messages).
- Namespaced as `window.GreyNetAI`.

### Persistence (`migrations.js`)
- `GREYNET_SCHEMA_VERSION = 5`. `migrateDiagram(old)` walks v1→v5 with
  idempotent transforms; `stampDiagram(body)` writes both
  `schemaVersion` (new) and `version` (legacy).
- `loadFromJson` and `tryRestoreAutosave` both migrate-then-sanitize.
- `sanitizeDiagram` now accepts cross-domain DS↔orbit handoff links
  (previously dropped them, breaking export/import round-trip).
- Hard import size cap (`MAX_JSON_BYTES = 8 MB`). Failure surfaces via
  toast; previous state preserved.
- Namespaced as `window.GreyNetPersistence`.

### Toasts + dialogs (`ui-toast.js`)
- `toast()`, `showModalAlert()`, `showModalConfirm()`, centralized
  `escapeHtmlSafe()`. Replaces blocking `alert()` calls on hot paths
  (locked-section dialog, AI skipped warnings, import error reporting).

### Deep Space mesh (`deepspace-mesh.js`)
- `dsMeshSummary`, `dsUnitMetrics`, `dsLinkMetrics`,
  `dsPathBackToHome` (BFS through DS links → orbit → ground),
  `dsExportMissionSummary`, `renderDeepSpaceMeshPanel`.
- Panel mounts under the Deep Space view's Link Budget Studio with
  tables for units (anchor, latency, range, health, reaches) and links
  (from, to, type, latency, domain). "Export mission summary" button.

### Orbit metrics (`orbit-metrics.js`)
- `orbitLinkSummary(linkId, state)` and `orbitValidate(state)` give the
  Properties panel real range/latency/LOS/occlusion plus a per-link
  issue list (e.g. uplink that doesn't touch ground).

### Test surface
- 43 Playwright tests, all green. Coverage includes:
  - Module-load smoke (no console errors, every helper exposed).
  - `build.files` manifest vs. `<script src>` references.
  - Validator: empty / full / orphan / local-only / per-section
    recommendations.
  - Migrations v1→v5; rejects non-GreyNet input.
  - AI: system prompt enumerates new types; v2 applier rejects unknown
    types, dangling refs, duplicate links; can build a mini-network;
    `addCity` works; `suggestNextStep` self-generates from the validator.
  - Round-trip: export → re-import preserves architecture and schema
    version.
  - Warnings tray: surfaces architecture findings grouped by section;
    clears when the diagram is complete.
  - Namespaces (`window.GreyNet*`).
  - Toast helper renders.
- New `npm run check` runs `node --check` against every JS file in the
  repo (17/17 files pass).

## How to verify the app

```bash
npm install
npm run check              # node --check on all JS files
npm run security:audit     # npm audit + scripts/security-audit.js
npm test                   # 43 Playwright tests
npm run build              # produces dist/GreyNet-${version}-{portable,setup}.exe
```

Then run the produced `.exe` and follow `PRODUCTION_CHECKLIST.md`.

Quick in-app sanity check (DevTools console after launch):
```js
typeof validateArchitectureGraph     // "function"
typeof window.GreyNetValidation      // "object"
typeof window.GreyNetAI              // "object"
typeof window.GreyNetPersistence     // "object"
window.GreyNetPersistence.SCHEMA_VERSION // 5
buildAiSystemPrompt().includes('orbit_firewall')  // true
```

After clicking **Load demo network**:
```js
validateArchitectureGraph(state).complete         // true
validateArchitectureGraph(state).fullPathExists   // true
validateArchitectureGraph(state).orphanedObjects  // []
```

## What still needs work

These items are deliberately scoped out of the v0.6 repair and are tracked
as known follow-ups:

- **Full `app.js` modularization.** `app.js` is still ~7,800 lines. The
  highest-value subsystems were extracted (validator, AI, migrations,
  toasts, DS mesh, orbit metrics). A complete file-per-feature split is
  high-risk relative to the existing test surface and is best done in
  small slices alongside future feature work — not as a Big Bang.
- ~~**In-app UI for architecture recommendations.**~~ Done in v1.0.0: the
  warnings tray shows a ⚡ Fix button beside every finding `fixit.js` can
  repair (19 of the validator's 26 coded finding types), each a
  deterministic, idempotent, single-undo-step repair.
- **Deep Space mesh panel** lives under the Link Budget Studio rather
  than its own pane. Functional but cramped on small windows.
- **AI repair loop.** `repairArchitecture` currently produces a punch
  list rather than auto-emitting fix primitives. The model is expected
  to send `addLink` / `addPlanetInfra` / etc. in the same response.
  Stronger guardrails (e.g. server-side schema validation before send)
  would harden this further.
- **`scripts/security-audit.js`** is a heuristic static check, not a
  full SAST tool. It now scans every shipped source file for the common
  regressions (insecure Electron flags, unguarded `shell.openExternal`,
  renderer→provider fetches, secrets in localStorage, remote CDN scripts,
  `eval`/`new Function`, wholesale `ipcRenderer`, `<webview>`, file://
  traversal) — but it's a regression gate, not a substitute for a real audit.

## Known risks

- **app.js coupling.** Many subsystems still reach into `state`/`dom`
  globals directly. A future rename of a global will require greps
  across the whole file. The new modules avoid this by going through
  the `_g('NAME')` helper.
- **`new Function` shim.** New modules read top-level `const`
  identifiers from constants.js via `new Function('return NAME')`
  because `const` doesn't attach to `window`. This is documented in
  `orbit-metrics.js`. Replacing with explicit `window.X = X` exports in
  constants.js would remove the shim — deferred to avoid touching a
  shared file.
- **Strict validator vs. existing diagrams.** The new validator is
  stricter than the old shallow checks (this is intentional). Old
  saved diagrams may now report as "incomplete" even though they did
  before — the data is intact, but progression chips and the warnings
  tray will show new findings until the user adds the missing
  cross-layer links (e.g. a city↔site link, a DS↔orbit handoff).
- **Electron + native module compile.** `npm run build` triggers
  `@electron/rebuild`. On a machine without MSVC build tools, this can
  fail. Verified working on Windows 11 with the standard Electron
  toolchain at v42.3.0.
- ~~**Browser preview screenshot occasionally times out**~~ — root-caused
  in v0.7.1: the background grid was a fixed 20,000×20,000 pattern-filled
  rect (~400-megapixel raster surface) that stalled compositor readback.
  The grid is now sized to the visible viewport (`updateGridBounds()` in
  app.js); all five views screenshot in <200 ms under Playwright.

## Acceptance check (v0.6)

| # | Acceptance criterion | Status |
|---|----------------------|--------|
| 1 | `npm test` passes | ✅ 72/72 (app + production + security + reliability) |
| 2 | `npm run security:audit` passes | ✅ (high-level npm audit + expanded custom audit) |
| 3 | `node --check` passes for all JS files | ✅ 19/19 (via `npm run check`) |
| 4 | `npm run build` completes | ✅ `dist/GreyNet-<version>-portable.exe` + `setup.exe` |
| 5 | Packaged build includes progression.js + all runtime files | ✅ verified in `app.asar` |
| 6 | App can load, save, and restore diagrams | ✅ (encrypted main-process autosave + corrupt-data recovery) |
| 7 | Progression completion based on real validation | ✅ via `validateArchitectureGraph` |
| 8 | AI actions cover every current type | ✅ prompt built from live constants |
| 9 | Deep Space can be validated as connected | ✅ via DS↔orbit handoff or anchored+internal |
| 10 | No production-breaking console errors at startup | ✅ |
| 11 | CI runs check + audit + tests on push/PR | ✅ `.github/workflows/ci.yml` (Ubuntu + Windows) |
