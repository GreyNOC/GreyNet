// GreyNet — Electron main process.
// Wraps the existing single-file index.html in a native Windows window.

const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Disable hardware acceleration only if running in a VM where it causes blank windows
// (uncomment if you ever see a black window on launch):
// app.disableHardwareAcceleration();

let mainWindow = null;

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'console.anthropic.com',
  'platform.openai.com',
  'www.openstreetmap.org',
  'openstreetmap.org',
  'developers.google.com',
  'mapsplatform.google.com',
]);

const ALLOWED_AI_PROVIDERS = new Set(['anthropic', 'openai']);

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
  } catch (e) {
    return false;
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
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://maps.gstatic.com https://maps.googleapis.com",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
    "connect-src 'self' https://*.tile.openstreetmap.org https://maps.googleapis.com https://maps.gstatic.com",
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
  ipcMain.handle('settings:summary', () => settingsSummary());

  ipcMain.handle('settings:save', (_event, payload) => {
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
        next.aiApiKeys[providerName] = encryptSecret(value.trim());
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
      next.gmapsApiKey = encryptSecret(payload.gmapsApiKey.trim());
    } else if (payload?.gmapsApiKey === '') {
      next.gmapsApiKey = '';
    }

    writeSecureSettings(next);
    return settingsSummary();
  });

  ipcMain.handle('settings:gmaps-key', () => decryptSecret(readSecureSettings().gmapsApiKey));

  ipcMain.handle('ai:call', async (_event, payload) => {
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
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
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

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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
function aiModelFor(provider, settings) {
  const defaults = {
    anthropic: 'claude-opus-4-7',
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
