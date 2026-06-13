# GreyNet — Changelog

## 0.6.1 — Security hardening, reliability + visual redesign

Security hardening (no user-facing behavior change):

- **Encrypted autosave.** Diagrams are now persisted by the Electron main
  process and encrypted with the OS keychain (DPAPI via `safeStorage`) instead
  of plaintext renderer `localStorage`. Legacy `localStorage` autosaves migrate
  into the encrypted store on first run, then the plaintext copy is deleted.
  Falls back to `localStorage` only where OS encryption is unavailable
  (plain browser / tests).
- **Privacy controls** in Settings → *Local data & privacy*: enable/disable
  autosave, **Private Mode** (never writes to disk + purges), and **Clear local
  data**.
- **IPC hardening.** Every `ipcMain.handle` validates the sender (primary
  window, top frame, local `file://index.html`) and applies strict schema
  validation (reject unknown fields + oversized payloads) on `settings:save`
  and `ai:call`. preload exposes only narrow named methods — never raw
  `ipcRenderer`. Anthropic/OpenAI keys never reach the renderer.
- **AI safety.** Per-minute cap (20/min) on `ai:call` alongside the existing
  cooldown; a clear modal notice stating exactly what diagram context is sent
  (site/city names + counts only); failures are sanitized (no provider-body or
  key leakage).
- **CSP + online-mode.** A single central network allowlist in `main.js` drives
  the CSP (mirrored in `index.html`); a visible "🌐 Online map backend" hint
  shows when OSM/Google Maps is active; the offline image backend makes no
  network requests.
- **Import hardening.** `sanitizeDiagram`/`cleanProps` strip
  `__proto__`/`constructor`/`prototype` (prototype-pollution guard);
  `imageUrl` rejects path traversal, `javascript:`, and `data:` URLs.
- **Expanded audit + release tooling.** `scripts/security-audit.js` now scans
  all source files for insecure Electron flags, unguarded `shell.openExternal`,
  renderer→provider fetches, secrets in `localStorage`, remote CDN scripts,
  `eval`/`new Function`, wholesale `ipcRenderer`, `<webview>`, and file://
  traversal. Added SBOM generation (`npm run sbom`), build checksums
  (`npm run dist:checksums`), Windows code-signing env placeholders
  (`electron-builder.env.example`), and `RELEASE_SECURITY_CHECKLIST.md`.
  `SECURITY.md` gains a threat model + data-storage locations.

Reliability / maintainability:

- **CI consolidated.** `.github/workflows/ci.yml` now runs `npm ci →
  npm run check → npm run security:audit → npm test` on Ubuntu **and** Windows
  (Playwright Chromium installed per-OS), plus gitleaks and SBOM upload. The
  redundant `security.yml` was removed (fully superseded). No secrets required.
- **`security:audit` severity policy.** The npm script now uses
  `npm audit --audit-level=high` (blocking), matching CI; moderate advisories
  are surfaced but non-blocking, so a low-severity transitive advisory can't
  break the build.
- **AI default model** bumped `claude-opus-4-7` → `claude-opus-4-8` (current
  stable Opus; the `/v1/messages` request shape is unchanged, so no other edit
  was needed). Still user-overridable per provider in Settings.
- **Autosave recovery.** A corrupt or oversized autosave is now detected, reset,
  and reported to the user via a toast — it can never silently brick startup.
- **Migration robustness.** `migrate4to5` coerces non-array collections before
  `.map`/`.filter`, so a malformed/hostile diagram can't crash the importer.
- **Tests grow to 72/72.** New `tests/security.spec.js` (import fuzzing,
  prototype-pollution, SVG-export escaping, renderer-never-calls-providers,
  online-map isolation) and `tests/reliability.spec.js` (per-section validator
  blockers, migration orphan-link removal + idempotency, `parseAiJson`, AI enum
  fallback + truncation, `repairArchitecture`/`connectArchitecturePath`
  decomposition, comms/deep-space/city-map round-trip).
- **Docs.** New `CONTRIBUTING.md` (setup, commands, renderer module load order +
  browser-global pattern, the incremental `app.js` split plan); refreshed
  `PRODUCTION_READINESS.md`.

Visual redesign ("Voidframe Slate" -- premium dark command center, app.css only):

- **Design-token system.** `:root` rebuilt into a cohesive token set: deep
  near-black void surfaces, hairline dividers (heavy borders demoted to
  whispers), brighter WCAG-checked text ramp, a single cool azure accent, muted
  status colors, and new additive tokens for spacing, radius, elevation, glass,
  glow, focus ring, and motion. Every original variable name was preserved, so
  the ~530 existing rules cascaded into the new look automatically.
- **Per-layer identity.** `--accent` re-binds per view (`body.<mode>`) to a cool
  sibling -- azure (Local), teal (City), periwinkle (Planet), pale-sky (Orbit),
  soft-violet (Deep Space) -- so the whole chrome whispers which layer you are
  in, with zero new rules. Selection gold + warn/err/ok stay layer-independent.
- **Glass + elevation.** Toolbar, palette, properties, site-bar, trays,
  dropdowns, and modal scrims use translucent fills + `backdrop-filter` blur +
  shadow-based lift instead of boxed borders. Modal/walkthrough cards stay
  opaque for crisp reading.
- **Restraint with color.** Accent only carries meaning (active tool, focus,
  links, primary action, active layer); gold is selection-only; status colors
  only for status. No rainbow; the lone sanctioned multi-hue is the
  walkthrough's five-layer list.
- **Canvas.** Unified soft gold selection glow across every entity (device,
  link, zone, site, endpoint, space asset, DS unit, planet target); zones read
  as transparent architectural territory (fill-opacity 0.06/0.12); links breathe
  at reduced opacity; receding grid; orbit/deep-space keep their cinematic
  gradients (the sanctioned scientific encoding).
- **Palette** redesigned as a premium tool drawer (floating chips, no border
  lattice, refined hover/active). **Properties** gets scannable fields, an
  accent focus-ring, a restrained destructive action, and a calmer empty state.
- **Motion + a11y.** Fast, settling transitions for hover, selection, panel/tray
  reveal, and the layer-hue tween; a first-class `prefers-reduced-motion` block
  halts all animation/transition and the live pulses; a visible `:focus-visible`
  ring (not just a border swap) for keyboard users. No new dependencies; no fake
  telemetry. CSS-only change -- all 72 Playwright tests still pass.

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
