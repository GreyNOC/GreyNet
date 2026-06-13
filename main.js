// GreyNet — Electron main process.
// Wraps the existing single-file index.html in a native Windows window.

const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// Disable hardware acceleration only if running in a VM where it causes blank windows
// (uncomment if you ever see a black window on launch):
// app.disableHardwareAcceleration();

let mainWindow = null;

/* =========================================================================
   CENTRAL NETWORK ALLOWLIST

   Single source of truth for every remote origin GreyNet may reach. GreyNet
   is offline-first: the ONLY outbound traffic is
     (a) optional map tiles, but only when a city's backend is OSM or Google
         Maps (the default "image" backend is fully offline);
     (b) AI broker calls, made exclusively from THIS main process — never the
         renderer (so a renderer XSS can't exfiltrate to a provider);
     (c) docs/key-management links opened in the user's default browser.
   Keep these lists minimal. The CSP source lists below MUST stay in sync with
   the <meta http-equiv="Content-Security-Policy"> tag in index.html — change
   both together.
   ========================================================================= */
const NETWORK = {
  // Hosts the renderer may ask to open in the user's default browser.
  externalLinks: [
    'console.anthropic.com',
    'platform.openai.com',
    'www.openstreetmap.org',
    'openstreetmap.org',
    'developers.google.com',
    'mapsplatform.google.com',
  ],
  // CSP source lists (mirror index.html). OSM tiles + Google Maps SDK only.
  cspImg:     ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://maps.gstatic.com', 'https://maps.googleapis.com'],
  cspScript:  ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
  cspConnect: ["'self'", 'https://*.tile.openstreetmap.org', 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
  // AI provider endpoints. Contacted ONLY by ai:call in this process.
  aiEndpoints: {
    anthropic: 'https://api.anthropic.com/v1/messages',
    openai:    'https://api.openai.com/v1/chat/completions',
  },
};
const ALLOWED_EXTERNAL_HOSTS = new Set(NETWORK.externalLinks);

const ALLOWED_AI_PROVIDERS = new Set(['anthropic', 'openai']);

// Hard caps for secrets the renderer can push into secure-settings.json.
// Real provider keys are well under these bounds; the limit is to prevent
// a compromised renderer (or hand-edited file replayed through the IPC)
// from filling the secrets file with megabytes of attacker data.
const MAX_API_KEY_LEN = 512;
const MAX_GMAPS_KEY_LEN = 256;

// Hard ceiling on an encrypted autosave blob. Mirrors the renderer's
// AUTOSAVE_MAX_BYTES so neither side can be wedged with a multi-GB payload.
const AUTOSAVE_MAX_BYTES = 8 * 1024 * 1024;

// Per-channel payload ceilings. Settings is just keys + short model names;
// ai:call carries the system+prompt (already capped per-field below). These
// envelope caps reject a compromised renderer trying to balloon the process.
const SETTINGS_MAX_BYTES = 16 * 1024;
const AI_CALL_MAX_BYTES  = 256 * 1024;

// Rate limits for ai:call. The key never leaves the main process, so the
// worst a compromised renderer can do is spam billable API calls. A short
// cooldown smooths bursts; the per-minute cap bounds total billing exposure.
const AI_CALL_COOLDOWN_MS = 1500;
const AI_CALL_MAX_PER_MIN = 20;
let _lastAiCallAt = 0;
let _aiCallTimes = [];   // timestamps (ms) of accepted calls within the last 60s

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
  } catch (e) {
    return false;
  }
}

/* =========================================================================
   IPC SENDER + SCHEMA GUARDS

   Every ipcMain.handle below is registered through handleSecure(), which
   rejects any call that does not originate from the primary window's
   top-level frame loaded from our local index.html. This blocks IPC from
   popups, injected sub-frames, or any other webContents, and means a remote
   document (were one ever loaded) could never reach settings, the secret
   store, or the AI broker.
   ========================================================================= */
const APP_ENTRY_URL = pathToFileURL(path.join(__dirname, 'index.html')).toString();

function assertTrustedSender(event) {
  // 1) Must be the one primary window we created.
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('IPC rejected: sender is not the primary window.');
  }
  // 2) Must be the top-level frame, never a nested/iframe sender.
  const frame = event.senderFrame;
  if (frame && frame.parent) {
    throw new Error('IPC rejected: nested-frame sender.');
  }
  // 3) Must be our local app document, loaded over file:// — never remote.
  let u;
  try { u = new URL((frame && frame.url) || event.sender.getURL()); }
  catch (e) { throw new Error('IPC rejected: unparseable sender URL.'); }
  if (u.protocol !== 'file:' || !u.pathname.endsWith('/index.html')) {
    throw new Error('IPC rejected: sender is not the local app document.');
  }
}

// Register an IPC handler that always validates the sender first.
function handleSecure(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event);
    return handler(payload, event);
  });
}

// Reject anything that isn't a plain object or that exceeds maxBytes once
// serialized. Fail closed: this is the first line against malformed or
// oversized payloads from a compromised renderer.
function assertPlainObject(payload, maxBytes, label) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  let size;
  try { size = JSON.stringify(payload).length; }
  catch (e) { throw new Error(`Invalid ${label}: not serializable.`); }
  if (size > maxBytes) throw new Error(`Invalid ${label}: payload too large.`);
}

// Fail closed on unexpected keys so abused/new fields can't slip through.
function assertNoUnknownKeys(obj, allowed, label) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new Error(`Invalid ${label}: unexpected field "${k}".`);
  }
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'secure-settings.json');
}

function encryptSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS credential encryption is not available.');
  }
  return safeStorage.encryptString(text).toString('base64');
}

function decryptSecret(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch (e) {
    return '';
  }
}

function readSecureSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (e) {
    return { aiProvider: 'anthropic', aiApiKeys: {}, aiModel: {}, gmapsApiKey: '' };
  }
}

function writeSecureSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function settingsSummary() {
  const settings = readSecureSettings();
  return {
    aiProvider: ALLOWED_AI_PROVIDERS.has(settings.aiProvider) ? settings.aiProvider : 'anthropic',
    hasAiKeys: {
      anthropic: !!settings.aiApiKeys?.anthropic,
      openai: !!settings.aiApiKeys?.openai,
    },
    aiModel: {
      anthropic: typeof settings.aiModel?.anthropic === 'string' ? settings.aiModel.anthropic : '',
      openai:    typeof settings.aiModel?.openai    === 'string' ? settings.aiModel.openai    : '',
    },
    hasGmapsApiKey: !!settings.gmapsApiKey,
  };
}

function configureSecurityHeaders() {
  // script-src omits 'unsafe-inline' — all renderer JS lives in app.js,
  // loaded as an external file. style-src still permits 'unsafe-inline'
  // because the renderer uses many inline style="..." attributes; the XSS
  // attack surface there is much narrower than for scripts.
  // Built from the central NETWORK allowlist so there's one source of truth.
  // Mirrors the <meta> CSP in index.html — keep both in sync.
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    `img-src ${NETWORK.cspImg.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `script-src ${NETWORK.cspScript.join(' ')}`,
    `connect-src ${NETWORK.cspConnect.join(' ')}`,
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function registerIpc() {
  handleSecure('settings:summary', () => settingsSummary());

  handleSecure('settings:save', (payload) => {
    // Strict schema: reject non-objects, oversized payloads, and any field we
    // don't explicitly expect (fail closed). Key/model length caps are applied
    // below; provider keys are never returned to the renderer.
    assertPlainObject(payload, SETTINGS_MAX_BYTES, 'settings');
    assertNoUnknownKeys(payload, ['aiProvider', 'aiApiKeys', 'aiModel', 'gmapsApiKey'], 'settings');
    if (payload.aiApiKeys != null) {
      if (typeof payload.aiApiKeys !== 'object' || Array.isArray(payload.aiApiKeys)) {
        throw new Error('Invalid settings: aiApiKeys must be an object.');
      }
      assertNoUnknownKeys(payload.aiApiKeys, ['anthropic', 'openai'], 'settings.aiApiKeys');
    }
    if (payload.aiModel != null) {
      if (typeof payload.aiModel !== 'object' || Array.isArray(payload.aiModel)) {
        throw new Error('Invalid settings: aiModel must be an object.');
      }
      assertNoUnknownKeys(payload.aiModel, ['anthropic', 'openai'], 'settings.aiModel');
    }

    const provider = ALLOWED_AI_PROVIDERS.has(payload?.aiProvider) ? payload.aiProvider : 'anthropic';
    const existing = readSecureSettings();
    const next = {
      aiProvider: provider,
      aiApiKeys: {
        anthropic: existing.aiApiKeys?.anthropic || '',
        openai: existing.aiApiKeys?.openai || '',
      },
      aiModel: {
        anthropic: existing.aiModel?.anthropic || '',
        openai:    existing.aiModel?.openai    || '',
      },
      gmapsApiKey: existing.gmapsApiKey || '',
    };

    for (const providerName of ALLOWED_AI_PROVIDERS) {
      const value = payload?.aiApiKeys?.[providerName];
      if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim().slice(0, MAX_API_KEY_LEN);
        next.aiApiKeys[providerName] = encryptSecret(trimmed);
      } else if (value === '') {
        next.aiApiKeys[providerName] = '';
      }
      // Model names are NOT secrets — store plaintext. Hard cap length.
      const modelValue = payload?.aiModel?.[providerName];
      if (typeof modelValue === 'string') {
        next.aiModel[providerName] = modelValue.trim().slice(0, 64);
      }
    }

    if (typeof payload?.gmapsApiKey === 'string' && payload.gmapsApiKey.trim()) {
      next.gmapsApiKey = encryptSecret(payload.gmapsApiKey.trim().slice(0, MAX_GMAPS_KEY_LEN));
    } else if (payload?.gmapsApiKey === '') {
      next.gmapsApiKey = '';
    }

    writeSecureSettings(next);
    return settingsSummary();
  });

  // NOTE: the Google Maps key is the ONE secret intentionally handed back to
  // the renderer — the Maps JavaScript SDK can only be loaded with the key in
  // the page. Restrict it in Google Cloud (HTTP referrer / Maps JS API only).
  // Anthropic/OpenAI keys are NEVER returned; they stay in this process.
  handleSecure('settings:gmaps-key', () => decryptSecret(readSecureSettings().gmapsApiKey));

  handleSecure('ai:call', async (payload) => {
    // Strict schema + envelope cap. Per-field length caps are applied below.
    assertPlainObject(payload, AI_CALL_MAX_BYTES, 'ai:call');
    assertNoUnknownKeys(payload, ['system', 'prompt'], 'ai:call');

    // Two-layer rate limit: a short cooldown smooths bursts, and a per-minute
    // cap bounds total billing exposure if the renderer is ever compromised.
    const now = Date.now();
    const wait = AI_CALL_COOLDOWN_MS - (now - _lastAiCallAt);
    if (wait > 0) {
      throw new Error(`Slow down — try again in ${(wait / 1000).toFixed(1)}s.`);
    }
    _aiCallTimes = _aiCallTimes.filter((t) => now - t < 60000);
    if (_aiCallTimes.length >= AI_CALL_MAX_PER_MIN) {
      throw new Error(`AI rate limit reached (${AI_CALL_MAX_PER_MIN}/min). Wait a moment and try again.`);
    }
    _lastAiCallAt = now;
    _aiCallTimes.push(now);

    const settings = readSecureSettings();
    const provider = ALLOWED_AI_PROVIDERS.has(settings.aiProvider) ? settings.aiProvider : 'anthropic';
    const key = decryptSecret(settings.aiApiKeys?.[provider]);
    if (!key) throw new Error('No API key configured for ' + provider);

    const system = String(payload?.system || '').slice(0, 20000);
    const prompt = String(payload?.prompt || '').slice(0, 50000);
    if (!system || !prompt) throw new Error('AI request is missing prompt context.');

    // Provider-specific model selection: user-configurable, with safe defaults.
    const model = aiModelFor(provider, settings);

    if (provider === 'anthropic') {
      const resp = await fetch(NETWORK.aiEndpoints.anthropic, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) await throwSanitized('Anthropic', resp);
      const json = await resp.json();
      return { provider, text: json.content?.[0]?.text || '' };
    }

    const resp = await fetch(NETWORK.aiEndpoints.openai, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) await throwSanitized('OpenAI', resp);
    const json = await resp.json();
    return { provider, text: json.choices?.[0]?.message?.content || '' };
  });

  registerAutosaveIpc();
}

/* =========================================================================
   ENCRYPTED AUTOSAVE (main-process owned)

   Saved diagrams are sensitive: they can contain hostnames, IP ranges, site
   addresses, and architecture notes. The renderer's legacy autosave wrote
   plaintext JSON into localStorage (leveldb on disk), readable by anything
   with filesystem access to the profile. This store instead encrypts the
   diagram with the OS keychain (DPAPI on Windows) via safeStorage, so the
   at-rest copy is tied to the OS user and useless if copied elsewhere.

   The renderer migrates its old localStorage autosave into this store on
   first run, then deletes the plaintext copy (see app.js restoreAutosave()).
   When safeStorage is unavailable (rare, headless), the renderer keeps using
   localStorage so autosave still works — we never silently write plaintext
   here under the guise of encryption.
   ========================================================================= */
function autosavePath() {
  return path.join(app.getPath('userData'), 'autosave.dat');
}

function autosaveAvailable() {
  try { return safeStorage.isEncryptionAvailable(); }
  catch (e) { return false; }
}

function registerAutosaveIpc() {
  handleSecure('autosave:status', () => ({ available: autosaveAvailable() }));

  handleSecure('autosave:load', () => {
    if (!autosaveAvailable()) return '';
    try {
      const env = JSON.parse(fs.readFileSync(autosavePath(), 'utf8'));
      if (!env || env.v !== 1 || typeof env.data !== 'string') return '';
      return safeStorage.decryptString(Buffer.from(env.data, 'base64'));
    } catch (e) { return ''; }
  });

  handleSecure('autosave:save', (payload) => {
    if (!autosaveAvailable()) return { ok: false, reason: 'encryption-unavailable' };
    if (typeof payload !== 'string') throw new Error('autosave payload must be a string.');
    if (payload.length > AUTOSAVE_MAX_BYTES) throw new Error('autosave payload too large.');
    const data = safeStorage.encryptString(payload).toString('base64');
    fs.mkdirSync(path.dirname(autosavePath()), { recursive: true });
    fs.writeFileSync(autosavePath(), JSON.stringify({ v: 1, enc: 'safeStorage', data }), { mode: 0o600 });
    return { ok: true };
  });

  handleSecure('autosave:clear', () => {
    try { fs.rmSync(autosavePath(), { force: true }); } catch (e) { /* already gone */ }
    return { ok: true };
  });
}

// Map a provider's raw HTTP failure to a renderer-safe Error. The raw response
// body can contain the offending request payload (which may include sensitive
// prompt content), org identifiers, server-side stack traces, or — in worst
// cases — fragments of the auth header reflected back. Log it locally, but
// hand the renderer only a short categorical message.
async function throwSanitized(providerLabel, resp) {
  let body = '';
  try { body = await resp.text(); } catch (e) { /* ignore */ }
  // Local-only diagnostic. Visible in the Electron terminal, not the renderer.
  console.error(
    `[${providerLabel}] ${resp.status} ${resp.statusText} — body: ${body.slice(0, 1500)}`
  );
  const msg = sanitizedAiMessage(resp.status, resp.statusText, providerLabel);
  throw new Error(msg);
}

function sanitizedAiMessage(status, statusText, providerLabel) {
  // Categorical mapping — never echoes the response body.
  if (status === 401 || status === 403) {
    return `${providerLabel} rejected the API key (HTTP ${status}). Open Settings and re-enter it.`;
  }
  if (status === 404) {
    return `${providerLabel} returned 404. The configured model name may be wrong; check Settings → AI Model.`;
  }
  if (status === 408 || status === 504) {
    return `${providerLabel} timed out (HTTP ${status}). Try again in a moment.`;
  }
  if (status === 429) {
    return `${providerLabel} rate-limited this request (HTTP 429). Try again shortly.`;
  }
  if (status >= 500 && status < 600) {
    return `${providerLabel} server error (HTTP ${status}). Try again in a moment.`;
  }
  if (status === 400 || status === 422) {
    return `${providerLabel} rejected the request as malformed (HTTP ${status}). Check the prompt and model.`;
  }
  return `${providerLabel} request failed (HTTP ${status} ${statusText || ''}).`.trim();
}

// User-configurable model selection with hard-coded defaults. The renderer
// passes nothing here; we read directly from secure-settings.json.
// Defaults are the current, broadly-available stable models; users can
// override per provider in Settings (e.g. a cheaper Sonnet/Haiku, or a
// pinned snapshot). The /v1/messages request we build sends only
// model + max_tokens + system + messages, so these IDs need no other change.
function aiModelFor(provider, settings) {
  const defaults = {
    anthropic: 'claude-opus-4-8',
    openai:    'gpt-4o',
  };
  const m = settings?.aiModel?.[provider];
  if (typeof m === 'string' && m.trim()) {
    // Sanity bound: model names are short identifiers.
    return m.trim().slice(0, 64);
  }
  return defaults[provider];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0e1116',
    title: 'GreyNet — Network Designer',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide the menu bar entirely (still toggleable with Alt)
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window once ready to avoid white flash
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Any window.open or target=_blank link opens in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  configureSecurityHeaders();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
