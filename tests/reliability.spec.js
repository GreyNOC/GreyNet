/**
 * GreyNet reliability tests.
 *
 * Fills the coverage gaps not already exercised by production.spec.js /
 * security.spec.js, per the maintainability/reliability brief:
 *   - validator   : per-section blockers on an incomplete design
 *   - migrations  : orphan-link removal + idempotency
 *   - ai-actions  : parseAiJson handling, enum fallback, string/prop truncation,
 *                   repairArchitecture / connectArchitecturePath decomposition
 *   - persistence : comms / deep-space / city + map fields survive a round-trip
 *
 * Pure browser modules, served statically and driven via page.evaluate —
 * matching the existing specs. `npm test` runs all of them.
 */
const { test, expect } = require('@playwright/test');

async function freshLoad(page) {
  await page.goto('about:blank');
  await page.evaluate(() => { try { localStorage.removeItem('greynet:autosave:v1'); } catch (_) {} });
  await page.goto('/');
  await page.waitForFunction(() =>
    typeof state !== 'undefined' &&
    typeof validateArchitectureGraph === 'function' &&
    typeof migrateDiagram === 'function' &&
    typeof applyAiActionsV2 === 'function' &&
    typeof parseAiJson === 'function' &&
    typeof diagramToJson === 'function' &&
    typeof loadFromJson === 'function'
  );
  await page.evaluate(() => {
    if (typeof closeWalkthrough === 'function') closeWalkthrough();
    if (state.progression) state.progression.walkthroughDone = true;
  });
}

const EMPTY = `{ devices:[],links:[],zones:[],sites:[],siteLinks:[],cities:[],endpoints:[],
  cityLinks:[],spaceAssets:[],spaceLinks:[],planetInfra:[],deepSpaceUnits:[],deepSpaceLinks:[] }`;

/* ========================================================================= */
test.describe('validator — blockers per section', () => {
  test('an empty design reports at least one blocker for every section', async ({ page }) => {
    await freshLoad(page);
    const blockers = await page.evaluate((emptySrc) => {
      const s = eval('(' + emptySrc + ')');
      const v = validateArchitectureGraph(s);
      return Object.fromEntries(['local', 'city', 'planet', 'orbit', 'deepspace']
        .map(sec => [sec, v.sectionStatus[sec].blockers.length]));
    }, EMPTY);
    for (const sec of ['local', 'city', 'planet', 'orbit', 'deepspace']) {
      expect(blockers[sec], `${sec} should have ≥1 blocker`).toBeGreaterThan(0);
    }
  });

  test('a local-only design clears local blockers but city/planet/orbit/deepspace remain blocked', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate((emptySrc) => {
      const s = eval('(' + emptySrc + ')');
      s.sites = [{ id: 'hq', type: 'office', name: 'HQ', lat: 0, lng: 0 }];
      s.activeSiteId = 'hq';
      s.devices = [
        { id: 'd1', type: 'firewall', x: 0, y: 0, label: 'FW', props: {}, siteId: 'hq' },
        { id: 'd2', type: 'l3switch', x: 0, y: 0, label: 'SW', props: {}, siteId: 'hq' },
        { id: 'd3', type: 'server',   x: 0, y: 0, label: 'Sv', props: {}, siteId: 'hq' },
      ];
      s.links = [{ id: 'l1', fromId: 'd1', toId: 'd2', type: 'ethernet', label: '' }];
      const v = validateArchitectureGraph(s);
      return {
        local: v.sectionStatus.local.complete,
        cityBlocked: v.sectionStatus.city.blockers.length > 0,
        planetBlocked: v.sectionStatus.planet.blockers.length > 0,
        complete: v.complete,
      };
    }, EMPTY);
    expect(r.local).toBe(true);
    expect(r.cityBlocked).toBe(true);
    expect(r.planetBlocked).toBe(true);
    expect(r.complete).toBe(false);
  });
});

/* ========================================================================= */
test.describe('migrations — orphan links + idempotency', () => {
  test('orphan links (referencing deleted nodes) are removed during migration', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const migrated = migrateDiagram({
        app: 'GreyNet',
        schemaVersion: 1,
        devices: [{ id: 'd1', type: 'server' }],
        links: [
          { id: 'l_ok',    fromId: 'd1', toId: 'd1' },   // self-link to a real node — kept
          { id: 'l_ghost', fromId: 'd1', toId: 'gone' }, // dangling endpoint — dropped
        ],
        sites: [{ id: 's1' }],
        siteLinks: [{ id: 'sl_ghost', fromSiteId: 's1', toSiteId: 'missing' }],
      });
      return {
        links: migrated.links.map(l => l.id),
        siteLinks: migrated.siteLinks.map(l => l.id),
        schemaVersion: migrated.schemaVersion,
      };
    });
    expect(r.links).toEqual(['l_ok']);
    expect(r.siteLinks).toEqual([]);
    expect(r.schemaVersion).toBe(5);
  });

  test('migrateDiagram is idempotent (migrate∘migrate === migrate)', async ({ page }) => {
    await freshLoad(page);
    const equal = await page.evaluate(() => {
      const input = {
        app: 'GreyNet', version: 2,
        devices: [{ id: 'd1', type: 'router' }, { id: 'd2', type: 'server' }],
        links: [{ id: 'l1', fromId: 'd1', toId: 'd2' }],
        sites: [{ id: 's1', type: 'office', name: 'HQ' }],
        viewMode: 'local',
      };
      const once  = migrateDiagram(input);
      const twice = migrateDiagram(once);
      return JSON.stringify(once) === JSON.stringify(twice);
    });
    expect(equal).toBe(true);
  });

  test('a non-array collection does not crash migration (coerced to empty)', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const migrated = migrateDiagram({ app: 'GreyNet', schemaVersion: 1, devices: 'not-an-array', links: 'nope' });
      return { devices: Array.isArray(migrated.links), linkCount: migrated.links.length };
    });
    expect(r.devices).toBe(true);
    expect(r.linkCount).toBe(0);
  });
});

/* ========================================================================= */
test.describe('ai-actions — parseAiJson + applier robustness', () => {
  test('parseAiJson handles plain, fenced, and prose-wrapped JSON; throws on garbage', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const plain  = parseAiJson('{"actions":[],"notes":"ok"}');
      const fenced = parseAiJson('```json\n{"actions":[{"type":"x"}],"notes":"f"}\n```');
      const prose  = parseAiJson('Sure — here is the JSON:\n{"actions":[],"notes":"p"}\nHope it helps!');
      let threw = false;
      try { parseAiJson('this is not json at all'); } catch (_) { threw = true; }
      return {
        plainNotes: plain.notes,
        fencedLen: fenced.actions.length,
        proseNotes: prose.notes,
        threw,
      };
    });
    expect(r.plainNotes).toBe('ok');
    expect(r.fencedLen).toBe(1);
    expect(r.proseNotes).toBe('p');
    expect(r.threw).toBe(true);
  });

  test('unknown linkType falls back to a safe default (ethernet)', async ({ page }) => {
    await freshLoad(page);
    const linkType = await page.evaluate(() => {
      state.devices = []; state.links = [];
      applyAiActionsV2({
        actions: [
          { type: 'addDevice', deviceType: 'server', label: 'A', x: 0, y: 0 },
          { type: 'addDevice', deviceType: 'server', label: 'B', x: 100, y: 0 },
          { type: 'addLink', fromId: 'A', toId: 'B', linkType: 'carrier-pigeon' },
        ],
      }, { state, uid, snap, pushHistory, renderAll });
      return state.links[0] && state.links[0].type;
    });
    expect(linkType).toBe('ethernet');
  });

  test('oversized labels and props are truncated', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.devices = [];
      applyAiActionsV2({
        actions: [{
          type: 'addDevice', deviceType: 'server',
          label: 'A'.repeat(5000), x: 0, y: 0,
          props: { role: 'B'.repeat(5000), ['k'.repeat(500)]: 'v' },
        }],
      }, { state, uid, snap, pushHistory, renderAll });
      const d = state.devices[0];
      const maxKeyLen = Math.max(...Object.keys(d.props).map(k => k.length));
      return { labelLen: d.label.length, roleLen: d.props.role.length, maxKeyLen };
    });
    expect(r.labelLen).toBeLessThanOrEqual(96);
    expect(r.roleLen).toBeLessThanOrEqual(1000);
    expect(r.maxKeyLen).toBeLessThanOrEqual(64);
  });

  test('repairArchitecture / connectArchitecturePath decompose into a notes punch-list', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Empty-ish design so the validator has real blockers to report.
      state.devices = []; state.links = []; state.zones = [];
      state.sites = []; state.siteLinks = [];
      state.cities = []; state.endpoints = []; state.cityLinks = [];
      state.spaceAssets = []; state.spaceLinks = [];
      state.planetInfra = []; state.deepSpaceUnits = []; state.deepSpaceLinks = [];
      const repair = applyAiActionsV2({ actions: [{ type: 'repairArchitecture' }] },
        { state, uid, snap, pushHistory, renderAll });
      const connect = applyAiActionsV2({ actions: [{ type: 'connectArchitecturePath' }] },
        { state, uid, snap, pushHistory, renderAll });
      return {
        repairApplied: repair.appliedCount,
        repairNotes: repair.notes,
        connectApplied: connect.appliedCount,
        connectNotes: connect.notes,
      };
    });
    expect(r.repairApplied).toBe(1);
    expect(r.repairNotes).toMatch(/repairArchitecture — outstanding/);
    expect(r.repairNotes).toMatch(/local/);
    expect(r.connectApplied).toBe(1);
    expect(r.connectNotes).toMatch(/connectArchitecturePath — outstanding/);
  });
});

/* ========================================================================= */
test.describe('persistence — comms / deep-space / city + map fields survive round-trip', () => {
  test('export → import preserves comms, deep-space mesh, and city map backend', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Seed the fields the round-trip must preserve.
      state.sites = [{ id: 'hq', type: 'office', name: 'HQ', lat: 0, lng: 0, address: '', notes: '', color: '#fff' }];
      state.activeSiteId = 'hq';
      state.cities = [{
        id: 'c1', name: 'Metro',
        centerLat: 41.5, centerLng: -73.2,
        mapW: 1800, mapH: 1200,
        mapBackend: 'osm', imageUrl: '', notes: 'keepme',
      }];
      state.activeCityId = 'c1';
      state.deepSpaceUnits = [
        { id: 'u1', type: 'ds_relay', label: 'R1', x: 100, y: 100, props: {} },
        { id: 'u2', type: 'ds_probe', label: 'P1', x: 200, y: 200, props: {} },
      ];
      state.deepSpaceLinks = [{ id: 'dl1', fromId: 'u1', toId: 'u2', type: 'ds_laser', label: '' }];
      state.comms = { txPowerW: 15000, freqGHz: 7.2, dataBps: 5000000 };

      const exported = diagramToJson();

      // Wipe, then re-import the exported diagram.
      state.cities = []; state.deepSpaceUnits = []; state.deepSpaceLinks = []; state.comms = null;
      loadFromJson(exported);

      const city = state.cities.find(c => c.id === 'c1') || state.cities[0];
      return {
        cityBackend: city && city.mapBackend,
        cityCenterLat: city && city.centerLat,
        cityMapW: city && city.mapW,
        cityNotes: city && city.notes,
        dsUnits: state.deepSpaceUnits.length,
        dsUnitType: state.deepSpaceUnits[0] && state.deepSpaceUnits[0].type,
        dsLinks: state.deepSpaceLinks.length,
        commsTx: state.comms && state.comms.txPowerW,
        commsFreq: state.comms && state.comms.freqGHz,
      };
    });
    expect(r.cityBackend).toBe('osm');
    expect(r.cityCenterLat).toBe(41.5);
    expect(r.cityMapW).toBe(1800);
    expect(r.cityNotes).toBe('keepme');
    expect(r.dsUnits).toBe(2);
    expect(r.dsUnitType).toBe('ds_relay');
    expect(r.dsLinks).toBe(1);
    expect(r.commsTx).toBe(15000);
    expect(r.commsFreq).toBe(7.2);
  });
});
