# Contributing to GreyNet

GreyNet is an **offline-first Electron desktop app** for designing network
infrastructure across five layers (Local → City → Planet → Orbit → Deep Space).
This guide covers local setup, the commands you'll use, the renderer's module
architecture, and the release process.

> Security expectations for any change are in [SECURITY.md](SECURITY.md); the
> pre-release gate is [RELEASE_SECURITY_CHECKLIST.md](RELEASE_SECURITY_CHECKLIST.md).

## Prerequisites

- **Node.js 22** (matches CI).
- **Python 3** on `PATH` — the Playwright config serves the renderer with
  `python -m http.server`. (Swap to `npx http-server -p 8765` in
  `playwright.config.js` if you don't have Python.)
- Windows + the standard MSVC/Electron toolchain only if you intend to run
  `npm run build` (packaging). Day-to-day dev and tests don't need it.

## Setup

```powershell
npm install
npm start        # launch the Electron app (alias: npm run dev)
```

API keys (Anthropic / OpenAI / Google Maps) are **never** committed. Add them at
runtime via **Settings** inside the app — the main process stores them
OS-encrypted (see [SECURITY.md](SECURITY.md)).

## Commands

| Command | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Launch the Electron app. |
| `npm run check` | `node --check` every JS file (fast syntax gate — no bundler). |
| `npm run security:audit` | `npm audit --audit-level=high` + the custom static audit (`scripts/security-audit.js`). |
| `npm test` | Playwright suite (`tests/*.spec.js`). |
| `npm run test:headed` / `test:ui` | Playwright headed / interactive runner. |
| `npm run build` | Package Windows portable **and** NSIS installer (electron-builder). |
| `npm run build:portable` / `build:installer` | Just one Windows target. |
| `npm run sbom` | Generate `sbom.cdx.json` (CycloneDX). |
| `npm run dist:checksums` | After a build, write `dist/SHA256SUMS.txt`. |

CI (`.github/workflows/ci.yml`) runs `npm ci → npm run check → npm run
security:audit` on Ubuntu + Windows, the Playwright suite on both, and a
gitleaks secret scan — on every push and PR. No secrets are required to run CI.

## Renderer architecture (read before touching app.js)

GreyNet ships **without a bundler**. `index.html` loads a fixed, ordered list
of plain-JS modules with `defer`, then `app.js` last:

```
constants.js → state.js → progression.js → validator.js → migrations.js →
ui-toast.js → deepspace-mesh.js → orbit-metrics.js → ai-actions.js → app.js
```

**Preserve this order** unless you intentionally refactor it — later modules
assume earlier ones are loaded.

### The browser-global IIFE pattern

Each supporting module is an IIFE that attaches its public API to the global
object, so files can call each other without `import`/`require`:

```js
(function (root) {
  function validateArchitectureGraph(state) { /* ... */ }
  root.validateArchitectureGraph = validateArchitectureGraph;       // back-compat global
  root.GreyNetValidation = Object.assign(root.GreyNetValidation || {}, {
    validateArchitectureGraph,                                       // namespaced surface
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

Two consequences to know:

- **`function`/`var` globals are reachable everywhere; top-level `const`/`let`
  are not.** `const` declarations (e.g. the tables in `constants.js`) don't
  attach to `window`. Modules that need them at IIFE-eval time read them through
  a small `_g('NAME')` shim (`new Function('return typeof NAME …')`) — see
  `orbit-metrics.js`. These `new Function` uses are deliberate and carry an
  eslint `no-new-func` marker; the security audit allowlists exactly that
  marker (see `scripts/security-audit.js`).
- **Tests run in the browser, not Electron.** `tests/*.spec.js` serve
  `index.html` statically and drive it via `page.evaluate`, calling these
  globals directly (`validateArchitectureGraph`, `migrateDiagram`,
  `sanitizeDiagram`, `applyAiActionsV2`, `parseAiJson`, `diagramToJson`,
  `loadFromJson`, `state`, `uid`, `snap`, …). In that context
  `window.greynetSecure` is undefined, so autosave/AI fall back to their
  browser paths — keep that path working when you change them.

> **Local test gotcha:** the Playwright config has `reuseExistingServer: true`
> off-CI. If a stale `python -m http.server 8765` from another directory is
> running, tests reuse it and every page test times out. Kill whatever holds
> port 8765 and re-run. CI sets `CI=true`, so it always starts its own server.

### app.js modularization (in progress)

`app.js` is the large renderer orchestrator. The intended direction is to peel
cohesive chunks into their own browser-global modules **incrementally**, one
reviewable slice at a time, rather than a single big-bang rewrite — each slice
landing green against the test suite above. Candidate modules:

`renderer-utils.js` · `palette-renderer.js` · `canvas-interactions.js` ·
`selection-properties.js` · `persistence-ui.js` · `export-actions.js` ·
`map-rendering.js`.

When you extract one: keep its public functions as globals (so the rest of
`app.js` keeps working unchanged), add the new `<script src>` to `index.html`
**in dependency order** and to `package.json` → `build.files`, and confirm
`npm test` + `npm run check` stay green. The production test asserts every
`<script src>` is on disk and bundled, so a missed manifest entry fails CI.

## Pull requests

1. Keep changes small and focused; preserve existing user-facing workflows
   unless a test proves they're broken.
2. Run `npm run check`, `npm run security:audit`, and `npm test` locally.
3. Add or update tests for behavior you change (validator/migrations/ai-actions/
   persistence all have suites to extend).
4. Update `CHANGELOG.md`. Update `SECURITY.md` only if security behavior changes.
5. Before tagging a release, walk
   [RELEASE_SECURITY_CHECKLIST.md](RELEASE_SECURITY_CHECKLIST.md).
