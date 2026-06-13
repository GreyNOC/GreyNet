#!/usr/bin/env node
/* =========================================================================
   GREYNET — CUSTOM SECURITY AUDIT

   A fast, dependency-free static gate that runs in CI (and locally via
   `npm run security:audit`). It scans every shipped source file for the
   security regressions that matter most for an offline-first Electron app:

     1.  Insecure Electron webPreferences (nodeIntegration / contextIsolation
         / sandbox / allowRunningInsecureContent / webSecurity / webviewTag).
     2.  <webview> tags.
     3.  shell.openExternal() not guarded by isAllowedExternalUrl().
     4.  Renderer code talking to AI providers directly (must go via main).
     5.  Secrets persisted to renderer localStorage.
     6.  Remote CDN <script src> other than the approved Google Maps SDK.
     7.  eval(.
     8.  new Function( without an explicit allowlist comment.
     9.  Wholesale ipcRenderer exposure through contextBridge.
     10. file:// / path-traversal image loading in the renderer.
     11. main.js external-URL guard present.

   Any finding fails the build. Keep this in sync with SECURITY.md and the
   release checklist. To intentionally allow a flagged construct, add the
   documented allowlist comment (see checks 7 and 8) — never weaken a check.
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

// --- Source groups -------------------------------------------------------
// "main" = the trusted main/preload processes (they legitimately fetch AI
// providers and use Node APIs). "renderer" = the browser-context modules
// loaded by index.html, which must stay offline-safe and Node-free.
const MAIN_FILES = ['main.js', 'preload.js'];
const RENDERER_FILES = [
  'app.js', 'constants.js', 'state.js', 'progression.js', 'validator.js',
  'migrations.js', 'ui-toast.js', 'deepspace-mesh.js', 'orbit-metrics.js', 'ai-actions.js',
];
const ALL_JS = [...MAIN_FILES, ...RENDERER_FILES];
const HTML_FILES = ['index.html'];

// Only the Google Maps SDK may be loaded from a remote origin (and only when
// the user opts into the Google backend with a key). Everything else ships
// vendored. Keep this list in lockstep with the CSP in main.js / index.html.
const APPROVED_SCRIPT_HOSTS = ['maps.googleapis.com', 'maps.gstatic.com'];

const contents = {};
for (const f of [...ALL_JS, ...HTML_FILES]) contents[f] = read(f);

const failures = [];
const fail = (file, message) => failures.push(file ? `${file} — ${message}` : message);

// Walk every match of `re` in `txt`, invoking cb(matchIndex, match).
function eachMatch(txt, re, cb) {
  let m;
  while ((m = re.exec(txt)) !== null) {
    cb(m.index, m);
    if (!re.global) break;
  }
}

/* --- 1. Insecure Electron webPreferences -------------------------------- */
const BAD_WEBPREF = [
  [/nodeIntegration\s*:\s*true/,             'nodeIntegration: true is forbidden (renderer must not have Node access).'],
  [/contextIsolation\s*:\s*false/,           'contextIsolation: false is forbidden.'],
  [/\bsandbox\s*:\s*false/,                  'sandbox: false is forbidden.'],
  [/allowRunningInsecureContent\s*:\s*true/, 'allowRunningInsecureContent: true is forbidden.'],
  [/webSecurity\s*:\s*false/,                'webSecurity: false is forbidden.'],
  [/webviewTag\s*:\s*true/,                  'webviewTag: true is forbidden.'],
];
for (const f of ALL_JS) {
  for (const [re, msg] of BAD_WEBPREF) if (re.test(contents[f])) fail(f, msg);
}

/* --- 2. <webview> tags --------------------------------------------------- */
for (const f of [...ALL_JS, ...HTML_FILES]) {
  if (/<webview[\s>]/i.test(contents[f])) fail(f, '<webview> tag is forbidden.');
}

/* --- 3. shell.openExternal must be guarded by isAllowedExternalUrl ------- */
for (const f of ALL_JS) {
  const txt = contents[f];
  eachMatch(txt, /shell\.openExternal\s*\(/g, (idx) => {
    const before = txt.slice(Math.max(0, idx - 200), idx);
    if (!/isAllowedExternalUrl/.test(before)) {
      fail(f, 'shell.openExternal() must be guarded by isAllowedExternalUrl().');
    }
  });
}

/* --- 4. Renderer must never reach AI providers directly ----------------- */
for (const f of RENDERER_FILES) {
  if (/api\.openai\.com|api\.anthropic\.com/.test(contents[f])) {
    fail(f, 'renderer must not reference api.openai.com / api.anthropic.com — route AI calls through the main process (ai:call).');
  }
}

/* --- 5. No secrets written to renderer localStorage --------------------- */
const SECRET_WORDS = /(apikey|token|secret|password|credential)/i;
for (const f of RENDERER_FILES) {
  const txt = contents[f];
  eachMatch(txt, /localStorage\.setItem\(([^\n]*)/g, (idx, m) => {
    const hit = m[1].match(SECRET_WORDS);
    if (hit) fail(f, `localStorage.setItem appears to persist a secret ("${hit[0]}") — secrets belong in the main process, not localStorage.`);
  });
}

/* --- 6. Remote CDN <script src> other than the approved Maps host ------- */
for (const f of HTML_FILES) {
  const txt = contents[f];
  eachMatch(txt, /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, (idx, m) => {
    const src = m[1];
    if (!/^https?:\/\//i.test(src)) return;   // local/relative script — fine
    let host;
    try { host = new URL(src).hostname; } catch (e) { host = src; }
    if (!APPROVED_SCRIPT_HOSTS.includes(host)) {
      fail(f, `remote <script src> to "${host}" is not approved (only the Google Maps SDK is allowed; vendor everything else).`);
    }
  });
  // Explicit legacy check kept for clarity.
  if (/https:\/\/unpkg\.com\/leaflet/i.test(txt)) {
    fail(f, 'Leaflet must be loaded from the local package, not a CDN.');
  }
}

/* --- 7. eval( is forbidden ---------------------------------------------- */
for (const f of ALL_JS) {
  const txt = contents[f];
  eachMatch(txt, /\beval\s*\(/g, (idx) => {
    const before = txt.slice(Math.max(0, idx - 120), idx);
    if (!/audit-allow:eval/.test(before)) {
      fail(f, 'eval( is forbidden (only with an explicit "audit-allow:eval" comment, which should essentially never happen).');
    }
  });
}

/* --- 8. new Function( requires an explicit allowlist comment ------------- */
// GreyNet's metric modules use `new Function` to read optional globals across
// IIFE scope boundaries; each is tagged with an eslint `no-new-func` marker.
for (const f of ALL_JS) {
  const txt = contents[f];
  eachMatch(txt, /new\s+Function\s*\(/g, (idx) => {
    const before = txt.slice(Math.max(0, idx - 160), idx);
    if (!/(no-new-func|audit-allow:new-function)/.test(before)) {
      fail(f, 'new Function( requires an adjacent allowlist comment (eslint "no-new-func" or "audit-allow:new-function").');
    }
  });
}

/* --- 9. preload must expose only narrow named methods ------------------- */
{
  const f = 'preload.js';
  const txt = contents[f];
  if (/exposeInMainWorld\s*\([^,]+,\s*ipcRenderer\b/.test(txt)) {
    fail(f, 'do not expose ipcRenderer wholesale through contextBridge.');
  }
  if (/ipcRenderer\.(send|sendSync|on|once|postMessage)\b/.test(txt)) {
    fail(f, 'preload must not expose ipcRenderer.send/on/etc — only narrow invoke wrappers.');
  }
  eachMatch(txt, /ipcRenderer\.invoke\(\s*(.)/g, (idx, m) => {
    if (!['"', "'", '`'].includes(m[1])) {
      fail(f, 'ipcRenderer.invoke must use a string-literal channel, never a variable passthrough.');
    }
  });
}

/* --- 10. Unsafe file:// or path-traversal image loading (renderer) ------ */
for (const f of RENDERER_FILES) {
  const txt = contents[f];
  if (/\bfile:\/\//.test(txt)) {
    fail(f, 'renderer references a file:// URL — resource loading must not use file:// paths.');
  }
  if (/(?:href|src|imageUrl)\s*[:=]\s*["'`][^"'`]*\.\.\//.test(txt)) {
    fail(f, 'path traversal ("../") in an href/src/imageUrl literal is forbidden.');
  }
}

/* --- 11. main.js external-URL guard present ----------------------------- */
if (!/function\s+isAllowedExternalUrl/.test(contents['main.js'])) {
  fail('main.js', 'must define isAllowedExternalUrl() to gate external navigation.');
}

/* --- Report ------------------------------------------------------------- */
if (failures.length) {
  console.error('Security audit FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} issue(s) found. See scripts/security-audit.js and SECURITY.md.`);
  process.exit(1);
}

console.log('Security audit passed (all checks clean).');
