# Security Policy

GreyNet is an offline-first Electron network-design tool. **Treat saved diagrams
as sensitive** — they can contain hostnames, IP ranges, site addresses, physical
locations, and architecture notes that are valuable to an attacker.

## Supported Runtime

Keep Electron on a supported major version. Before publishing a release, run the
automated gate and walk the [release checklist](RELEASE_SECURITY_CHECKLIST.md):

```powershell
npm run security:audit   # npm audit (high) + custom static audit
npm test                 # Playwright incl. import/export + isolation tests
```

## Threat Model

GreyNet is a single-user desktop app with optional, opt-in network use. The
threats we design against, and the mitigations in place:

| Threat | Mitigation |
| --- | --- |
| **Local attacker** with filesystem access to the user profile | Autosaved diagrams are encrypted at rest via the OS keychain (DPAPI on Windows) through Electron `safeStorage`; the at-rest copy is useless on another machine/user. Provider API keys live in an OS-encrypted `secure-settings.json`, never in plaintext localStorage. **Private Mode** disables all on-disk autosave. |
| **Malicious diagram file** (crafted/hand-edited JSON) | Every import and autosave-restore runs through `sanitizeDiagram()`: arrays are capped, strings truncated, enums constrained, IDs/URLs validated, and `__proto__`/`constructor`/`prototype` keys stripped (prototype-pollution guard). Migrations coerce non-array collections so a malformed file can't crash the importer. Fuzz cases live in `tests/security.spec.js`. |
| **Renderer XSS** | Strict CSP (no remote scripts except the opt-in Google Maps SDK; `object-src 'none'`, `frame-src 'none'`). `contextIsolation` on, `nodeIntegration` off, `sandbox` on. All user-controlled text is rendered via `textContent`/`escapeHtml`, including HTML/SVG report exports. The renderer cannot reach arbitrary IPC — only narrow, sender-validated `greynetSecure` methods. |
| **Dependency compromise** | `npm audit` (high = blocking, moderate = advisory) and `gitleaks` run in CI; Dependabot is enabled; an SBOM (CycloneDX) is generated per build. Production install uses `npm ci --ignore-scripts`. |
| **Leaked map / API key** | Anthropic/OpenAI keys never leave the main process (the renderer sees only presence booleans). The Google Maps key is the one secret returned to the renderer — it must be restricted in Google Cloud (see below). AI calls are rate-limited (cooldown + per-minute cap) to bound billing abuse if the renderer is ever compromised. |
| **Sensitive exported report** | Security Report / Tech Specs / Cost Estimate exports embed the diagram's hostnames, IPs, and addresses. They are written to disk where the user chooses — treat exported files as sensitive and store/share them accordingly. |

## Secret Handling

Provider keys (Anthropic, OpenAI, Google Maps) are stored by the Electron main
process in an OS-encrypted `secure-settings.json`. The renderer receives only
key-presence metadata for AI providers — **the Anthropic/OpenAI keys are never
sent to the renderer**. AI requests are brokered entirely by the main process.

The **Google Maps key is renderer-visible by necessity**: the Maps JavaScript
SDK can only be loaded with the key present in the page. Restrict it (below).

Do not add API keys, generated build output, `node_modules`, or local machine
settings to Git. `electron-builder.env`, `secure-settings.json`, and certificate
files are git-ignored — keep them that way.

## Data Storage Locations

| Data | Location | Protection |
| --- | --- | --- |
| Autosaved diagram (desktop) | `%APPDATA%/GreyNet/autosave.dat` | Encrypted (OS keychain via `safeStorage`), file mode `0600` |
| Autosaved diagram (fallback / plain browser) | renderer `localStorage` key `greynet:autosave:v1` | Not encrypted — use Private Mode for sensitive work |
| Provider API keys | `%APPDATA%/GreyNet/secure-settings.json` | Encrypted (OS keychain), mode `0600` |
| Privacy prefs (autosave on/off, Private Mode) | `localStorage` `greynet:prefs:v1` | Non-secret booleans |
| Exported reports / JSON | User-chosen path | None — treat as sensitive |

## How to Clear Local Data

In the app: **Settings → Local data & privacy**:

- **Enable autosave** — turn the periodic on-disk save off entirely.
- **Private Mode** — never write the diagram to disk, and wipe any existing
  autosave immediately.
- **Clear local data** — delete the autosaved diagram (both the encrypted store
  and any legacy plaintext copy) plus local caches. Provider keys are untouched;
  manage those in the key fields (type `clear` to remove one).

To remove keys too, delete `%APPDATA%/GreyNet/secure-settings.json` while the app
is closed.

## Google Maps Key

The Google Maps backend is optional and clearly treated as online. OpenStreetMap
works without a key. If you use the Google backend, restrict the key in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. **Application restriction** → HTTP referrers (or, for the packaged desktop
   app, an `Other`/none restriction scoped tightly to your use).
2. **API restriction** → **Maps JavaScript API only**.
3. Set a billing quota/alert so a leaked key can't run up unbounded cost.
4. Rotate the key if you suspect exposure.

## External Content

Outbound network destinations are defined by a single allowlist in `main.js`
(`NETWORK`) and mirrored by the CSP in `index.html`: OpenStreetMap tiles, the
Google Maps SDK, and the AI provider endpoints (called only by the main
process). Add new hosts only when genuinely needed, and update both the
allowlist and the CSP together. Prefer vendored packages over runtime CDN
scripts — `scripts/security-audit.js` fails the build on unapproved remote
`<script>` tags.

## Releasing

Follow [RELEASE_SECURITY_CHECKLIST.md](RELEASE_SECURITY_CHECKLIST.md): dependency
audit, secret scan, custom audit, import/export smoke test, code signing,
checksum + SBOM publication, API-key handling, and offline-mode verification.

## Reporting

If you find a vulnerability, rotate any keys that may have been exposed, remove
sensitive diagrams from shared systems, and open a private issue or contact the
GreyNOC maintainers directly. Please do not file public issues for undisclosed
vulnerabilities.
