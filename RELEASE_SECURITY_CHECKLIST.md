# GreyNet — Release Security Checklist

Run through this before tagging and publishing any GreyNet build. It exists so a
release never ships a known-vulnerable dependency, a leaked secret, a broken
offline guarantee, or an unverifiable binary. Tick every box; if one fails, fix
it before release.

> Reference: [SECURITY.md](SECURITY.md) (threat model + data locations),
> [scripts/security-audit.js](scripts/security-audit.js) (the automated gate).

## 1. Dependency audit
- [ ] `npm audit --audit-level=high` passes (blocking — no high/critical advisories).
- [ ] `npm audit --audit-level=moderate` reviewed (advisory — triage anything new).
- [ ] `npm ci` installs cleanly from the committed `package-lock.json` (no drift).

## 2. Secret scanning
- [ ] `gitleaks` is green in CI for the release commit (no committed keys/tokens).
- [ ] No real `electron-builder.env`, `secure-settings.json`, `*.pfx`, or `.env`
      is staged (all are git-ignored — confirm `git status` is clean).

## 3. Custom security audit
- [ ] `npm run security:audit` passes (Electron hardening flags, IPC exposure,
      provider-call isolation, CSP/script allowlist, eval/new Function, etc.).

## 4. Smoke test — import / export
- [ ] Export a diagram (JSON), re-import it: architecture round-trips intact.
- [ ] Import a deliberately malformed/hostile JSON file: app shows an error and
      stays usable (no crash, no script execution). See the fuzz cases in
      `tests/security.spec.js`.
- [ ] Export Security Report / Tech Specs / Cost Estimate with a device label
      containing `<script>`: the generated HTML/SVG escapes it (no execution).
- [ ] `npm test` (Playwright) is green.

## 5. API key handling
- [ ] Anthropic/OpenAI keys are NEVER returned to the renderer (only
      `hasAiKeys` booleans + the Google Maps key, which is renderer-visible by
      necessity). Confirm via Settings → save a key → it shows as "Saved".
- [ ] AI calls are brokered by the main process; the renderer source contains no
      `api.openai.com` / `api.anthropic.com` reference (audit + tests enforce this).
- [ ] The Google Maps key is restricted in Google Cloud (HTTP referrer + Maps
      JavaScript API only) — see [SECURITY.md](SECURITY.md#google-maps-key).

## 6. Offline-mode verification
- [ ] With a fresh diagram on the **image** city backend, the app makes no
      network requests (verify in a network monitor / with the machine offline).
- [ ] OSM and Google Maps backends show the visible "🌐 Online map backend" hint.
- [ ] Private Mode disables autosave and "Clear local data" removes the
      autosaved diagram (Settings → Local data & privacy).

## 7. Code signing (Windows)
- [ ] On the signing machine, `electron-builder.env` is populated from
      `electron-builder.env.example` (`WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`).
- [ ] `npm run build` produces Authenticode-signed `.exe` artifacts
      (`signtool verify /pa /v <file>.exe` succeeds). Unsigned dev builds are
      acceptable for testing only — never for public release.

## 8. Checksums & SBOM
- [ ] `npm run dist:checksums` wrote `dist/SHA256SUMS.txt`.
- [ ] Publish `SHA256SUMS.txt` next to the binaries; spot-check one hash
      (`Get-FileHash <file>.exe -Algorithm SHA256`).
- [ ] `npm run sbom` generated `sbom.cdx.json` (also produced/attached in CI).

## 9. Tag & publish
- [ ] Version bumped in `package.json` and noted in `CHANGELOG.md`.
- [ ] Release notes mention any security-relevant change.
- [ ] Signed binaries + `SHA256SUMS.txt` (+ SBOM) attached to the release.
