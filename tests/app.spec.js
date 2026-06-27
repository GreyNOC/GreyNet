/**
 * GreyNet end-to-end tests.
 *
 * Covers the verification matrix from the architect brief:
 *   - app loads
 *   - each section renders
 *   - locked/unlocked state works
 *   - user can create/place nodes or units
 *   - valid connections work
 *   - invalid (cross-layer) connections are blocked at the data layer
 *   - Local → City → Planet → Orbit → Deep Space progression unlocks correctly
 *   - data persistence (autosave round-trip)
 */
const { test, expect } = require('@playwright/test');

// Load index.html with a clean slate. Avoids addInitScript because that
// would also wipe storage on intentional reloads inside the same test.
async function freshLoad(page) {
  await page.goto('about:blank');
  await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && state.progression !== undefined && state.progression);
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
    state.progression.walkthroughDone = true;
  });
}

// Reload while preserving localStorage so autosave round-trips correctly.
async function reloadKeepingStorage(page) {
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.progression !== undefined && state.progression);
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
  });
}

// Push the app into the "fresh user" state for gating tests.
async function resetToFreshUser(page) {
  await page.evaluate(() => {
    state.devices = []; state.links = []; state.zones = [];
    state.sites = []; state.siteLinks = [];
    state.cities = []; state.endpoints = []; state.cityLinks = [];
    state.spaceAssets = []; state.spaceLinks = [];
    state.planetInfra = [];
    state.deepSpaceUnits = []; state.deepSpaceLinks = [];
    state.progression = {
      walkthroughDone: true, walkthroughStep: 0,
      completed: { local:false, city:false, planet:false, orbit:false, deepspace:false },
      unlocked:  { local:true,  city:false, planet:false, orbit:false, deepspace:false },
    };
    evaluateProgression();
    decorateViewButtons();
    renderAll();
  });
}

test.describe('GreyNet — boot + view buttons', () => {
  test('app loads with toolbar, palette, canvas, status bar', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#palette')).toBeVisible();
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(page.locator('.statusbar')).toBeVisible();
    await expect(page.locator('#progress-tray')).toBeVisible();
    // All five view buttons exist
    const views = ['local', 'city', 'world', 'space', 'deepspace'];
    for (const v of views) {
      await expect(page.locator(`[data-set-view="${v}"]`)).toBeVisible();
    }
  });

  test('world map city overlay keeps Los Angeles in Southern California', async ({ page }) => {
    await freshLoad(page);
    const la = await page.evaluate(() => {
      const misspelled = MAJOR_CITIES.filter(c => /angelus/i.test(c.name)).map(c => c.name);
      const city = MAJOR_CITIES.find(c => c.name === 'Los Angeles');
      document.getElementById('live-layer').innerHTML = '';
      buildLiveLayer();
      const dot = document.querySelector('#cities-group [data-city-name="Los Angeles"]');
      return {
        misspelled,
        city,
        dot: dot ? {
          cx: Number(dot.getAttribute('cx')),
          cy: Number(dot.getAttribute('cy')),
          country: dot.getAttribute('data-city-country'),
          title: dot.querySelector('title')?.textContent || '',
        } : null,
      };
    });

    expect(la.misspelled).toEqual([]);
    expect(la.city).toMatchObject({
      name: 'Los Angeles',
      country: 'United States',
      lat: 34.05,
      lng: -118.24,
    });
    expect(la.city.lat).toBeGreaterThan(33);
    expect(la.city.lat).toBeLessThan(35);
    expect(la.city.lng).toBeGreaterThan(-119);
    expect(la.city.lng).toBeLessThan(-117);
    expect(la.dot).toMatchObject({
      country: 'United States',
      title: 'Los Angeles, United States',
    });
    expect(la.dot.cx).toBeCloseTo(617.6, 1);
    expect(la.dot.cy).toBeCloseTo(559.5, 1);
  });

  test('walkthrough overlay shows on a true first launch', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.progression !== undefined);
    await expect(page.locator('#walkthrough')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.wt-title')).toContainText('Welcome to GreyNET');
  });
});

test.describe('GreyNet — section locking', () => {
  test('fresh user: only Local is unlocked', async ({ page }) => {
    await freshLoad(page);
    await resetToFreshUser(page);
    const states = await page.evaluate(() => Object.fromEntries(
      ['local','city','world','space','deepspace'].map(v => [
        v, document.querySelector(`[data-set-view="${v}"]`).className
      ])
    ));
    expect(states.local).not.toContain('locked');
    expect(states.city).toContain('locked');
    expect(states.world).toContain('locked');
    expect(states.space).toContain('locked');
    expect(states.deepspace).toContain('locked');
  });

  test('attempting to enter a locked section is rejected', async ({ page }) => {
    await freshLoad(page);
    await resetToFreshUser(page);
    // Suppress the alert so the click resolves
    page.on('dialog', d => d.accept());
    const before = await page.evaluate(() => state.viewMode);
    expect(before).toBe('local');
    await page.evaluate(() => setViewMode('deepspace'));
    const after = await page.evaluate(() => state.viewMode);
    expect(after).toBe('local'); // gate held
  });
});

test.describe('GreyNet — progression unlocks correctly', () => {
  test('Local complete unlocks City', async ({ page }) => {
    await freshLoad(page);
    await resetToFreshUser(page);
    await page.evaluate(() => {
      state.devices = [
        { id: 'd1', type: 'firewall', x: 100, y: 100, label: 'FW', props: {}, siteId: state.sites[0]?.id || 'hq' },
        { id: 'd2', type: 'l3switch', x: 200, y: 100, label: 'SW', props: {}, siteId: state.sites[0]?.id || 'hq' },
        { id: 'd3', type: 'server',   x: 300, y: 100, label: 'Srv', props: {}, siteId: state.sites[0]?.id || 'hq' },
      ];
      state.links = [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }];
      ensureDefaultSite();
      evaluateProgression();
      decorateViewButtons();
    });
    const prog = await page.evaluate(() => state.progression);
    expect(prog.completed.local).toBe(true);
    expect(prog.unlocked.city).toBe(true);
    expect(prog.unlocked.planet).toBe(false);
  });

  test('Full Local → Deep Space chain unlocks every section', async ({ page }) => {
    await freshLoad(page);
    await resetToFreshUser(page);
    await page.evaluate(() => {
      ensureDefaultSite();
      const hq = state.sites[0]?.id || 'hq';
      // Local
      state.devices = [
        { id:'d1', type:'firewall', x:0, y:0, label:'FW', props:{}, siteId: hq },
        { id:'d2', type:'l3switch', x:0, y:0, label:'SW', props:{}, siteId: hq },
        { id:'d3', type:'server',   x:0, y:0, label:'Sv', props:{}, siteId: hq },
      ];
      state.links = [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }];
      // City — the new strict validator requires: a city, ≥1 site placement
      // (endpoint with siteId), ≥1 city-infra endpoint, AND a link between them.
      state.cities = [{ id:'c1', name:'NYC', centerLat:40, centerLng:-74, mapW:2000, mapH:1400, mapBackend:'osm', imageUrl:'', notes:'' }];
      state.endpoints = [
        { id:'e1', type:'building', label:'B', x:0, y:0, lat:null, lng:null, cityId:'c1', siteId: hq, props:{} },
        { id:'e2', type:'cabinet',  label:'CAB', x:50, y:0, lat:null, lng:null, cityId:'c1', props:{} },
      ];
      state.cityLinks = [{ id:'cl1', fromEpId:'e1', toEpId:'e2', type:'fiber_buried', label:'' }];
      // Planet
      state.sites.push({ id:'s2', type:'datacenter', name:'DC', lat:50, lng:10, address:'', notes:'', color:'#fff' });
      state.siteLinks = [{ id:'sl1', fromSiteId: hq, toSiteId:'s2', type:'wan', label:'' }];
      // Orbit
      state.spaceAssets = [
        { id:'gs1', type:'ground_station', label:'GS', x:240, y:0, angle:0, orbit:'ground', props:{} },
        { id:'sat1', type:'satellite_leo', label:'Sat', angle:0.3, orbit:'leo', props:{} },
      ];
      state.spaceLinks = [{ id:'spl1', fromAssetId:'gs1', toAssetId:'sat1', type:'uplink', label:'' }];
      // Deep Space — the new strict validator requires a handoff back to orbit.
      state.deepSpaceUnits = [
        { id:'du1', type:'ds_relay', label:'R', x:100, y:100, anchor:'mars', props:{} },
        { id:'du2', type:'ds_probe', label:'P', x:200, y:200, props:{} },
      ];
      state.deepSpaceLinks = [
        { id:'dl1', fromId:'du1', toId:'du2',  type:'ds_laser', label:'' },
        { id:'dl2', fromId:'du1', toId:'gs1',  type:'ds_dsn',   label:'handoff' }, // cross-domain
      ];
      evaluateProgression();
      decorateViewButtons();
    });
    const prog = await page.evaluate(() => state.progression);
    for (const s of ['local','city','planet','orbit','deepspace']) {
      expect(prog.completed[s], `${s} should be complete`).toBe(true);
      expect(prog.unlocked[s],  `${s} should be unlocked`).toBe(true);
    }
  });
});

test.describe('GreyNet — placement palettes per view', () => {
  test('Orbit palette exposes all 13 unit types', async ({ page }) => {
    await freshLoad(page);
    // Force-unlock so we can switch
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('space');
    });
    const count = await page.locator('[data-spaceasset-type]').count();
    expect(count).toBe(13);
    // Spot-check the new units
    for (const t of ['defense_node','monitor_sat','gps_nav','comm_array','orbit_firewall','data_router']) {
      await expect(page.locator(`[data-spaceasset-type="${t}"]`)).toBeVisible();
    }
  });

  test('Deep Space palette exposes 10 units + 5 link types', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('deepspace');
    });
    expect(await page.locator('[data-deepunit-type]').count()).toBe(10);
    expect(await page.locator('[data-deeplink-type]').count()).toBe(5);
  });

  test('Planet palette exposes infrastructure types', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('world');
    });
    expect(await page.locator('[data-planetinfra-type]').count()).toBe(7);
    expect(await page.locator('[data-site-type]').count()).toBe(9);
  });
});

test.describe('GreyNet — placement + rendering', () => {
  test('placing a deep-space unit renders it', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('deepspace');
      pushHistory();
      state.deepSpaceUnits.push({
        id: 'test-unit', type: 'ds_relay', label: 'TestRelay',
        x: 300, y: 300, props: {}
      });
      renderAll();
    });
    await expect(page.locator('#deepspace-units-layer .ds-unit')).toHaveCount(1);
    await expect(page.locator('#deepspace-units-layer .du-label')).toContainText('TestRelay');
  });

  test('placing a planet-infra unit renders it', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('world');
      pushHistory();
      state.planetInfra.push({
        id: 'pi-test', type: 'global_dc', label: 'EdgeDC',
        lat: 0, lng: 0, props: {}
      });
      renderAll();
    });
    await expect(page.locator('#planetinfra-layer .pi-marker')).toHaveCount(1);
  });

  test('deep-space units can be linked together', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      for (const k of Object.keys(state.progression.unlocked)) state.progression.unlocked[k] = true;
      setViewMode('deepspace');
      state.deepSpaceUnits = [
        { id:'u1', type:'ds_relay', label:'A', x:100, y:100, props:{} },
        { id:'u2', type:'ds_probe', label:'B', x:300, y:100, props:{} },
      ];
      state.deepSpaceLinks = [
        { id:'lk1', fromId:'u1', toId:'u2', type:'ds_laser', label:'' },
      ];
      renderAll();
    });
    await expect(page.locator('#deepspace-units-layer .ds-unit')).toHaveCount(2);
    await expect(page.locator('#deepspace-unitlinks-layer .ds-unitlink')).toHaveCount(1);
  });
});

test.describe('GreyNet — connection validation', () => {
  test('validateConnection allows adjacent sections', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => validateConnection('orbit', 'deepspace'));
    expect(r.ok).toBe(true);
  });

  test('validateConnection rejects non-adjacent sections', async ({ page }) => {
    await freshLoad(page);
    const r1 = await page.evaluate(() => validateConnection('local', 'orbit'));
    const r2 = await page.evaluate(() => validateConnection('city', 'deepspace'));
    expect(r1.ok).toBe(false);
    expect(r1.reason).toMatch(/intermediate/i);
    expect(r2.ok).toBe(false);
  });
});

test.describe('GreyNet — persistence', () => {
  test('a placed deep-space unit survives a reload via autosave', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      pushHistory();
      state.deepSpaceUnits = [{
        id: 'persistent-unit', type: 'ds_quantum',
        label: 'QuantumGW', x: 250, y: 250, props: {},
      }];
      autosave();
    });
    await reloadKeepingStorage(page);
    const restored = await page.evaluate(() => state.deepSpaceUnits.map(u => ({ id: u.id, type: u.type, label: u.label })));
    expect(restored).toEqual([{ id: 'persistent-unit', type: 'ds_quantum', label: 'QuantumGW' }]);
  });

  test('progression state survives a reload', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      ensureDefaultSite();
      const hq = state.sites[0].id;
      state.devices = [
        { id:'d1', type:'firewall', x:0, y:0, label:'FW', props:{}, siteId: hq },
        { id:'d2', type:'l3switch', x:0, y:0, label:'SW', props:{}, siteId: hq },
        { id:'d3', type:'server',   x:0, y:0, label:'Sv', props:{}, siteId: hq },
      ];
      state.links = [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }];
      evaluateProgression();
      autosave();
    });
    await reloadKeepingStorage(page);
    const prog = await page.evaluate(() => state.progression);
    expect(prog.completed.local).toBe(true);
    expect(prog.unlocked.city).toBe(true);
  });
});

test.describe('GreyNet — UI helpers', () => {
  test('Load demo button populates a rich seed', async ({ page }) => {
    await freshLoad(page);
    await resetToFreshUser(page);
    // No devices yet
    expect(await page.evaluate(() => state.devices.length)).toBe(0);
    // Suppress confirm() since wipe-confirm fires if any data exists
    page.on('dialog', d => d.accept());
    await page.evaluate(() => loadDemoNetwork());
    const after = await page.evaluate(() => ({
      devices: state.devices.length,
      sites: state.sites.length,
      cities: state.cities.length,
      spaceAssets: state.spaceAssets.length,
    }));
    expect(after.devices).toBeGreaterThan(0);
    expect(after.sites).toBeGreaterThan(0);
    expect(after.cities).toBeGreaterThan(0);
    expect(after.spaceAssets).toBeGreaterThan(0);
  });

  test('walkthrough Skip dismisses and marks done', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.progression !== undefined);
    await expect(page.locator('#walkthrough')).toBeVisible({ timeout: 2000 });
    await page.click('.wt-skip');
    await expect(page.locator('#walkthrough')).toBeHidden();
    expect(await page.evaluate(() => state.progression.walkthroughDone)).toBe(true);
  });
});
