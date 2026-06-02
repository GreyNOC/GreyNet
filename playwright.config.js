// GreyNet Playwright config.
// Tests run against the static-served index.html (port 8765) — the renderer is
// pure browser code, so we don't need to spin up Electron just to verify the
// section-progression logic, palette wiring, and persistence.
//
// The webServer block boots `python -m http.server 8765` automatically; if your
// machine doesn't have python3 on PATH, swap to `npx http-server -p 8765`.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,   // shared autosave storage across tests; keep serial
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: 'http://localhost:8765',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5_000,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'python -m http.server 8765',
    url: 'http://localhost:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
