/**
 * GreyNet security hardening tests.
 *
 * Three areas from the security pass:
 *   E. Import/export hardening — fuzz-style malicious GreyNet JSON through
 *      sanitizeDiagram()/loadFromJson(), and confirm SVG export escapes
 *      user-controlled text.
 *   C. AI safety — renderer source never talks to AI providers directly.
 *   D. Online-mode isolation — the offline "image" backend makes no network
 *      calls; OSM/Google Maps surface a visible online hint.
 *
 * These run against the static-served index.html (renderer is pure browser
 * code), matching the existing app/production specs.
 */
const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

async function freshLoad(page) {
  await page.goto('about:blank');
  await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
  await page.goto('/');
  await page.waitForFunction(() =>
    typeof state !== 'undefined' &&
    typeof sanitizeDiagram === 'function' &&
    typeof loadFromJson === 'function'
  );
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
    if (state.progression) state.progression.walkthroughDone = true;
  });
}

/* ========================================================================= */
test.describe('E — import sanitization (fuzz)', () => {
  test('huge arrays are capped and long strings truncated', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const bigLabel = 'A'.repeat(50000);
      const bigProp  = 'B'.repeat(50000);
      const devices = [];
      for (let i = 0; i < 10000; i++) {
        devices.push({ id: 'd' + i, type: 'server', x: 0, y: 0, label: bigLabel, props: { role: bigProp } });
      }
      const out = sanitizeDiagram({ app: 'GreyNet', devices });
      return {
        count: out.devices.length,
        maxItems: MAX_IMPORT_ITEMS,
        labelLen: out.devices[0].label.length,
        maxString: MAX_STRING,
        propLen: out.devices[0].props.role.length,
        maxProp: MAX_PROP_STRING,
      };
    });
    expect(r.count).toBeLessThanOrEqual(r.maxItems);
    expect(r.labelLen).toBeLessThanOrEqual(r.maxString);
    expect(r.propLen).toBeLessThanOrEqual(r.maxProp);
  });

  test('bad enum values fall back to safe defaults', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const out = sanitizeDiagram({
        app: 'GreyNet',
        devices: [{ id: 'd1', type: 'totally-bogus', x: 0, y: 0, props: {} }],
        sites:   [{ id: 's1', type: 'not-a-site', name: 'S', lat: 0, lng: 0 }],
        links:   [{ id: 'l1', fromId: 'd1', toId: 'd1', type: 'pigeon-carrier' }],
      });
      return {
        deviceType: out.devices[0].type,
        siteType: out.sites[0].type,
        linkType: (out.links[0] || {}).type || null,
      };
    });
    expect(r.deviceType).toBe('workstation');
    expect(r.siteType).toBe('office');
    // self-link references a valid id so it survives, but with a safe type
    expect(r.linkType).toBe('ethernet');
  });

  test('imageUrl rejects path traversal, javascript:, and data: URLs', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const mk = (imageUrl) => sanitizeDiagram({
        app: 'GreyNet',
        cities: [{ id: 'c1', name: 'C', centerLat: 0, centerLng: 0, mapBackend: 'image', imageUrl }],
      }).cities[0].imageUrl;
      return {
        traversal:   mk('../../Windows/System32/config/SAM'),
        traversal2:  mk('maps/../../secret.png'),
        backslash:   mk('a\\b\\c.png'),
        absolute:    mk('/etc/passwd'),
        js:          mk('javascript:alert(1)'),
        dataHtml:    mk('data:text/html,<script>alert(1)</script>'),
        dataImg:     mk('data:image/png;base64,AAAA'),
        httpsOk:     mk('https://example.com/map.png'),
        relOk:       mk('city-downtown.png'),
      };
    });
    expect(r.traversal).toBe('');
    expect(r.traversal2).toBe('');
    expect(r.backslash).toBe('');
    expect(r.absolute).toBe('');
    expect(r.js).toBe('');
    expect(r.dataHtml).toBe('');
    expect(r.dataImg).toBe('');          // data: not expected for imageUrl → stripped
    expect(r.httpsOk).toBe('https://example.com/map.png');
    expect(r.relOk).toBe('city-downtown.png');
  });

  test('SVG/HTML in text fields is preserved as data but escaped on display', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const payload = {
        app: 'GreyNet',
        devices: [{ id: 'd1', type: 'server', x: 0, y: 0,
          label: '<script>alert(1)</script>', props: { notes: '<img src=x onerror=alert(2)>' } }],
        sites: [{ id: 's1', type: 'office', name: '<b>HQ</b>', lat: 0, lng: 0,
          address: '"><svg onload=alert(3)>', notes: 'ok' }],
      };
      const out = sanitizeDiagram(payload);
      return {
        // Stored verbatim (sanitizer doesn't mangle content)…
        label: out.devices[0].label,
        notes: out.devices[0].props.notes,
        address: out.sites[0].address,
        // …but escapeHtml neutralizes it for the DOM.
        escLabel: escapeHtml(out.devices[0].label),
        escAddr: escapeHtml(out.sites[0].address),
      };
    });
    expect(r.label).toBe('<script>alert(1)</script>');
    expect(r.escLabel).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.escLabel).not.toContain('<script>');
    expect(r.escAddr).not.toContain('<svg');
    expect(r.escAddr).toContain('&lt;svg');
  });

  test('SVG export escapes user-controlled labels', async ({ page }) => {
    await freshLoad(page);
    const svg = await page.evaluate(async () => {
      const hq = state.sites[0]?.id || 'hq';
      state.devices = [{ id: 'd1', type: 'server', x: 100, y: 100,
        label: '</text><script>alert(1)</script>', props: {}, siteId: hq }];
      state.links = []; state.zones = [];
      // Capture the exported blob instead of triggering a real download.
      let blob = null;
      const realDownload = downloadBlob;
      downloadBlob = (b) => { blob = b; };
      try { exportSVG(); } finally { downloadBlob = realDownload; }
      return blob ? await blob.text() : '';
    });
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<script>alert(1)</script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  test('prototype-pollution keys never reach Object.prototype', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // JSON.parse is the realistic vector: it creates an OWN "__proto__" key
      // (no setter), exactly what a malicious .json file would carry.
      const raw = '{"app":"GreyNet","devices":[{"id":"d1","type":"server","x":0,"y":0,'
        + '"props":{"__proto__":{"polluted":true},"constructor":{"polluted2":true},"keep":"yes"}}]}';
      const payload = JSON.parse(raw);
      const out = sanitizeDiagram(payload);
      const props = out.devices[0].props;
      return {
        polluted: ({}).polluted,                 // undefined if clean
        polluted2: ({}).polluted2,
        keys: Object.keys(props),
        keep: props.keep,
      };
    });
    expect(r.polluted).toBeUndefined();
    expect(r.polluted2).toBeUndefined();
    expect(r.keys).toContain('keep');
    expect(r.keys).not.toContain('__proto__');
    expect(r.keys).not.toContain('constructor');
    expect(r.keep).toBe('yes');
  });

  test('loadFromJson survives a hostile payload without throwing', async ({ page }) => {
    await freshLoad(page);
    const ok = await page.evaluate(() => {
      const raw = '{"app":"GreyNet","viewMode":"__proto__","activeSiteId":{"x":1},'
        + '"devices":"not-an-array","cities":[{"id":"c1","name":"C","mapBackend":"evil",'
        + '"imageUrl":"javascript:alert(1)"}]}';
      try {
        loadFromJson(JSON.parse(raw));
        // mapBackend coerced to a valid enum, imageUrl stripped, no crash.
        const c = state.cities.find(x => x.id === 'c1');
        return !!c && c.imageUrl === '' && ['image','osm','gmaps'].includes(c.mapBackend);
      } catch (e) { return 'threw: ' + e.message; }
    });
    expect(ok).toBe(true);
  });
});

/* ========================================================================= */
test.describe('C — renderer never calls AI providers directly', () => {
  const RENDERER_FILES = [
    'app.js', 'constants.js', 'state.js', 'progression.js', 'validator.js',
    'migrations.js', 'ui-toast.js', 'deepspace-mesh.js', 'orbit-metrics.js', 'ai-actions.js',
  ];
  for (const f of RENDERER_FILES) {
    test(`${f} has no api.openai.com / api.anthropic.com reference`, () => {
      const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect(txt).not.toMatch(/api\.openai\.com/);
      expect(txt).not.toMatch(/api\.anthropic\.com/);
    });
  }
});

/* ========================================================================= */
test.describe('D — online-map isolation', () => {
  test('image backend stays offline; OSM surfaces a visible online hint', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      state.cities = [{ id: 'c1', name: 'NYC', centerLat: 40, centerLng: -74,
        mapW: 2000, mapH: 1400, mapBackend: 'image', imageUrl: '', notes: '' }];
      state.activeCityId = 'c1';
      setViewMode('city');
      const city = cityById('c1');
      const hintEl = document.getElementById('city-online-hint');

      // Offline image backend: syncTileMap hides the tile layer, no online hint.
      city.mapBackend = 'image';
      syncTileMap();
      const image = {
        tileHidden: dom.tileMap.classList.contains('hidden'),
        hintHidden: hintEl.hidden,
        activeBackend: (typeof _activeBackend !== 'undefined') ? _activeBackend : 'MISSING',
      };

      // OSM: the hint becomes visible. (Use updateOnlineMapHint so the test
      // doesn't depend on Leaflet/network actually loading tiles.)
      city.mapBackend = 'osm';
      updateOnlineMapHint();
      const osm = { hintHidden: hintEl.hidden, hintText: hintEl.textContent };

      // No Google Maps SDK should have been injected by image/osm backends.
      const gmapsInjected = !!document.querySelector('script[src*="maps.googleapis.com"]');
      return { image, osm, gmapsInjected };
    });
    expect(r.image.tileHidden).toBe(true);
    expect(r.image.hintHidden).toBe(true);
    expect(r.image.activeBackend).toBe(null);
    expect(r.osm.hintHidden).toBe(false);
    expect(r.osm.hintText).toMatch(/OpenStreetMap/);
    expect(r.gmapsInjected).toBe(false);
  });

  test('sanitizer keeps mapBackend within the allowlist', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => sanitizeDiagram({
      app: 'GreyNet',
      cities: [{ id: 'c1', name: 'C', centerLat: 0, centerLng: 0, mapBackend: 'http://evil' }],
    }).cities[0].mapBackend);
    expect(['image', 'osm', 'gmaps']).toContain(r);
  });
});
