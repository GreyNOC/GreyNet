/**
 * GreyNet production-readiness tests.
 *
 * Covers the new modules added in the v0.5/v0.6 production repair:
 *   - validator.js           (validateArchitectureGraph)
 *   - migrations.js          (migrateDiagram, stampDiagram)
 *   - ai-actions.js          (buildAiSystemPrompt, applyAiActionsV2)
 *   - orbit-metrics.js       (orbitLinkSummary, orbitValidate)
 *   - deepspace-mesh.js      (dsMeshSummary, dsPathBackToHome)
 *   - ui-toast.js            (toast, showModalAlert)
 *   - packaged-file manifest (every loaded script is in build.files)
 *
 * Each describe block is independent; you can run any one in isolation.
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
    typeof validateArchitectureGraph === 'function' &&
    typeof migrateDiagram === 'function'
  );
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
    state.progression.walkthroughDone = true;
  });
}

test.describe('GreyNet — module load', () => {
  test('all new production modules load without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await freshLoad(page);
    const exposed = await page.evaluate(() => ({
      validator:    typeof validateArchitectureGraph,
      migrations:   typeof migrateDiagram,
      stamp:        typeof stampDiagram,
      toast:        typeof toast,
      modalAlert:   typeof showModalAlert,
      mesh:         typeof renderDeepSpaceMeshPanel,
      meshSummary:  typeof dsMeshSummary,
      orbitMetrics: typeof orbitLinkSummary,
      orbitValid:   typeof orbitValidate,
      aiPrompt:     typeof buildAiSystemPrompt,
      aiApply:      typeof applyAiActionsV2,
      schemaVer:    typeof GREYNET_SCHEMA_VERSION,
    }));
    expect(exposed).toEqual({
      validator: 'function', migrations: 'function', stamp: 'function',
      toast: 'function', modalAlert: 'function',
      mesh: 'function', meshSummary: 'function',
      orbitMetrics: 'function', orbitValid: 'function',
      aiPrompt: 'function', aiApply: 'function',
      schemaVer: 'number',
    });
    expect(errors.filter(e => !/Failed to load resource|net::/.test(e))).toEqual([]);
  });

  test('progression.js IS in the packaged build.files manifest', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const files = pkg.build && pkg.build.files;
    expect(Array.isArray(files)).toBe(true);
    expect(files).toContain('progression.js');
    // All new modules must also be bundled.
    for (const f of ['validator.js','migrations.js','ui-toast.js','deepspace-mesh.js','orbit-metrics.js','ai-actions.js']) {
      expect(files, `${f} should be in build.files`).toContain(f);
    }
  });

  test('every <script src> in index.html exists on disk and is in build.files', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const pkg  = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const files = pkg.build.files;
    const scriptSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)]
      .map(m => m[1]).filter(s => !s.startsWith('http'));
    for (const src of scriptSrcs) {
      const abs = path.join(__dirname, '..', src);
      expect(fs.existsSync(abs), `${src} should exist on disk`).toBe(true);
      // Anything loaded by index.html must be in the bundle.
      expect(files.some(f => f === src || f.startsWith(src)), `${src} should be in build.files`).toBe(true);
    }
  });
});

test.describe('GreyNet — validator', () => {
  test('empty state is not complete; full chain is complete', async ({ page }) => {
    await freshLoad(page);
    const empty = await page.evaluate(() => {
      const s = { devices:[],links:[],zones:[],sites:[],siteLinks:[],cities:[],endpoints:[],
        cityLinks:[],spaceAssets:[],spaceLinks:[],planetInfra:[],deepSpaceUnits:[],deepSpaceLinks:[] };
      return validateArchitectureGraph(s);
    });
    expect(empty.complete).toBe(false);
    expect(empty.sectionStatus.local.blockers.length).toBeGreaterThan(0);

    const full = await page.evaluate(() => {
      const s = {
        devices: [
          { id:'d1', type:'firewall', x:0, y:0, label:'FW', props:{}, siteId:'hq' },
          { id:'d2', type:'l3switch', x:0, y:0, label:'SW', props:{}, siteId:'hq' },
          { id:'d3', type:'server',   x:0, y:0, label:'Sv', props:{}, siteId:'hq' },
        ],
        links:[
          { id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' },
          { id:'l2', fromId:'d2', toId:'d3', type:'ethernet', label:'' },
        ],
        zones:[],
        sites:[
          { id:'hq', type:'office', name:'HQ', lat:40, lng:-74, color:'#5fb3ff' },
          { id:'s2', type:'datacenter', name:'DC', lat:50, lng:10, color:'#5fb3ff' },
        ],
        siteLinks:[{ id:'sl1', fromSiteId:'hq', toSiteId:'s2', type:'wan', label:'' }],
        cities:[{ id:'c1', name:'NYC' }],
        endpoints:[
          { id:'e1', type:'building', label:'B', siteId:'hq', cityId:'c1' },
          { id:'e2', type:'cabinet',  label:'CAB', cityId:'c1' },
        ],
        cityLinks:[{ id:'cl1', fromEpId:'e1', toEpId:'e2', type:'fiber_buried', label:'' }],
        spaceAssets:[
          { id:'gs1', type:'ground_station', label:'GS', x:240, y:0, angle:0, orbit:'ground' },
          { id:'sat1', type:'satellite_leo', label:'Sat', angle:0.3, orbit:'leo' },
        ],
        spaceLinks:[{ id:'spl1', fromAssetId:'gs1', toAssetId:'sat1', type:'uplink', label:'' }],
        planetInfra:[],
        deepSpaceUnits:[{ id:'du1', type:'ds_relay', label:'R', x:0, y:0, anchor:'mars' }],
        deepSpaceLinks:[{ id:'dl1', fromId:'du1', toId:'gs1', type:'ds_dsn', label:'' }],
        activeSiteId:'hq',
      };
      return { v: validateArchitectureGraph(s), hasFull: hasFullArchitecturePath(s) };
    });
    expect(full.v.complete).toBe(true);
    expect(full.hasFull).toBe(true);
    expect(full.v.orphanedObjects.length).toBe(0);
    expect(full.v.paths.some(p => p.complete && p.kind === 'main')).toBe(true);
  });

  test('validator catches orphans + missing handoff', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        devices:[], links:[], zones:[], sites:[], siteLinks:[],
        cities:[], endpoints:[], cityLinks:[],
        spaceAssets:[], spaceLinks:[],
        planetInfra:[],
        deepSpaceUnits:[{ id:'u1', type:'ds_probe', label:'P' }],
        deepSpaceLinks:[],
      };
      return validateArchitectureGraph(s);
    });
    expect(r.sectionStatus.deepspace.complete).toBe(false);
    expect(r.sectionStatus.deepspace.blockers.join(' ')).toMatch(/handoff/i);
    expect(r.orphanedObjects.find(o => o.layer === 'deepspace')).toBeDefined();
  });
});

test.describe('GreyNet — migrations', () => {
  test('v1 → v5 brings missing fields up to current schema', async ({ page }) => {
    await freshLoad(page);
    const result = await page.evaluate(() => {
      const old = {
        app:'GreyNet', version:1,
        devices:[{ id:'d1', type:'router', x:0, y:0, label:'R', props:{}, siteId:'hq' }],
        links:[],
        sites:[{ id:'hq', type:'office', name:'HQ', lat:40, lng:-74, color:'#5fb3ff' }],
        siteLinks:[{ id:'orphan', fromSiteId:'hq', toSiteId:'gone', type:'wan' }],
      };
      return migrateDiagram(old);
    });
    expect(result.schemaVersion).toBe(5);
    expect(Array.isArray(result.planetInfra)).toBe(true);
    expect(Array.isArray(result.deepSpaceUnits)).toBe(true);
    expect(result.progression).toBeTruthy();
    expect(result.progression.unlocked.local).toBe(true);
    // Orphan siteLink dropped
    expect(result.siteLinks.length).toBe(0);
  });

  test('migrateDiagram rejects non-GreyNet input', async ({ page }) => {
    await freshLoad(page);
    const err = await page.evaluate(() => {
      try { migrateDiagram({ app:'NotGreyNet' }); return null; }
      catch (e) { return e.message; }
    });
    expect(err).toMatch(/Not a GreyNet diagram/i);
  });
});

test.describe('GreyNet — AI v2', () => {
  test('system prompt enumerates all current asset/link types', async ({ page }) => {
    await freshLoad(page);
    const sys = await page.evaluate(() => buildAiSystemPrompt());
    // Every newly-added space asset type must appear.
    for (const t of ['defense_node','monitor_sat','gps_nav','comm_array','orbit_firewall','data_router']) {
      expect(sys).toContain(`"${t}"`);
    }
    // Every deep-space unit type.
    for (const t of ['ds_relay','ds_quantum','ds_threat_array','ds_archive']) {
      expect(sys).toContain(`"${t}"`);
    }
    // Planet infra types.
    for (const t of ['global_dc','ground_uplink','ai_center','security_gw']) {
      expect(sys).toContain(`"${t}"`);
    }
    // New action names.
    for (const a of ['addPlanetInfra','addDeepSpaceUnit','addDeepSpaceLink',
                     'connectArchitecturePath','repairArchitecture',
                     'explainDesign','suggestNextStep']) {
      expect(sys).toContain(a);
    }
  });

  test('applyAiActionsV2 rejects unknown types and duplicate links', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.devices = [
        { id:'d1', type:'router', x:0, y:0, label:'R1', props:{}, siteId:'hq' },
        { id:'d2', type:'switch', x:0, y:0, label:'S1', props:{}, siteId:'hq' },
      ];
      state.links = [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }];
      const result = applyAiActionsV2({
        actions: [
          { type: 'thisDoesNotExist' },
          { type: 'addDevice', deviceType: 'unknownType', label: 'X' },
          { type: 'addLink', fromId:'d1', toId:'d2', linkType:'ethernet' }, // duplicate
          { type: 'addSpaceAsset', assetType:'satellite_leo', label:'NewSat' },
        ],
        notes: 'test',
      }, { state, uid, snap, pushHistory, renderAll });
      return result;
    });
    expect(r.appliedCount).toBe(1); // only addSpaceAsset succeeds
    expect(r.skippedCount).toBe(3);
    expect(r.skipped.find(s => s.reason === 'unknown action type')).toBeDefined();
    expect(r.skipped.find(s => s.reason === 'unknown deviceType')).toBeDefined();
    expect(r.skipped.find(s => s.reason === 'duplicate link')).toBeDefined();
  });

  test('applyAiActionsV2 can build a connected mini-network', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const before = state.devices.length;
      const result = applyAiActionsV2({
        actions: [
          { type:'addDevice', deviceType:'firewall', label:'AI-FW',  x:200, y:200 },
          { type:'addDevice', deviceType:'l3switch', label:'AI-SW',  x:400, y:200 },
          { type:'addDevice', deviceType:'server',   label:'AI-Srv', x:600, y:200 },
          { type:'addLink', fromId:'AI-FW', toId:'AI-SW', linkType:'ethernet' },
          { type:'addLink', fromId:'AI-SW', toId:'AI-Srv', linkType:'ethernet' },
        ],
      }, { state, uid, snap, pushHistory, renderAll });
      return {
        applied: result.appliedCount,
        skipped: result.skippedCount,
        addedDevices: state.devices.length - before,
      };
    });
    expect(r.applied).toBe(5);
    expect(r.skipped).toBe(0);
    expect(r.addedDevices).toBe(3);
  });
});

test.describe('GreyNet — orbit metrics', () => {
  test('orbitLinkSummary returns distance, latency, altitude', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Geometry note: metrics use the same inclined-orbit frame the canvas
      // draws (LEO: inc 53°, RAAN −40°). The LEO ring crosses the screen
      // plane (z=0) at orbit angle π − 40°·π/180 ≈ 2.443; a ground station
      // at rim angle π sits directly beneath that point, so the uplink is
      // genuinely above the horizon.
      state.spaceAssets = [
        { id:'gs1', type:'ground_station', label:'GS', x:-240, y:0, angle:Math.PI, orbit:'ground' },
        { id:'sat1', type:'satellite_leo', label:'LEO', angle:2.443, orbit:'leo' },
      ];
      state.spaceLinks = [{ id:'l1', fromAssetId:'gs1', toAssetId:'sat1', type:'uplink', label:'' }];
      return orbitLinkSummary('l1', state);
    });
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.latencyMs).toBeGreaterThan(0);
    expect(r.fromAltitude).toBe('Ground');
    expect(r.toAltitude).toMatch(/LEO/);
    expect(r.valid).toBe(true);
  });

  test('orbit metrics agree between panel math and validator (no dual-model drift)', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.spaceAssets = [
        { id:'gs1', type:'ground_station', label:'GS', angle:0, orbit:'ground' },
        { id:'sat1', type:'satellite_leo', label:'LEO', angle:0.3, orbit:'leo' },
      ];
      state.spaceLinks = [{ id:'l1', fromAssetId:'gs1', toAssetId:'sat1', type:'uplink', label:'' }];
      const a = state.spaceAssets[0], b = state.spaceAssets[1];
      const panel = spaceLinkMetrics(a, b);
      const summary = orbitLinkSummary('l1', state);
      return {
        panelDist: panel.distanceKm, summaryDist: summary.distanceKm,
        panelOcc: panel.occulted, summaryOcc: summary.occluded,
      };
    });
    expect(r.summaryDist).toBeCloseTo(r.panelDist, 6);
    expect(r.summaryOcc).toBe(r.panelOcc);
  });

  test('orbitValidate flags uplink that does not touch ground', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.spaceAssets = [
        { id:'leo1', type:'satellite_leo', label:'L1', angle:0,   orbit:'leo' },
        { id:'leo2', type:'satellite_leo', label:'L2', angle:0.3, orbit:'leo' },
      ];
      state.spaceLinks = [{ id:'l1', fromAssetId:'leo1', toAssetId:'leo2', type:'uplink', label:'' }];
      return orbitValidate(state);
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => /ground/i.test(i.message))).toBe(true);
  });
});

test.describe('GreyNet — Deep Space mesh', () => {
  test('dsMeshSummary counts units, links, handoffs, orphans', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.spaceAssets = [{ id:'gs1', type:'ground_station', label:'GS', x:240, y:0, angle:0, orbit:'ground' }];
      state.deepSpaceUnits = [
        { id:'u1', type:'ds_relay', label:'R', x:0, y:0, anchor:'mars' },
        { id:'u2', type:'ds_probe', label:'P', x:200, y:200 },           // orphan
      ];
      state.deepSpaceLinks = [{ id:'dl1', fromId:'u1', toId:'gs1', type:'ds_dsn', label:'' }];
      return dsMeshSummary(state);
    });
    expect(r.units).toBe(2);
    expect(r.anchored).toBe(1);
    expect(r.handoffs).toBe(1);
    // u2 has no link and no anchor → orphaned. u1 reaches planet via gs1.
    expect(r.orphanedCount).toBeGreaterThanOrEqual(1);
  });

  test('dsPathBackToHome resolves an anchored→ground path', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.spaceAssets = [{ id:'gs1', type:'ground_station', label:'GS', x:240, y:0, angle:0, orbit:'ground' }];
      state.deepSpaceUnits = [{ id:'u1', type:'ds_relay', label:'R', anchor:'mars' }];
      state.deepSpaceLinks = [{ id:'dl1', fromId:'u1', toId:'gs1', type:'ds_dsn', label:'' }];
      return dsPathBackToHome('u1', state);
    });
    expect(r.reached).toBe('planet');
    expect(r.hops).toContain('u1');
    expect(r.hops).toContain('gs1');
  });
});

test.describe('GreyNet — toast helper', () => {
  test('toast() appends a transient pill to the body', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => toast('hello-world', { variant: 'info', ttlMs: 5000 }));
    await expect(page.locator('#greynet-toast-stack .greynet-toast-info')).toBeVisible();
    await expect(page.locator('#greynet-toast-stack .greynet-toast-info')).toContainText('hello-world');
  });
});

test.describe('GreyNet — validator (extra coverage)', () => {
  test('a local-only design is not architecture-complete overall', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        devices: [
          { id:'d1', type:'firewall', x:0, y:0, label:'FW', props:{}, siteId:'hq' },
          { id:'d2', type:'l3switch', x:0, y:0, label:'SW', props:{}, siteId:'hq' },
          { id:'d3', type:'server',   x:0, y:0, label:'Sv', props:{}, siteId:'hq' },
        ],
        links: [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }],
        zones: [],
        sites: [{ id:'hq', type:'office', name:'HQ', lat:40, lng:-74, color:'#5fb3ff' }],
        siteLinks: [], cities: [], endpoints: [], cityLinks: [],
        spaceAssets: [], spaceLinks: [],
        planetInfra: [], deepSpaceUnits: [], deepSpaceLinks: [],
        activeSiteId: 'hq',
      };
      return validateArchitectureGraph(s);
    });
    expect(r.sectionStatus.local.complete).toBe(true);
    expect(r.complete).toBe(false);
    expect(r.fullPathExists).toBe(false);
    // City/Planet/Orbit/Deep Space must each surface blockers.
    for (const sec of ['city','planet','orbit','deepspace']) {
      expect(r.sectionStatus[sec].blockers.length, `${sec} should have blockers`).toBeGreaterThan(0);
    }
  });

  test('orphan detection: each kind of object is reported separately', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        // Local: 4 devices, 1 link → 2 orphaned devices (need ≥1 link to NOT be orphan)
        devices: [
          { id:'d1', type:'router',  x:0, y:0, label:'R',  props:{}, siteId:'hq' },
          { id:'d2', type:'switch',  x:0, y:0, label:'SW', props:{}, siteId:'hq' },
          { id:'d3', type:'server',  x:0, y:0, label:'S1', props:{}, siteId:'hq' },
          { id:'d4', type:'server',  x:0, y:0, label:'S2', props:{}, siteId:'hq' },
        ],
        links: [{ id:'l1', fromId:'d1', toId:'d2', type:'ethernet', label:'' }],
        // City: 2 cabinet endpoints, no city links → both orphan
        cities: [{ id:'c1', name:'C' }],
        endpoints: [
          { id:'e1', type:'cabinet', label:'EP1', cityId:'c1' },
          { id:'e2', type:'cabinet', label:'EP2', cityId:'c1' },
        ],
        cityLinks: [],
        // Planet: 2 sites + 1 link only between site A and a (non-existent) third → orphan site
        sites: [
          { id:'hq', type:'office',     name:'HQ', lat:40, lng:-74, color:'#5fb3ff' },
          { id:'dc', type:'datacenter', name:'DC', lat:50, lng:10, color:'#5fb3ff' },
        ],
        siteLinks: [{ id:'sl1', fromSiteId:'hq', toSiteId:'hq', type:'wan' }], // self-link
        // Orbit: 2 assets, no links → both orphan
        spaceAssets: [
          { id:'gs1', type:'ground_station', label:'GS', x:240, y:0, angle:0, orbit:'ground' },
          { id:'sat1', type:'satellite_leo', label:'Sat', angle:0.3, orbit:'leo' },
        ],
        spaceLinks: [{ id:'spl1', fromAssetId:'gs1', toAssetId:'sat1', type:'uplink', label:'' }],
        // Deep Space: 2 units, no link, no anchor → both orphan
        planetInfra: [],
        deepSpaceUnits: [
          { id:'u1', type:'ds_relay', label:'R' },
          { id:'u2', type:'ds_probe', label:'P' },
        ],
        deepSpaceLinks: [],
        activeSiteId: 'hq',
      };
      const v = validateArchitectureGraph(s);
      return { orphans: v.orphanedObjects, complete: v.complete };
    });
    // Devices d3 + d4 (unlinked) — d1/d2 are connected, so 2 device orphans.
    const byLayer = r.orphans.reduce((o, x) => { (o[x.layer] = o[x.layer] || []).push(x); return o; }, {});
    expect((byLayer.local || []).filter(x => x.kind === 'device').length).toBe(2);
    // Both city endpoints have no link AND no siteId → 2 orphans
    expect((byLayer.city || []).filter(x => x.kind === 'endpoint').length).toBe(2);
    // DS units have no link no anchor → 2 orphans
    expect((byLayer.deepspace || []).filter(x => x.kind === 'unit').length).toBe(2);
    expect(r.complete).toBe(false);
  });

  test('validator emits per-section recommendations', async ({ page }) => {
    await freshLoad(page);
    const recs = await page.evaluate(() => {
      const s = { devices:[],links:[],zones:[],sites:[],siteLinks:[],cities:[],endpoints:[],
        cityLinks:[],spaceAssets:[],spaceLinks:[],planetInfra:[],deepSpaceUnits:[],deepSpaceLinks:[] };
      const v = validateArchitectureGraph(s);
      return Object.fromEntries(['local','city','planet','orbit','deepspace']
        .map(k => [k, v.sectionStatus[k].recommendations]));
    });
    for (const sec of ['local','city','planet','orbit','deepspace']) {
      expect(recs[sec].length, `${sec} should have at least one recommendation`).toBeGreaterThan(0);
    }
  });
});

test.describe('GreyNet — persistence round-trip', () => {
  test('export → re-import keeps the architecture intact', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Populate a complete diagram
      window.confirm = () => true;
      loadDemoNetwork();
      const exported = diagramToJson();
      const before = {
        devices: state.devices.length, sites: state.sites.length,
        cities: state.cities.length, spaceAssets: state.spaceAssets.length,
        deepSpaceUnits: state.deepSpaceUnits.length,
        validatorComplete: validateArchitectureGraph(state).complete,
      };
      // Wipe and re-import
      state.devices = []; state.links = []; state.zones = [];
      state.sites = []; state.siteLinks = [];
      state.cities = []; state.endpoints = []; state.cityLinks = [];
      state.spaceAssets = []; state.spaceLinks = [];
      state.planetInfra = []; state.deepSpaceUnits = []; state.deepSpaceLinks = [];
      loadFromJson(exported);
      const after = {
        devices: state.devices.length, sites: state.sites.length,
        cities: state.cities.length, spaceAssets: state.spaceAssets.length,
        deepSpaceUnits: state.deepSpaceUnits.length,
        validatorComplete: validateArchitectureGraph(state).complete,
        schemaVersion: exported.schemaVersion,
      };
      return { before, after };
    });
    expect(r.before).toEqual(expect.objectContaining({
      devices: expect.any(Number),
      validatorComplete: true,
    }));
    expect(r.after.devices).toBe(r.before.devices);
    expect(r.after.sites).toBe(r.before.sites);
    expect(r.after.cities).toBe(r.before.cities);
    expect(r.after.spaceAssets).toBe(r.before.spaceAssets);
    expect(r.after.deepSpaceUnits).toBe(r.before.deepSpaceUnits);
    expect(r.after.validatorComplete).toBe(true);
    expect(r.after.schemaVersion).toBe(5);
  });
});

test.describe('GreyNet — AI v2 (extra coverage)', () => {
  test('addLink to a missing endpoint is skipped with a clear reason', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.devices = [];
      state.links = [];
      const result = applyAiActionsV2({
        actions: [
          { type:'addLink', fromId:'does-not-exist', toId:'also-missing', linkType:'ethernet' },
        ],
      }, { state, uid, snap, pushHistory, renderAll });
      return result;
    });
    expect(r.appliedCount).toBe(0);
    expect(r.skippedCount).toBe(1);
    expect(r.skipped[0].reason).toBe('endpoint not found');
  });

  test('addCity creates a city; addDeepSpaceUnit + addDeepSpaceLink to ground station works', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Seed a ground station to link to.
      state.spaceAssets = [{ id:'gs1', type:'ground_station', label:'GS-NY', x:240, y:0, angle:0, orbit:'ground' }];
      state.cities = [];
      const result = applyAiActionsV2({
        actions: [
          { type:'addCity', name:'NewCity', centerLat:40, centerLng:-74, mapBackend:'osm' },
          { type:'addDeepSpaceUnit', unitType:'ds_relay', label:'MarsR', anchor:'mars' },
          { type:'addDeepSpaceLink', fromLabel:'MarsR', toLabel:'GS-NY', linkType:'ds_dsn' },
        ],
        notes: 'mini-build',
      }, { state, uid, snap, pushHistory, renderAll });
      return {
        applied: result.appliedCount,
        skipped: result.skipped,
        cityCount: state.cities.length,
        dsUnits:   state.deepSpaceUnits.length,
        dsLinks:   state.deepSpaceLinks.length,
        // Link should be DS→orbit (handoff)
        handoff:   state.deepSpaceLinks.find(l => l.toId === 'gs1' || l.fromId === 'gs1') != null,
      };
    });
    expect(r.applied).toBe(3);
    expect(r.skipped).toEqual([]);
    expect(r.cityCount).toBe(1);
    expect(r.dsUnits).toBe(1);
    expect(r.dsLinks).toBe(1);
    expect(r.handoff).toBe(true);
  });

  test('suggestNextStep auto-generates guidance from the validator', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Empty state — should generate a "Next step" note.
      state.devices = []; state.links = []; state.zones = [];
      state.sites = []; state.siteLinks = [];
      state.cities = []; state.endpoints = []; state.cityLinks = [];
      state.spaceAssets = []; state.spaceLinks = [];
      state.planetInfra = []; state.deepSpaceUnits = []; state.deepSpaceLinks = [];
      return applyAiActionsV2({ actions: [{ type:'suggestNextStep' }] },
        { state, uid, snap, pushHistory, renderAll });
    });
    expect(r.appliedCount).toBe(1);
    expect(r.notes).toMatch(/Next step/i);
  });
});

test.describe('GreyNet — warnings tray architecture wiring', () => {
  test('tray surfaces architecture findings grouped by section', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Reset to empty so validator emits findings for every section.
      state.devices = []; state.links = []; state.zones = [];
      state.sites = []; state.siteLinks = [];
      state.cities = []; state.endpoints = []; state.cityLinks = [];
      state.spaceAssets = []; state.spaceLinks = [];
      state.planetInfra = []; state.deepSpaceUnits = []; state.deepSpaceLinks = [];
      renderWarnings();
      dom.warningsTray.classList.remove('hidden','collapsed');
      const items = Array.from(document.querySelectorAll('#warnings-body .warning-item'));
      const sections = items.map(el => {
        const m = el.textContent.match(/^\[([\w\s]+)\]/);
        return m ? m[1].trim() : null;
      }).filter(Boolean);
      const tallies = sections.reduce((o, s) => { o[s] = (o[s] || 0) + 1; return o; }, {});
      return { total: items.length, tallies };
    });
    // Every section should contribute ≥1 finding when the diagram is empty.
    for (const sec of ['Local','City','Planet','Orbit','Deep Space']) {
      expect(r.tallies[sec], `${sec} should appear in tray`).toBeGreaterThan(0);
    }
  });

  test('tray clears when architecture is complete (Load demo)', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      window.confirm = () => true;
      loadDemoNetwork();
      renderAll();
      return {
        hidden: dom.warningsTray.classList.contains('hidden'),
        count:  dom.warningsCount.textContent,
        bodyEmpty: dom.warningsBody.innerHTML === '',
      };
    });
    expect(r.hidden).toBe(true);
    expect(r.count).toBe('0');
    expect(r.bodyEmpty).toBe(true);
  });
});

test.describe('GreyNet — namespaces', () => {
  test('window.GreyNetValidation / GreyNetAI / GreyNetPersistence expose APIs', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => ({
      validation: typeof window.GreyNetValidation?.validateArchitectureGraph,
      ai:         typeof window.GreyNetAI?.applyActions,
      persist:    typeof window.GreyNetPersistence?.migrate,
      schemaVer:  window.GreyNetPersistence?.SCHEMA_VERSION,
    }));
    expect(r.validation).toBe('function');
    expect(r.ai).toBe('function');
    expect(r.persist).toBe('function');
    expect(r.schemaVer).toBe(5);
  });
});
