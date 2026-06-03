# GreyNet — Production Release Checklist

Run through every item before shipping a build. Each one ties back to an
acceptance criterion from the v0.6 production-repair brief.

## 1. Tests + lint
- [ ] `npm test` — Playwright suite is **green** (33 tests).
- [ ] `npm run security:audit` — `npm audit` is clean (or all findings
      have a documented accepted-risk decision) **and**
      `scripts/security-audit.js` prints `Security audit passed.`
- [ ] No new console errors / warnings on first launch
      (load the app, watch DevTools Console for ~10 seconds).

## 2. Packaging
- [ ] `npm run build` produces installers under `dist/`.
- [ ] Open the produced `GreyNet-${version}-portable.exe` (or NSIS setup)
      on a clean Windows VM. App must launch, show the toolbar,
      progression chips, and walkthrough.
- [ ] In the running packaged build, run `Object.keys(window)` from
      DevTools (Ctrl+Shift+I) — `validateArchitectureGraph`, `migrateDiagram`,
      `buildAiSystemPrompt`, `dsMeshSummary` and `orbitLinkSummary` should
      all be defined. If any is `undefined`, the file is missing from
      `package.json` `build.files`.

## 3. Architecture flow (smoke)
- [ ] Fresh launch (delete `%APPDATA%/GreyNet` first to clear secure
      settings + autosave). Walkthrough should appear.
- [ ] Click **Load demo network** — Local chip turns "complete", City chip
      unlocks.
- [ ] Switch to **City** view; verify the demo city renders endpoints +
      cable runs.
- [ ] Switch to **Planet** view; verify ≥1 site link draws.
- [ ] Switch to **Orbit** view; place a satellite, drag a ground station,
      add an uplink. Verify the link Properties panel shows distance,
      latency, and altitude.
- [ ] Switch to **Deep Space**; place a relay anchored to Mars, link it
      to a ground station for handoff. The Deep Space Mesh panel under
      the Link Budget Studio should list the unit, anchor, latency,
      and `reaches: planet`.
- [ ] All five progression chips should now read **complete**.
- [ ] Run `validateArchitectureGraph(state).complete` from DevTools —
      must return `true`. `hasFullArchitecturePath(state)` must return
      `true`.

## 4. AI assistant
- [ ] Enter an Anthropic or OpenAI key in Settings.
- [ ] Run a prompt like: *"Build a small Local→Deep Space architecture
      using a firewall, a city cabinet linked to a placed HQ site, a
      planet ground uplink, an orbital relay, and a deep-space probe
      anchored to Mars."*
- [ ] The AI summary line should read `Applied N, skipped 0` (or list
      specific skip reasons via toast).
- [ ] Validator should report fewer blockers after the AI run.
- [ ] The AI system prompt (DevTools: `buildAiSystemPrompt()`) must
      include `orbit_firewall`, `defense_node`, `ds_quantum`, plus the
      action names `addPlanetInfra`, `addDeepSpaceUnit`,
      `connectArchitecturePath`, `repairArchitecture`.

## 5. Persistence
- [ ] Save current diagram (Ctrl+S) → reopen via **Open**. Diagram is
      identical.
- [ ] Force-quit the app, relaunch — autosave restores the previous
      session.
- [ ] Hand-craft an old `{ app:"GreyNet", version:1, ... }` JSON and
      import it. The diagram loads, schemaVersion is bumped to 5,
      `planetInfra` / `deepSpaceUnits` / `progression` are present,
      orphan links are stripped.

## 6. Security
- [ ] Inspect a packaged build's `BrowserWindow` config (via
      `main.js`): `contextIsolation: true`, `nodeIntegration: false`,
      `sandbox: true`, `webSecurity: true`. No regressions.
- [ ] CSP header is present (DevTools → Network → top-level request →
      Response Headers). `script-src` must NOT include `'unsafe-inline'`.
- [ ] No `https://api.anthropic.com` / `https://api.openai.com` calls
      visible in the renderer's network panel — they should be brokered
      by the main process.
- [ ] Settings → enter a key → close + relaunch app → key is still saved
      and is NOT present in `localStorage` (use `Object.keys(localStorage)`).

## 7. Docs
- [ ] `CHANGELOG.md` updated for this release.
- [ ] `README.md` install/run section accurate.
- [ ] `SECURITY.md` reflects current security posture.

## 8. Acceptance criteria recap
| # | Criterion                                                          | Verified |
|---|--------------------------------------------------------------------|----------|
| 1 | `npm test` passes                                                  | □ |
| 2 | `npm run security:audit` passes / has documented accepted findings | □ |
| 3 | `npm run build` succeeds                                           | □ |
| 4 | Packaged app launches + progression works                          | □ |
| 5 | All 5 layers can be built and connected                            | □ |
| 6 | Validator proves a full Local→Deep Space path                      | □ |
| 7 | AI assistant builds + repairs across all 5 layers                  | □ |
| 8 | Old saved diagrams still load (migration applied)                  | □ |
| 9 | No critical console errors on normal workflows                     | □ |
|10 | No missing runtime files in packaged build                         | □ |
