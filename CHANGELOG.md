# GreyNet — Changelog

## 0.8.0 — Planet visual redesign + Planet/Orbit/Deep Space feature build

New module: `planet-metrics.js` (great-circle math, solar position, site-link
metrics — namespaced as `window.GreyNetPlanet`).

Planet — visual redesign:

- **True great-circle links.** Inter-site links follow the real geodesic
  (sampled slerp, split cleanly at the antimeridian) instead of a decorative
  quadratic arc, with a soft under-glow and an animated directional energy
  flow (omitted under reduced motion). Selected links label themselves with
  the great-circle distance and estimated one-way latency.
- **Real day/night terminator.** The night hemisphere is shaded from the
  actual solar position (declination + equation of time) and tracks the
  clock; toggleable.
- **Live-layer chips.** A Planet legend card (sibling of the Orbit shells
  legend) toggles City lights / Flights / Satellites / Day-night
  individually, persisted across sessions. The toolbar Live button remains
  the master switch.
- **Site pins**: glass name plates behind site names for legibility over
  bright geography; secondary captions (type, coordinates, city-light names)
  auto-declutter below 45% zoom. Depth vignette over the map corners.
- **Link metrics in Properties**: an inter-site link now shows great-circle
  span, estimated fiber route (1.4× geodesic) and one-way/RTT latency.

Orbit:

- **Constellation motion.** A Motion toggle in the shells legend animates
  satellites along their rings at scaled real speeds (LEO laps in ~70 s;
  shell-to-shell ratios are physical). Paused while dragging; disabled under
  OS reduced-motion; persisted.
- **Coverage on selection.** Selecting a satellite draws its horizon-limited
  footprint wedge (true tangent geometry to the Earth disc) and dashed
  sight-lines to every ground station with clear line-of-sight.
- **Constellation generator.** With a satellite selected, Properties offers
  "Create ring": fills the orbit with N evenly spaced copies chained by
  Laser ISLs (one undo step, selection = the new ring).

Deep Space:

- **Solar conjunction awareness.** The Link Budget Studio computes the real
  Sun–Earth–target separation from the ephemeris; under 3° it shows a
  warning banner, explains the limiter, and caps the verdict at
  "Marginal · conjunction" (matches the actual ~26-month Mars cadence —
  next: Mar 2028).
- **Path back to home.** Selecting a deep-space unit highlights the exact
  link chain its route to Earth traverses and shows a chip with hop count
  and cumulative one-way light-time. `dsPathBackToHome` now returns
  `hopNodes` / `linkIds` / `totalLatencySec` (backward-compatible), and the
  mesh table gains a humanized "Home light-time" column.
- **Handoff links are visible.** Deep-space↔orbit handoffs used to be
  invisible in the Deep Space view; they now render as labeled stub arrows
  ("⇡ orbit: <asset>") and participate in path highlighting.
- **Mesh panel un-cramped**: now a collapsible section (open once a mesh
  exists) with horizontal scroll for its tables.
- **Label declutter.** The heliocentric scene no longer overprints its own
  captions. Two mechanisms: (1) units anchored to the same planet fan across
  the sunward arc in distinct slots (the DSN station keeps the anti-sunward
  slot; explicit offsets are honored), and (2) a priority-ordered collision
  pass runs after each render — markers claim space first, then captions
  place by importance (selected unit → station → units → target planet →
  link readout → planets → ring captions), each trying alternate positions
  (flip above, step beside, slide the readout along the link path) before
  low-value captions hide. The link readout gained a glass plate so it stays
  readable crossing ring lines. Verified zero overlapping captions in
  default, selected, and multi-unit stress scenes.

Also fixed (adversarial-verifier findings across 0.7.1/0.8.0):

- **Export menu actually works now.** Two successive defects: the toolbar's
  overflow clipped the absolute-positioned menu, and the first fix
  (position: fixed) was still trapped — an ancestor with backdrop-filter is
  the containing block for fixed descendants. The menu now lives outside the
  toolbar and is anchored under the button at open time; verified by a real
  end-to-end PNG export.
- Constellation ring size works for custom N (the ring-size input was wired
  into the generic property handler, which reset it to 6, destroyed the
  button mid-click, and wrote a junk "null" key onto the asset).
- Path-home light-time bills the interplanetary handoff leg (a Mars relay
  linked straight to a ground station reported "0.0 s"; now 4.4 min via the
  same 1-D model). Canvas link class honors the conjunction cap so chip and
  scene agree. Deep-space connect previews start at the anchored marker, not
  the stale free-float position.
- greatCircleSegments no longer stack-overflows on near-antipodal equatorial
  site pairs (the antipodal nudge could oscillate).
- Viewport grid re-derives on window resize; undo/redo across a view switch
  swaps the per-mode viewport; AI link fallbacks are scoped to the active
  site/city and reject self-links; legends holding focusable controls are no
  longer aria-hidden; package-lock regenerated for 0.8.0.

Test surface: +14 regression tests (tests/regression.spec.js) covering the
QAQC fixes and the 0.8.0 feature math — full suite now 97 green.

## 0.7.1 — Full-app QAQC: correctness, layout, and rendering-performance repair

A whole-app defect sweep (visual QA of all five views + adversarial code review
of every module), fixing 30+ verified bugs. No data-format changes; one
sanitizer rule was *loosened* deliberately (see "City backdrop images").

Rendering / performance:

- **Grid no longer stalls frame capture.** The background grid was a fixed
  20,000×20,000 px pattern-filled rect — a ~400-megapixel raster surface that
  hung compositor readback (screenshots, thumbnails, print) and taxed every
  repaint. It is now sized to the visible viewport (plus a pan margin) and
  re-anchored on every pan/zoom; all five views screenshot in <200 ms.

Layout / design:

- **Toolbar fits.** At the default 1440×900 window (and down to 1280px) every
  toolbar control — including Scan, Ask AI, Validate, ⚙ and ? — is on screen.
  Previously the toolbar needed ~1650px and silently clipped its right end.
  Low-value chrome (subtitle, key hints, mode pill) sheds first via media
  queries; below ~1200px the toolbar scrolls instead of clipping.
- **City bar no longer crushes its controls** ("Upload image…" wrapping into a
  56px blob); the trailing hint ellipsizes instead. The page can no longer be
  shifted sideways by focus scrolling (`overflow: clip`).
- **Warnings tray paints above the city tile map** (it was buried under
  OSM/Google tiles, so Validate appeared to do nothing in City view); its
  collapse chevron now rotates.
- **Cross-view ghosts fixed**: planet-infra markers and deep-space units/links
  no longer linger (clickably!) on top of other views.
- Link Budget Studio: planet targets now have descriptions (the "Target:" line
  rendered empty for all eight planets); dB-waterfall bars scale correctly
  (terms over half the max no longer clip to identical full-length bars).

Data integrity:

- **Deleting anything no longer destroys Deep-Space↔Orbit handoff links**
  (the prune treated cross-domain links as orphans).
- **City backdrop images survive save/load.** "Upload image…" stores a data:
  URI which the sanitizer then destroyed on reload (truncate → reject). Raster
  `data:image/*` URIs (≤6 MB) now round-trip; `javascript:`, `data:text/html`
  and scriptable SVG data URIs remain rejected.
- **`typeOf()` no longer misclassifies** VPN links / Internet zones as devices
  ('vpn'/'internet' exist in two type tables) — selecting a VPN tunnel opened
  the device editor, and Duplicate injected NaN-position phantom devices.
- **New** clears every layer (sites, cities, endpoints, orbit, deep space) —
  it previously kept them and re-persisted them on the next autosave.
- Zone tool stamps `siteId`; zones no longer leak into every site and
  reattach to the wrong site on reload.
- Import: a malformed v4 save's `progression` block no longer aborts the whole
  file load (migration is defensive; the sanitizer repairs it downstream).

Editing / undo:

- **Ctrl+A is scoped to the current view** (and active site). It used to
  select the whole document invisibly — Ctrl+A + Delete in Planet view wiped
  every site's local network with no visual indication.
- **Duplicate works in every view** (endpoints, orbit assets, planet infra,
  deep-space units + their links) and no longer fills the selection with
  ghost IDs when nothing was duplicable.
- **Undo/redo across a view switch re-syncs the UI** (mode classes, palette,
  toolbar, tile map, orbit animation) — clicks no longer dispatch on a view
  the user isn't looking at. Same for loading a file saved in another view.
- Drags released outside the canvas no longer keep dragging when the cursor
  returns; map-marker drags (OSM/Google) are undoable; plain selection clicks
  no longer flood the undo stack with no-op entries.

Metrics / validation truthfulness:

- **Orbit panel and validator now share one physics model** (the validator
  delegates to the same inclined-orbit math the canvas draws), so "LOS: Clear"
  and "occulted" can no longer disagree in the same panel. Ground stations are
  embedded in the same 3D frame as satellites (uplink range/latency/occlusion
  now match what's on screen); ground↔ground links use great-circle distance
  at fiber speed instead of a through-the-planet chord.
- **Deep Space completion is achievable as documented**: the "anchored +
  internally-linked + working orbit layer" alternative was dead code (wrong
  property path), so the blocker never cleared without an explicit handoff.
- Deep-space mesh: reachability BFS no longer stops at the first orbit asset
  (units with a real ground path were reported orphaned depending on link
  order); Earth-anchored units (Moon/JWST) no longer report ~8-minute latency
  for a ~1.3-light-second link (parent-frame mix-up).
- PNG/SVG export renders only the active site (it merged all sites into one
  overlapping diagram) and reads colors from the live theme instead of a
  stale hardcoded palette.
- Cost export: a cleared cost override falls back to the catalog price
  instead of $0, and "1,500"-style input no longer produces $NaN rows.
- Ask AI can now wire *existing* objects: link actions resolve labels against
  current state (they only knew labels created in the same response), and the
  context sent to the model includes object labels (disclosure text updated).
- Auto-connect in map-backed cities picks the *nearest* cabinet/junction by
  lat/lng (the x/y metric returned 0 for all tile-map endpoints, so it wired
  to whichever was created first).
- World-map tooltips for Bogotá and São Paulo show their countries again
  (double-encoded UTF-8 keys in the country table).
- **Planet-view cities sit on the map again.** The bundled worldmap.png is
  AI-generated artwork whose painted geography does NOT span a true
  −180…180/±90 equirectangular box; stretching it edge-to-edge put every
  overlay ~15–20° off (Los Angeles rendered in central Canada, the New York
  site pins in Labrador). The backdrop is now drawn at its calibrated
  geographic bounds (`WORLD_IMAGE_CAL`, clipped to the map frame) so city
  lights, site pins and links line up with the painted continents; a
  user-dropped true-equirectangular `worldmap.jpg` still maps 1:1. Residual
  regional warp is inherent to the artwork (US West coast ~8°).
- Link Budget Studio TX/RX gain fallbacks un-swapped (73/47 dBi, matching the
  documented DSN-dish / HGA defaults).

## 0.7.0 — Space environments QA/QC + redesign

A focused UX/UE/design pass over the two flagship space views (Orbit and Deep
Space), driven by a multi-dimension audit. No data-format or security changes.

Deep Space — Link Budget Studio:

- **Smooth slider interaction.** Slider `input` no longer rebuilds the whole
  panel each tick — it patches the readout/waterfall/canvas in place via one
  rAF-coalesced update. Continuous drag, keyboard focus, and the panel scroll
  position now survive editing, and the light-speed packet no longer restarts on
  every change. The Deep-Space Mesh graph is no longer recomputed per tick.
- **Accessibility.** Slider labels are associated to their inputs (`for`/`id`);
  sliders carry `aria-label` + live `aria-valuetext`; the readout block is an
  `aria-live` region; planets are keyboard-operable (`tabindex`/role + Enter/Space)
  and the scene exposes a `role="img"` summary.
- **New controls.** Epoch date scrubber with a **Now** (live) toggle and a live
  indicator; **Reset** (restore station defaults) and **Copy result** (link
  budget to clipboard); the active scenario preset is highlighted and clears when
  you diverge.
- **Content + correctness.** The "New Horizons-class to Pluto" preset now targets
  an actual Pluto (~39.5 AU) instead of Neptune; stations carry a default band so
  their notes match; the dB waterfall is normalized (no longer pegs every bar at
  100%) and loss bars point the right way; a **G/T** row, per-row tooltips, an SI
  received-power readout, a day/year delay tier, nearest-band fallback, and a
  scale caption were added; verdict wording is consistent ("Link OK / Marginal /
  No link" → "Limiting factor"). Studio edits are undoable and the Deep-Space
  palette is reachable again so mesh units can be placed.

Orbit:

- First-entry **empty-state** guidance and an orbital-shell **legend**; hover
  affordance on assets; faint rings/labels/captions lifted for legibility; the
  "real-ish" scale note replaced with precise wording; orbit rotation pauses when
  the tab is hidden.

Shell (both views):

- **Fit** and the `F` key are now mode-aware (frame Orbit / Deep Space, not the
  hidden local devices); wheel/zoom and Fit share one lower bound (0.1); Grid,
  Snap and the Planet-only **Live** toggle are hidden where they do nothing; the
  site/city switcher is hidden at space scales; the focus ring derives from the
  active layer accent.

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
