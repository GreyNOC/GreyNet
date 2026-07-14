/**
 * GreyNet regression tests.
 *
 * Pins down fixed semantics across the core helpers plus the v0.8.0 modules:
 *   - typeOf shape-vs-type disambiguation      (app.js)
 *   - deleteSelection DS↔orbit handoff safety  (app.js)
 *   - newDiagram full-layer reset               (app.js)
 *   - selectAll per-view scoping                (app.js)
 *   - cleanComms defaults                       (app.js)
 *   - migrateDiagram malformed-progression      (migrations.js)
 *   - validator implicit DS handoff             (validator.js)
 *   - spaceLinkMetrics ground-ground routing    (app.js)
 *   - pushHistory dedup                         (state.js)
 *   - greatCircleKm / terminatorNightPolygon    (planet-metrics.js)
 *   - planetSiteLinkMetrics medium model        (planet-metrics.js)
 *   - generateConstellationFromAsset + undo     (app.js / state.js)
 *   - dsSunSepDeg / dsComputeLinkBudget / dsVerdict conjunction (app.js)
 *   - dsPathBackToHome route enrichment         (deepspace-mesh.js)
 *
 * Conventions copied from tests/production.spec.js: every test does a
 * freshLoad(page) and runs its assertions inside page.evaluate against the
 * live globals.
 */
const { test, expect } = require('@playwright/test');

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

test.describe('GreyNet — typeOf disambiguation', () => {
  test('shape checks beat type-table lookups for vpn link and internet zone', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => ({
      // 'vpn' is both a DEVICE_TYPES and a LINK_TYPES key — fromId/toId must win.
      vpnLink: typeOf({ id: 'x', fromId: 'a', toId: 'b', type: 'vpn' }),
      // 'internet' is both a DEVICE_TYPES and a ZONE_TYPES key — w/h must win.
      internetZone: typeOf({ id: 'x', x: 0, y: 0, w: 100, h: 100, type: 'internet' }),
      // Sanity: without the disambiguating shape they resolve as devices.
      vpnDevice: typeOf({ id: 'x', type: 'vpn', x: 0, y: 0 }),
      internetDevice: typeOf({ id: 'x', type: 'internet', x: 0, y: 0 }),
    }));
    expect(r.vpnLink).toBe('link');
    expect(r.internetZone).toBe('zone');
    expect(r.vpnDevice).toBe('device');
    expect(r.internetDevice).toBe('device');
  });
});

test.describe('GreyNet — deleteSelection', () => {
  test('deleting an unrelated device preserves DS↔orbit handoff links', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.devices = [
        { id: 'd1', type: 'router', x: 0, y: 0, label: 'R1', props: {}, siteId: state.activeSiteId },
        { id: 'd2', type: 'switch', x: 0, y: 0, label: 'S1', props: {}, siteId: state.activeSiteId },
      ];
      state.links = [];
      state.spaceAssets = [{ id: 'gs1', type: 'ground_station', label: 'GS', x: 240, y: 0, angle: 0, orbit: 'ground' }];
      state.deepSpaceUnits = [{ id: 'u1', type: 'ds_relay', label: 'R', x: 0, y: 0, anchor: 'mars' }];
      state.deepSpaceLinks = [{ id: 'dl1', fromId: 'u1', toId: 'gs1', type: 'ds_dsn', label: '' }];
      state.selectedIds = new Set(['d1']);
      deleteSelection();
      return {
        devices: state.devices.map(d => d.id),
        dsLinks: state.deepSpaceLinks.map(l => l.id),
        dsUnits: state.deepSpaceUnits.length,
        spaceAssets: state.spaceAssets.length,
      };
    });
    expect(r.devices).toEqual(['d2']);
    // The cross-domain handoff (DS unit → orbit ground station) must survive:
    // a DS-link endpoint is live if it's a DS unit OR an orbit asset.
    expect(r.dsLinks).toEqual(['dl1']);
    expect(r.dsUnits).toBe(1);
    expect(r.spaceAssets).toBe(1);
  });
});

test.describe('GreyNet — newDiagram', () => {
  test('clears every layer and leaves exactly the default site', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      window.confirm = () => true;
      loadDemoNetwork(); // populate all layers
      newDiagram();
      return {
        devices: state.devices.length,
        links: state.links.length,
        zones: state.zones.length,
        sites: state.sites.length,
        siteName: state.sites[0] ? state.sites[0].name : null,
        siteLinks: state.siteLinks.length,
        cities: state.cities.length,
        endpoints: state.endpoints.length,
        cityLinks: state.cityLinks.length,
        spaceAssets: state.spaceAssets.length,
        spaceLinks: state.spaceLinks.length,
        planetInfra: state.planetInfra.length,
        deepSpaceUnits: state.deepSpaceUnits.length,
        deepSpaceLinks: state.deepSpaceLinks.length,
        activeSiteId: state.activeSiteId,
      };
    });
    expect(r.devices).toBe(0);
    expect(r.links).toBe(0);
    expect(r.zones).toBe(0);
    expect(r.siteLinks).toBe(0);
    expect(r.cities).toBe(0);
    expect(r.endpoints).toBe(0);
    expect(r.cityLinks).toBe(0);
    expect(r.spaceAssets).toBe(0);
    expect(r.spaceLinks).toBe(0);
    expect(r.planetInfra).toBe(0);
    expect(r.deepSpaceUnits).toBe(0);
    expect(r.deepSpaceLinks).toBe(0);
    // ensureDefaultSite() re-seeds exactly one default site and activates it.
    expect(r.sites).toBe(1);
    expect(r.siteName).toBe('HQ');
    expect(r.activeSiteId).not.toBeNull();
  });
});

test.describe('GreyNet — selectAll scoping', () => {
  test('space mode selects only orbit assets+links; local mode only active-site items', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.sites = [
        { id: 's1', type: 'office', name: 'S1', lat: 40, lng: -74, color: '#5fb3ff' },
        { id: 's2', type: 'office', name: 'S2', lat: 50, lng: 10, color: '#5fb3ff' },
      ];
      state.activeSiteId = 's1';
      state.devices = [
        { id: 'd1', type: 'router', x: 0, y: 0, label: 'D1', props: {}, siteId: 's1' },
        { id: 'd2', type: 'server', x: 0, y: 0, label: 'D2', props: {}, siteId: 's1' },
        { id: 'd3', type: 'server', x: 0, y: 0, label: 'D3', props: {}, siteId: 's2' },
      ];
      state.links = [
        { id: 'l1', fromId: 'd1', toId: 'd2', type: 'ethernet', label: '' }, // in s1
        { id: 'l2', fromId: 'd2', toId: 'd3', type: 'ethernet', label: '' }, // crosses sites
      ];
      state.zones = [];
      state.spaceAssets = [
        { id: 'gs1', type: 'ground_station', label: 'GS', x: 240, y: 0, angle: 0, orbit: 'ground' },
        { id: 'sat1', type: 'satellite_leo', label: 'Sat', angle: 0.3, orbit: 'leo' },
      ];
      state.spaceLinks = [{ id: 'sl1', fromAssetId: 'gs1', toAssetId: 'sat1', type: 'uplink', label: '' }];

      state.viewMode = 'space';
      selectAll();
      const spaceSel = [...state.selectedIds].sort();

      state.viewMode = 'local';
      selectAll();
      const localSel = [...state.selectedIds].sort();

      return { spaceSel, localSel };
    });
    // Space mode: only spaceAssets + spaceLinks — no devices, sites, or DS items.
    expect(r.spaceSel).toEqual(['gs1', 'sat1', 'sl1']);
    // Local mode: only the ACTIVE site's devices and fully-in-site links.
    // d3 (site s2) and l2 (crosses into s2) must not be selected.
    expect(r.localSel).toEqual(['d1', 'd2', 'l1']);
  });
});

test.describe('GreyNet — cleanComms defaults', () => {
  test('cleanComms({}) yields the DSN-class gain defaults (tx 73 dBi, rx 47 dBi)', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const c = cleanComms({});
      return {
        txGainDbi: c.txGainDbi,
        rxGainDbi: c.rxGainDbi,
        sourceId: c.sourceId,
        targetId: c.targetId,
        nullForNonObject: cleanComms(null),
      };
    });
    expect(r.txGainDbi).toBe(73);
    expect(r.rxGainDbi).toBe(47);
    expect(r.sourceId).toBe('dsn70');
    expect(r.targetId).toBe('mars');
    expect(r.nullForNonObject).toBeNull();
  });
});

test.describe('GreyNet — migrations hardening', () => {
  test('v4 save with progression.unlocked as a string does not throw', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      try {
        const out = migrateDiagram({
          app: 'GreyNet', version: 4,
          devices: [], links: [], sites: [],
          progression: { unlocked: 'yes' },
        });
        return {
          threw: null,
          schemaVersion: out.schemaVersion,
          unlockedLocal: out.progression.unlocked.local,
          unlockedCity: out.progression.unlocked.city,
          completedLocal: out.progression.completed.local,
        };
      } catch (e) { return { threw: e.message }; }
    });
    expect(r.threw).toBeNull();
    expect(r.schemaVersion).toBe(5);
    // migrate4to5 coerces the malformed value to an object and repairs fields.
    expect(r.unlockedLocal).toBe(true);
    expect(r.unlockedCity).toBe(false);
    expect(r.completedLocal).toBe(false);
  });
});

test.describe('GreyNet — validator implicit DS handoff', () => {
  test('anchored + internally-linked unit + orbit ground station counts as an implicit handoff', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        devices: [], links: [], zones: [], sites: [], siteLinks: [],
        cities: [], endpoints: [], cityLinks: [],
        spaceAssets: [
          { id: 'gs1', type: 'ground_station', label: 'GS', x: 240, y: 0, angle: 0, orbit: 'ground' },
          { id: 'sat1', type: 'satellite_leo', label: 'Sat', angle: 0.3, orbit: 'leo' },
        ],
        spaceLinks: [{ id: 'spl1', fromAssetId: 'gs1', toAssetId: 'sat1', type: 'uplink', label: '' }],
        planetInfra: [],
        deepSpaceUnits: [
          { id: 'u1', type: 'ds_relay', label: 'R', x: 0, y: 0, anchor: 'mars' },
          { id: 'u2', type: 'ds_probe', label: 'P', x: 100, y: 100 },
        ],
        // DS-internal link only — no explicit DS→orbit handoff link.
        deepSpaceLinks: [{ id: 'dl1', fromId: 'u1', toId: 'u2', type: 'ds_laser', label: '' }],
      };
      const v = validateArchitectureGraph(s);
      return {
        complete: v.sectionStatus.deepspace.complete,
        blockers: v.sectionStatus.deepspace.blockers,
        warnings: v.sectionStatus.deepspace.warnings,
      };
    });
    expect(r.complete).toBe(true);
    expect(r.blockers).toEqual([]);
    // The implicit path is accepted but flagged as a warning, not a blocker.
    expect(r.warnings.join(' ')).toMatch(/implicit/i);
  });
});

test.describe('GreyNet — spaceLinkMetrics ground-ground', () => {
  test('two ground stations a quarter-turn apart route along the surface, never occulted', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const a = { id: 'g1', type: 'ground_station', label: 'A', angle: 0, orbit: 'ground' };
      const b = { id: 'g2', type: 'ground_station', label: 'B', angle: Math.PI / 2, orbit: 'ground' };
      return spaceLinkMetrics(a, b);
    });
    const quarterCircumference = 6371 * Math.PI / 2; // great-circle, not chord
    expect(Math.abs(r.distanceKm - quarterCircumference) / quarterCircumference).toBeLessThan(0.01);
    expect(r.occulted).toBe(false);
    // Fiber propagation (~c/1.5), so slower than free space.
    expect(r.latencyMs).toBeGreaterThan(quarterCircumference / 299792.458 * 1000);
  });
});

test.describe('GreyNet — history dedup', () => {
  test('two identical consecutive pushHistory calls grow past by exactly 1', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      // Mutate state so the snapshot differs from anything already stacked.
      state.devices.push({ id: 'hd1', type: 'router', x: 0, y: 0, label: 'H', props: {}, siteId: state.activeSiteId });
      const before = history.past.length;
      pushHistory();
      pushHistory(); // identical snapshot — must be deduped
      return { grew: history.past.length - before, future: history.future.length };
    });
    expect(r.grew).toBe(1);
    // Even a deduped push clears the redo stack.
    expect(r.future).toBe(0);
  });
});

test.describe('GreyNet — planet metrics (v0.8.0)', () => {
  test('greatCircleKm NY↔London and terminatorNightPolygon point count', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => ({
      nyLondonKm: greatCircleKm(40.7128, -74.0060, 51.5074, -0.1278),
      terminator: terminatorNightPolygon(Date.now(), 180).points.length,
      poleLatAbs: Math.abs(terminatorNightPolygon(Date.now(), 180).poleLat),
    }));
    expect(r.nyLondonKm).toBeGreaterThan(5540);
    expect(r.nyLondonKm).toBeLessThan(5610);
    // n samples + 1 closing sample + 2 pole corners = n + 3.
    expect(r.terminator).toBe(183);
    expect(r.poleLatAbs).toBe(90);
  });

  test('planetSiteLinkMetrics applies the 1.4× fiber route factor at 200,000 km/s', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      window.confirm = () => true;
      loadDemoNetwork();
      const sl = state.siteLinks[0];
      const m = planetSiteLinkMetrics(sl, state);
      return { distanceKm: m.distanceKm, routeKm: m.routeKm, latencyMs: m.latencyMs, medium: m.medium };
    });
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.routeKm).toBeCloseTo(r.distanceKm * 1.4, 6);
    expect(r.latencyMs).toBeCloseTo(r.routeKm / 200000 * 1000, 6);
    expect(r.medium).toBe('fiber');
  });
});

test.describe('GreyNet — constellation generator (v0.8.0)', () => {
  test('generateConstellationFromAsset(seed, 6) adds 5 sats + ring ISLs, one undo reverts', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const seed = { id: 'seed1', type: 'satellite_leo', label: 'Seed 1', angle: 0.2, orbit: 'leo', props: {} };
      state.spaceAssets = [seed];
      state.spaceLinks = [];
      const beforeAssets = state.spaceAssets.length;
      const beforeLinks = state.spaceLinks.length;
      const beforeHistory = history.past.length;
      generateConstellationFromAsset(seed, 6);
      const after = {
        assetsAdded: state.spaceAssets.length - beforeAssets,
        isls: state.spaceLinks.filter(l => l.type === 'laser_isl').length,
        historyGrew: history.past.length - beforeHistory,
        selected: state.selectedIds.size,
      };
      undo();
      return {
        ...after,
        assetsAfterUndo: state.spaceAssets.length,
        linksAfterUndo: state.spaceLinks.length,
        expectedAssets: beforeAssets,
        expectedLinks: beforeLinks,
      };
    });
    expect(r.assetsAdded).toBe(5);              // seed counts as slot 1 of 6
    expect(r.isls).toBeGreaterThanOrEqual(5);   // full ring closure is 6
    expect(r.historyGrew).toBe(1);              // a single undo step
    expect(r.selected).toBe(6);                 // whole ring selected
    expect(r.assetsAfterUndo).toBe(r.expectedAssets);
    expect(r.linksAfterUndo).toBe(r.expectedLinks);
  });
});

test.describe('GreyNet — deep-space conjunction (v0.8.0)', () => {
  test('Mars solar conjunction at 2028-03-21: SEP < 3°, budget flags it, verdict names it', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.comms.targetId = 'mars';
      const epoch = Date.parse('2028-03-21');
      const sep = dsSunSepDeg('mars', epoch);
      const lb = dsComputeLinkBudget(state.comms, epoch);
      const verdict = dsVerdict(lb);
      return { sep, conjunction: lb.conjunction, margin: lb.margin, verdictText: verdict.text, verdictCls: verdict.cls };
    });
    expect(r.sep).not.toBeNull();
    expect(r.sep).toBeLessThan(3);
    expect(r.conjunction).toBe(true);
    // Default DSN-70m → Mars X-band budget closes with positive margin, so
    // the conjunction caps the verdict at "Marginal · conjunction".
    expect(r.margin).toBeGreaterThanOrEqual(0);
    expect(r.verdictText).toMatch(/conjunction/);
    expect(r.verdictCls).toBe('warn');
  });
});

test.describe('GreyNet — DS path enrichment (v0.8.0)', () => {
  test('dsPathBackToHome on the demo Mars relay returns linkIds and a total latency', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      window.confirm = () => true;
      loadDemoNetwork();
      const unit = state.deepSpaceUnits.find(u => u.label === 'Mars Relay-1')
        || state.deepSpaceUnits.find(u => dsPathBackToHome(u.id, state).reached !== 'none');
      const path = dsPathBackToHome(unit.id, state);
      return {
        reached: path.reached,
        linkIds: path.linkIds.length,
        totalLatencySec: path.totalLatencySec,
        hopKinds: path.hopNodes.map(n => n.kind),
      };
    });
    expect(r.reached).toBe('planet'); // handoff link ends on a ground station
    expect(r.linkIds).toBeGreaterThanOrEqual(1);
    // Route exists → cumulative light time is a number (0 is valid: the
    // unit→ground handoff hop contributes nothing at deep-space scale).
    expect(r.totalLatencySec).not.toBeNull();
    expect(Number.isFinite(r.totalLatencySec)).toBe(true);
    expect(r.hopKinds[0]).toBe('unit');
    expect(r.hopKinds[r.hopKinds.length - 1]).toBe('orbit-asset');
  });
});
