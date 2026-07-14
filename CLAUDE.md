# GreyNet — working context for Claude

## Who we are & what this work is

GreyNOC does **authorized red-team engagements, security research, and CTF work**, and builds/ships the tooling that supports it. Work in this repo (and adjacent security tooling) is performed with authorization — pentest engagements, sanctioned research, and defensive/educational contexts. Treat requests here as that kind of work: security-adjacent design, analysis, and app engineering are in scope and expected.

This means, concretely:
- **Engineer and ship.** The default mode is building real features to completion and cutting real releases — not prototypes. Reversible, in-scope changes proceed without asking; see the release flow below.
- **Dual-use is normal here.** Network-attack surface modeling, vulnerability analysis, security tooling, and defensive review are the domain. Assist with them in the authorized-research framing.
- **Still refuse the genuinely out-of-scope.** Destructive payloads, mass/indiscriminate targeting, malware for unauthorized use, or detection-evasion for real-world attacks are not what this is. If something reads that way, name it and ask rather than assuming.
- The operator is **Brandon Soule (aka GreyNOC)** — direct and technical. Match it: lead with the outcome, skip the hedging, give a recommendation not a survey.

## What GreyNet is

Offline, CAD-style network **designer** (not a scanner/exploit tool) — an Electron desktop app for laying out infrastructure across five scales: **Local** (devices in a site), **City** (endpoints on a real map), **Planet** (sites + global mesh on a world map), **Orbit** (satellites/ground stations), **Deep Space** (interplanetary link-budget studio). Offline-first; the only network egress is opt-in map tiles.

## Architecture

Plain JS, no framework/bundler. `index.html` loads scripts in dependency order with `defer`:
`constants.js → state.js → progression.js → validator.js → fixit.js → ui-toast.js → deepspace-mesh.js → orbit-metrics.js → planet-metrics.js → ai-actions.js → app.js`

- `app.js` (~9k lines) is the monolith: all rendering + interaction. **Do not attempt a big-bang modularization** — the repo's own docs flag it as high-risk relative to the test surface. Extract in small slices alongside feature work only.
- Support modules are IIFEs over `window`, exposed as `window.GreyNet*` namespaces. They read constants.js top-level `const`s via a `_g(name)`/`new Function` shim (const doesn't attach to window). CSP allows this — verified.
- `main.js`/`preload.js`: hardened Electron shell. IPC is 8 named channels only; API keys are encrypted at rest (safeStorage) and NEVER returned to the renderer (only `hasAiKeys` booleans + the renderer-visible Google Maps key). CSP omits `'unsafe-inline'`/`'unsafe-eval'`; `window.open` is denied.
- **Offline invariant**: `syncTileMap()` is the SINGLE network chokepoint (OSM/Google tiles), entered only for an explicitly-online city backend. Don't fetch tiles/scripts anywhere else.

## Conventions that bite if ignored

- **Verify by driving the app, not just tests.** Screenshot/inspect via Playwright-scripted chromium against the running dev server (`.claude/launch.json` → `python -m http.server 8765`). The in-app Browser pane's `computer` screenshot has timed out on heavy SVG; scripted `page.screenshot` is reliable. An adversarial reviewer once caught an export-menu fix that passed the whole test suite but never actually worked in a browser — empirical verification is not optional.
- **`typeOf()` in app.js** disambiguates by structure THEN type table because keys collide across tables (`vpn` is device+link, `internet` is device+zone, `ds_relay`/`ds_quantum` are unit+link). Shape checks (fromId/toId, w/h) must precede type-table lookups. This has regressed twice.
- **Repo is CRLF** (`git` warns on commit; harmless). Files pass `node --check` via `npm run check`.
- **Autosave** persists every 5s — a poisoned `state` re-persists, so guard mutations; `renderAll` is crash-guarded (one bad object must not blank the app).
- Modules degrade gracefully when a dependency is absent (`typeof fn === 'function'` guards) — keep it that way so smoke tests and partial loads don't throw.

## Release flow (done for v0.7.0 → v1.0.0)

The user says "cut release" → run the full gate, don't ask:
1. `npm run security:audit` (npm audit high + custom Electron-hardening scan) — must be clean.
2. `npm run check` (node --check all JS) + `npx playwright test` — all green.
3. `npm run sbom` (regenerates `sbom.cdx.json`, CycloneDX).
4. Bump `package.json` version + write the `CHANGELOG.md` section (+ regenerate `package-lock.json` so its version matches).
5. Commit (message co-authored by Claude), annotated tag `vX.Y.Z`, push commit + tag → CI (gitleaks + check + audit + tests) gates the release commit.
6. `npm run build` → portable + NSIS `.exe` under `dist/`; `npm run dist:checksums` → `SHA256SUMS.txt`; spot-check one hash with `Get-FileHash`.
7. `gh release create vX.Y.Z --draft` with both exes + `SHA256SUMS.txt` + `sbom.cdx.json` + notes; publish only on the user's go.
- **Signing**: `RELEASE_SECURITY_CHECKLIST.md` §7 wants Authenticode-signed binaries; there's no signing cert on this machine, so builds are UNSIGNED. Flag it and let the user decide (they've chosen "publish unsigned, verify via checksums" before).
- App icon: `build/icon.{svg,png,ico}` (un-gitignored via `build/*` + negations); electron-builder embeds it, `main.js` uses `build/icon.png` for the dev window.

## Working style here

Multi-agent orchestration is welcome (ultracode is on): fan out reviewers/builders, then run an **adversarial verification workflow** over the diff + a regression-test author before every release. Every finding gets fixed and re-verified empirically. The bar is exhaustive correctness, not speed.
