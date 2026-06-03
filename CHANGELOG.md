# GreyNet — Changelog

## 0.6.0 — Production Repair (Pass 2 follow-ups)

Additions on top of Pass 1 to satisfy the deeper production-readiness brief:

- Validator output gains per-section `recommendations` plus a top-level
  `fullPathExists`. New helper `sectionRecommendations(state, sec)`.
- Warnings tray now surfaces architecture findings (blockers, warnings,
  recommendations) grouped by section — Local / City / Planet / Orbit /
  Deep Space / Global — alongside the existing security findings. Orphan
  objects are clickable and select the offending IDs on the canvas.
  Tray now correctly clears `body` and `count` when warnings drop to 0.
- `sanitizeDiagram` accepts cross-domain DS↔orbit handoff links (was
  silently dropping them on import, which broke export → re-import).
- AI actions: added `addCity`. `repairArchitecture` and `suggestNextStep`
  now run the validator and emit concrete punch-list / next-step notes
  rather than rejecting as "must decompose".
- New `window.GreyNetValidation`, `window.GreyNetAI`,
  `window.GreyNetPersistence` namespaces (additive — existing top-level
  exports remain).
- New `npm run check` runs `node --check` over every JS file in the repo
  (`scripts/syntax-check.js`); 17/17 pass.
- New `PRODUCTION_READINESS.md` describing what was fixed, what's still
  outstanding, how to verify, and known risks.
- Tests grow to 43/43 passing. New coverage: local-only-is-incomplete,
  per-layer orphan detection, per-section recommendations, save/load
  round-trip with schema-version assertion, AI sanitizer rejects dangling
  refs, `addCity` works end-to-end, `suggestNextStep` self-generates
  from the validator, tray surfaces section-grouped findings, tray
  clears when complete, namespaces are present.
- `npm run build` verified end-to-end: produces
  `dist/GreyNet-0.6.0-portable.exe` (~95 MB) and
  `dist/GreyNet-0.6.0-setup.exe`, with all new modules bundled in
  `resources/app.asar`.

## 0.6.0 — Production Repair

Major production-readiness pass. Focus: real architecture validation, AI parity
with the full asset library, schema versioning, and Deep Space mesh workflow.

### Packaging
- `package.json` `build.files` now includes `progression.js` — without it the
  packaged Electron build failed because `index.html` loaded a script that
  wasn't bundled.
- Added `validator.js`, `migrations.js`, `ui-toast.js`, `deepspace-mesh.js`,
  `orbit-metrics.js`, `ai-actions.js` to the bundle.
- Dropped phantom `worldmap.jpg` and `worldmap.webp` entries — only
  `worldmap.png` exists on disk.
- New test (`production.spec.js`) asserts that every `<script src=>` in
  `index.html` exists on disk **and** is in `build.files`, so this kind of
  drift can't reappear.

### Architecture validator (new)
- `validator.js` exposes `validateArchitectureGraph(state)` returning
  `{ complete, sectionStatus, paths, orphanedObjects, recommendations }`.
- Replaces the prior shallow per-section counts. Local now requires an actual
  edge/security/core device + ≥1 link. City requires a placed site **and**
  city infrastructure **and** a link between them. Planet requires
  ≥2 nodes (sites or global infra) plus a real inter-site/site-to-infra link.
  Orbit requires a ground station, an orbital asset, and a true
  ground↔orbit uplink. Deep Space requires either an explicit DS↔orbit
  handoff or an anchored + internally-linked DS unit plus a working orbit.
- Convenience helpers: `sectionBlockers(state, section)`,
  `hasFullArchitecturePath(state)`.
- `progression.js` `checkSectionComplete()` now delegates to
  `validateArchitectureGraph`, falling back to legacy checks only if
  `validator.js` failed to load.

### Persistence schema versioning (new)
- `migrations.js` introduces `GREYNET_SCHEMA_VERSION = 5` and
  `migrateDiagram(input)` that walks 1→2→3→4→5 transforms:
  - v1→v2 adds `planetInfra: []`
  - v2→v3 adds `deepSpaceUnits: []`, `deepSpaceLinks: []`
  - v3→v4 adds the `progression` block
  - v4→v5 normalizes view names, repairs orphan links across all layers,
    stamps `schemaVersion`. Comms and city image data preserved.
- `loadFromJson` and `tryRestoreAutosave` both migrate first, then sanitize.
- `stampDiagram(body)` writes both `schemaVersion` and (legacy) `version`
  so older clients still recognize the file.

### AI assistant (replaced)
- `ai-actions.js` exposes:
  - `buildAiSystemPrompt()` — builds the prompt from **live** `*_TYPES`
    constants so the asset catalog can never drift out of sync again.
  - `applyAiActionsV2(result, ctx)` — validates each action: rejects
    unknown action types, unknown enum values, missing endpoints, duplicate
    links, and cross-section misuses. Returns a structured
    `{ appliedCount, skippedCount, skipped:[{type, reason}], notes }`.
  - `parseAiJsonV2(text)` — tolerant JSON parser that strips fences/text.
- New actions: `addSiteLink`, `addPlanetInfra`, `addDeepSpaceUnit`,
  `addDeepSpaceLink`, `connectArchitecturePath`, `repairArchitecture`,
  `explainDesign`, `suggestNextStep`.
- The AI assistant modal now reports skipped actions via a toast.

### Deep Space mesh (new workflow)
- `deepspace-mesh.js` adds:
  - `dsMeshSummary(state)` — units / anchored / links / handoffs / orphans.
  - `dsUnitMetrics(unit, state)` — design range, est range AU, one-way
    latency, risk/health.
  - `dsLinkMetrics(link, state)` — per-link range, latency, cross-domain flag.
  - `dsPathBackToHome(unitId, state)` — BFS through DS links and orbit
    network to the planet boundary; returns `{ reached, hops, terminus }`.
  - `dsExportMissionSummary(state)` — exportable JSON snapshot.
  - `renderDeepSpaceMeshPanel(rootEl, state)` — side-panel renderer with
    a units table (anchor, latency, range, health, reaches) and a links
    table (from, to, type, latency, domain). Includes an "Export mission
    summary" button.
- The panel is mounted under the Deep Space view's Link Budget Studio.
- DS↔orbit handoff: deep-space links can reference orbit `spaceAssets`
  (e.g. a ground station) as one endpoint. The validator and mesh treat
  these as handoff edges; orphan units are flagged.

### Orbit metrics (new)
- `orbit-metrics.js` adds `orbitLinkSummary(linkId, state)` and
  `orbitValidate(state)` returning range, one-way latency, line-of-sight,
  link type, endpoint names, and issue list.
- Orbit link Properties panel now appends validator output (e.g. "uplink
  doesn't actually connect ground↔orbit", "occulted by Earth", "two assets
  unrealistically close").

### UI / UX hardening
- `ui-toast.js` provides `toast()`, `showModalAlert()`, `showModalConfirm()`,
  and a centralized `escapeHtmlSafe()`. Replaces blocking `alert()` calls
  on the hot paths (locked-section dialogs, AI-skipped warnings).
- Locked-section dialog now lists live blockers from the validator so the
  user knows exactly what's still missing.
- Names normalized to **GreyNet** (the brand) and **GreyNET** (the wordmark
  used in the walkthrough title); diagram `app:` field accepts both
  "GreyNet" and the legacy "gREYnET" on import.

### Tests
- Existing `tests/app.spec.js` updated so the full Local→Deep Space chain
  satisfies the **new** strict validator (adds a city-infra endpoint, a
  city link, an anchored DS unit, and an explicit DS↔orbit handoff).
- New `tests/production.spec.js` covers:
  - module load (no console errors, every helper exposed)
  - `build.files` manifest completeness vs. `index.html` scripts
  - validator on empty / full / orphan states
  - migrations v1→v5
  - AI system prompt enumerates new types; v2 applier rejects duplicates +
    unknown types
  - orbit metrics distance/latency/altitude + ground-uplink validation
  - deep-space mesh summary + path back to home
  - toast helper renders
- Total: 33 tests, all passing.

### Notes / deferred
- The full split of `app.js` into per-feature modules was scoped DOWN to
  "extract the highest-value, lowest-risk subsystems" — the new files
  above represent that extraction. The remaining ~7,800-line `app.js`
  was left in place to avoid breaking the dense event/render web; future
  incremental extractions can land alongside any feature touch.
- `seedExample()` and the demo loader were left as-is — they still
  produce a coherent diagram against the new validator.
