# Security Policy

GreyNet is an offline-first Electron network design tool. Treat saved diagrams as sensitive because they can contain hostnames, IP ranges, site locations, and architecture notes.

## Supported Runtime

Keep Electron on a supported major version and run:

```powershell
npm run security:audit
```

before publishing a release.

## Secret Handling

Provider keys are stored by the Electron main process using OS-backed encryption where available. The renderer receives only key-presence metadata for AI providers. Google Maps still requires a browser API key to load the Maps JavaScript SDK, so restrict that key in Google Cloud and use it only for map display.

Do not add API keys, generated build output, `node_modules`, or local machine settings to Git.

## External Content

External navigation is allowlisted in `main.js`. Add new hosts only when the app genuinely needs them. Prefer vendored packages over runtime CDN scripts.

## Reporting

If you find a vulnerability, rotate any keys that may have been exposed, remove sensitive diagrams from shared systems, and open a private issue or contact the GreyNOC maintainers directly.
