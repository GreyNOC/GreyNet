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

/* =========================================================================
   V1.0 REGRESSION TESTS
   Pins the v1.0 feature set:
     - validator coded findings (`findings` mirror)      (validator.js)
     - fixitFor one-click repairs + idempotency          (fixit.js)
     - Fix-it end-to-end via the warnings-tray ⚡ buttons (app.js + fixit.js)
     - in-app clipboard copy/paste across sites + views  (app.js)
     - arrow-key nudge (grid/fine step, history burst)   (app.js)
     - renderAll crash guard + fail-streak reset         (app.js)
     - typeOf ds_relay link/unit disambiguation          (app.js)
     - Ctrl+C copies instead of entering connect mode    (app.js)
   ========================================================================= */

test.describe('GreyNet v1.0 — validator coded findings', () => {
  test('empty graph emits coded err findings and per-section findings mirror blockers+warnings', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        devices: [], links: [], zones: [], sites: [], siteLinks: [],
        cities: [], endpoints: [], cityLinks: [],
        spaceAssets: [], spaceLinks: [], planetInfra: [],
        deepSpaceUnits: [], deepSpaceLinks: [],
      };
      const v = validateArchitectureGraph(s);
      const mirror = {};
      for (const sec of ['local', 'city', 'planet', 'orbit', 'deepspace']) {
        const st = v.sectionStatus[sec];
        mirror[sec] = {
          findings: st.findings.length,
          blockers: st.blockers.length,
          warnings: st.warnings.length,
          errFindings: st.findings.filter(f => f.severity === 'err').length,
          warnFindings: st.findings.filter(f => f.severity === 'warn').length,
        };
      }
      return {
        complete: v.complete,
        noSite: v.findings.find(f => f.code === 'local.no-site') || null,
        tooFew: v.findings.find(f => f.code === 'local.too-few-devices') || null,
        mirror,
      };
    });
    expect(r.complete).toBe(false);
    // Coded findings carry severity/msg and are tagged with their section
    // in the top-level roll-up.
    expect(r.noSite).not.toBeNull();
    expect(r.noSite.severity).toBe('err');
    expect(typeof r.noSite.msg).toBe('string');
    expect(r.noSite.msg.length).toBeGreaterThan(0);
    expect(r.noSite.section).toBe('local');
    expect(r.tooFew).not.toBeNull();
    expect(r.tooFew.severity).toBe('err');
    expect(r.tooFew.section).toBe('local');
    // err()/warn() feed blockers/warnings AND findings through one collector,
    // so the two views can never drift apart — in any section.
    for (const sec of ['local', 'city', 'planet', 'orbit', 'deepspace']) {
      const m = r.mirror[sec];
      expect(m.findings).toBe(m.blockers + m.warnings);
      expect(m.errFindings).toBe(m.blockers);
      expect(m.warnFindings).toBe(m.warnings);
    }
  });

  test('the demo network validates with zero err findings', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      window.confirm = () => true;
      loadDemoNetwork();
      const v = validateArchitectureGraph(state);
      return {
        errCodes: v.findings.filter(f => f.severity === 'err').map(f => `${f.section}:${f.code}`),
        complete: v.complete,
      };
    });
    expect(r.errCodes).toEqual([]);
    // Zero blockers anywhere ⇔ every section complete.
    expect(r.complete).toBe(true);
  });
});

test.describe('GreyNet v1.0 — fixitFor', () => {
  test('unknown codes and endpoint-less link fixes return null', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => ({
      unknown: fixitFor('nope.not-a-code', state),
      // global findings have no deterministic one-click repair
      globalPath: fixitFor('global.no-full-path', state),
      // link-only fix is withheld until BOTH endpoints exist
      uplinkNoAssets: fixitFor('orbit.no-uplink', { spaceAssets: [], spaceLinks: [] }),
    }));
    expect(r.unknown).toBeNull();
    expect(r.globalPath).toBeNull();
    expect(r.uplinkNoAssets).toBeNull();
  });

  test('local.too-few-devices fix clears the finding and re-applying adds nothing', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const s = {
        sites: [{ id: 's1', type: 'office', name: 'HQ', lat: 40.71, lng: -74.0, address: '', notes: '', color: '#b388eb' }],
        activeSiteId: 's1',
        devices: [], links: [], zones: [], siteLinks: [],
        cities: [], endpoints: [], cityLinks: [],
        spaceAssets: [], spaceLinks: [], planetInfra: [],
        deepSpaceUnits: [], deepSpaceLinks: [],
      };
      const foundBefore = validateArchitectureGraph(s).findings
        .some(f => f.code === 'local.too-few-devices');
      const fx = fixitFor('local.too-few-devices', s);
      if (!fx) return { fx: null };
      const shape = { label: fx.label, hasApply: typeof fx.apply === 'function' };
      const r1 = fx.apply({ state: s, uid, snap });
      const foundAfter = validateArchitectureGraph(s).findings
        .some(f => f.code === 'local.too-few-devices');
      const countAfterFirst = s.devices.length;
      const r2 = fx.apply({ state: s, uid, snap });   // double-apply
      return {
        fx: shape, foundBefore,
        ok1: r1.ok, foundAfter, countAfterFirst,
        ok2: r2.ok, countAfterSecond: s.devices.length,
        allInSite: s.devices.every(d => d.siteId === 's1'),
      };
    });
    expect(r.fx).toEqual({ label: 'Add starter devices', hasApply: true });
    expect(r.foundBefore).toBe(true);
    expect(r.ok1).toBe(true);
    // Re-running the validator no longer reports the repaired finding.
    expect(r.foundAfter).toBe(false);
    expect(r.countAfterFirst).toBe(3);
    // Idempotent: second apply succeeds but adds nothing.
    expect(r.ok2).toBe(true);
    expect(r.countAfterSecond).toBe(3);
    expect(r.allInSite).toBe(true);
  });
});

test.describe('GreyNet v1.0 — Fix-it end-to-end', () => {
  test('clicking the first ⚡ fix repeatedly converges an empty diagram to a complete architecture', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      window.confirm = () => true;
      // Boot defers openWalkthrough(0) by 200ms when no autosave exists;
      // that timer can fire AFTER freshLoad closed the overlay and its
      // dialog would then intercept the tray clicks below. Neutralize it.
      window.openWalkthrough = () => {};
      if (typeof closeWalkthrough === 'function') closeWalkthrough();
      newDiagram();
      // Unlock every section so the tray shows all layers' findings and
      // no progression gate interferes with the repairs.
      for (const sec of ['local', 'city', 'planet', 'orbit', 'deepspace']) {
        state.progression.unlocked[sec] = true;
      }
      renderAll();
    });
    // Deterministic cascade: severity-sorted tray puts blockers first, and
    // fixit withholds link fixes until their endpoints exist, so clicking
    // the FIRST button repeatedly must terminate. Cap at 25 as a fuse.
    for (let i = 0; i < 25; i++) {
      const n = await page.locator('.wfix').count();
      if (n === 0) break;
      await page.locator('.wfix').first().click();
    }
    const r = await page.evaluate(() => {
      const v = validateArchitectureGraph(state);
      const blockers = [];
      for (const [sec, st] of Object.entries(v.sectionStatus)) {
        for (const b of st.blockers) blockers.push(`[${sec}] ${b}`);
      }
      return { complete: v.complete, fullPathExists: v.fullPathExists, blockers };
    });
    expect(r.blockers).toEqual([]);   // list survivors on failure, not just a boolean
    expect(r.complete).toBe(true);
    expect(r.fullPathExists).toBe(true);
    // Nothing fixable remains.
    await expect(page.locator('.wfix')).toHaveCount(0);
  });
});

test.describe('GreyNet v1.0 — clipboard', () => {
  test('copy 2 linked devices in site A, paste into site B: fresh ids, relinked, originals untouched', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.sites = [
        { id: 's1', type: 'office', name: 'A', lat: 40, lng: -74, address: '', notes: '', color: '#5fb3ff' },
        { id: 's2', type: 'office', name: 'B', lat: 50, lng: 10, address: '', notes: '', color: '#5fb3ff' },
      ];
      state.activeSiteId = 's1';
      state.devices = [
        { id: 'd1', type: 'router', x: 100, y: 100, label: 'CopyA', props: {}, siteId: 's1' },
        { id: 'd2', type: 'server', x: 300, y: 100, label: 'CopyB', props: {}, siteId: 's1' },
      ];
      state.links = [{ id: 'l1', fromId: 'd1', toId: 'd2', type: 'ethernet', label: '' }];
      state.selectedIds = new Set(['d1', 'd2']);   // devices only — link is auto-captured
      copySelection();
      setActiveSite('s2');
      pasteClipboard();
      const newDevices = state.devices.filter(d => d.id !== 'd1' && d.id !== 'd2');
      const newLinks = state.links.filter(l => l.id !== 'l1');
      const orig1 = state.devices.find(d => d.id === 'd1');
      const origLink = state.links.find(l => l.id === 'l1');
      const copyA = newDevices.find(d => d.label === 'CopyA');
      return {
        deviceCount: state.devices.length,
        linkCount: state.links.length,
        newDeviceSites: newDevices.map(d => d.siteId),
        newIds: newDevices.map(d => d.id),
        newLink: newLinks[0] ? { fromId: newLinks[0].fromId, toId: newLinks[0].toId, type: newLinks[0].type } : null,
        orig1: { siteId: orig1.siteId, x: orig1.x, y: orig1.y },
        origLink: { fromId: origLink.fromId, toId: origLink.toId },
        copyAX: copyA ? copyA.x : null,
        selectedCount: state.selectedIds.size,
      };
    });
    expect(r.deviceCount).toBe(4);
    expect(r.linkCount).toBe(2);
    // Both pasted devices land in the NOW-active site B with fresh ids.
    expect(r.newDeviceSites).toEqual(['s2', 's2']);
    expect(r.newIds).not.toContain('d1');
    expect(r.newIds).not.toContain('d2');
    // Exactly one new link, wired between the NEW ids.
    expect(r.newLink).not.toBeNull();
    expect(r.newIds).toContain(r.newLink.fromId);
    expect(r.newIds).toContain(r.newLink.toId);
    expect(r.newLink.fromId).not.toBe(r.newLink.toId);
    expect(r.newLink.type).toBe('ethernet');
    // Originals stay exactly where they were, in site A.
    expect(r.orig1).toEqual({ siteId: 's1', x: 100, y: 100 });
    expect(r.origLink).toEqual({ fromId: 'd1', toId: 'd2' });
    expect(r.copyAX).toBe(130); // +30 paste offset
    // Paste selects what it created: 2 devices + 1 link.
    expect(r.selectedCount).toBe(3);
  });

  test('paste in space view with a device-only clipboard toasts and mutates nothing', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.devices = [{ id: 'd1', type: 'router', x: 100, y: 100, label: 'R1', props: {}, siteId: state.activeSiteId }];
      state.links = [];
      state.selectedIds = new Set(['d1']);
      copySelection();
      state.viewMode = 'space';
      const toasts = [];
      const origToast = window.toast;
      window.toast = (msg, opts) => { toasts.push({ msg: String(msg), variant: opts && opts.variant }); };
      const before = {
        devices: state.devices.length,
        spaceAssets: state.spaceAssets.length,
        links: state.links.length,
        past: history.past.length,
        future: history.future.length,
      };
      pasteClipboard();
      const after = {
        devices: state.devices.length,
        spaceAssets: state.spaceAssets.length,
        links: state.links.length,
        past: history.past.length,
        future: history.future.length,
      };
      window.toast = origToast;
      state.viewMode = 'local';
      return { toasts, before, after };
    });
    // The mismatch is reported through the toast path…
    expect(r.toasts.length).toBe(1);
    expect(r.toasts[0].msg).toMatch(/nothing for this view/i);
    expect(r.toasts[0].variant).toBe('warn');
    // …and the early return happens BEFORE pushHistory: no mutation, no
    // history entry, no cleared redo stack.
    expect(r.after).toEqual(r.before);
  });
});

test.describe('GreyNet v1.0 — arrow-key nudge', () => {
  test('grid + fine steps share one history entry per burst; empty selection is a no-op', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      const d = { id: 'nd1', type: 'router', x: 200, y: 200, label: 'N1', props: {}, siteId: state.activeSiteId };
      state.devices.push(d);
      state.viewMode = 'local';
      state.selectedIds = new Set(['nd1']);
      const grid = state.gridSize;
      const before = history.past.length;
      const r1 = nudgeSelection(1, 0, false);   // grid step
      const r2 = nudgeSelection(0, 1, true);    // fine (Shift) step, same burst
      const grew = history.past.length - before;
      const x = d.x, y = d.y;
      // Empty selection: false, and nothing pushed.
      state.selectedIds = new Set();
      const before2 = history.past.length;
      const r3 = nudgeSelection(1, 0, false);
      return {
        grid, r1, r2, grew, x, y,
        r3, grew2: history.past.length - before2,
        moved: { x: d.x, y: d.y },
      };
    });
    expect(r.grid).toBe(20);            // default gridSize
    expect(r.r1).toBe(true);
    expect(r.r2).toBe(true);
    expect(r.x).toBe(200 + r.grid);     // arrow = one grid step
    expect(r.y).toBe(200 + 1);          // shift+arrow = 1px fine step
    expect(r.grew).toBe(1);             // two rapid nudges → ONE history entry
    expect(r.r3).toBe(false);
    expect(r.grew2).toBe(0);
    expect(r.moved).toEqual({ x: r.x, y: r.y }); // no-op really moved nothing
  });
});

test.describe('GreyNet v1.0 — renderAll crash guard', () => {
  test('a throwing renderer never escapes renderAll; recovery resets the fail streak', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => {
      state.viewMode = 'local';
      state.devices.push({ id: 'cg1', type: 'router', x: 100, y: 100, label: 'CG', props: {}, siteId: state.activeSiteId });
      renderAll();   // healthy baseline
      const baselineChildren = dom.devicesLayer.childElementCount;
      const orig = window.renderDevices;
      window.renderDevices = () => { throw new Error('boom (regression test)'); };
      let threw = false;
      try { renderAll(); } catch (_) { threw = true; }
      const stateIntact = state.devices.some(d => d.id === 'cg1');
      // A single failure must never offer the reload modal (threshold is 3).
      const modalAfterOne = !!document.querySelector('.greynet-modal-overlay');
      // Restore → renderAll recovers…
      window.renderDevices = orig;
      renderAll();
      const recoveredChildren = dom.devicesLayer.childElementCount;
      // …and the streak reset is observable: two MORE consecutive failures
      // after the recovery still total < 3, so no reload modal may appear.
      // (Without the reset these would be failures #2 and #3.)
      window.renderDevices = () => { throw new Error('boom again (regression test)'); };
      renderAll();
      renderAll();
      const modalAfterTwoMore = !!document.querySelector('.greynet-modal-overlay');
      window.renderDevices = orig;
      renderAll();
      return { baselineChildren, threw, stateIntact, modalAfterOne, recoveredChildren, modalAfterTwoMore };
    });
    expect(r.baselineChildren).toBeGreaterThan(0);
    expect(r.threw).toBe(false);          // the guard swallows the throw
    expect(r.stateIntact).toBe(true);     // state untouched by the crash
    expect(r.modalAfterOne).toBe(false);
    expect(r.recoveredChildren).toBeGreaterThan(0); // devices render again
    expect(r.modalAfterTwoMore).toBe(false);        // streak was reset to 0
  });
});

test.describe('GreyNet v1.0 — typeOf ds_relay disambiguation', () => {
  test('ds_relay resolves by shape: fromId/toId → deeplink, x/y → deepunit', async ({ page }) => {
    await freshLoad(page);
    const r = await page.evaluate(() => ({
      // 'ds_relay' exists in BOTH DEEP_SPACE_LINK_TYPES and
      // DEEP_SPACE_UNIT_TYPES — only the endpoint ids disambiguate.
      relayLink: typeOf({ id: 'x', type: 'ds_relay', fromId: 'a', toId: 'b' }),
      relayUnit: typeOf({ id: 'x', type: 'ds_relay', x: 10, y: 20 }),
    }));
    expect(r.relayLink).toBe('deeplink');
    expect(r.relayUnit).toBe('deepunit');
  });
});

test.describe('GreyNet v1.0 — Ctrl+C copies instead of entering connect mode', () => {
  test('with a device selected, Ctrl+C keeps mode "select" and fills the clipboard', async ({ page }) => {
    await freshLoad(page);
    await page.evaluate(() => {
      state.devices.push({ id: 'cc1', type: 'router', x: 100, y: 100, label: 'CC', props: {}, siteId: state.activeSiteId });
      state.selectedIds = new Set(['cc1']);
      renderAll();
    });
    // Sanity: the bare "c" tool shortcut still enters connect mode…
    await page.keyboard.press('c');
    expect(await page.evaluate(() => state.mode)).toBe('connect');
    await page.evaluate(() => setMode('select'));
    // …but Ctrl+C must be intercepted BEFORE the tool-mode keys.
    await page.keyboard.press('Control+c');
    const r = await page.evaluate(() => {
      const mode = state.mode;
      const before = state.devices.length;
      pasteClipboard();   // proves copySelection actually captured the device
      return { mode, before, after: state.devices.length };
    });
    expect(r.mode).toBe('select');
    expect(r.after).toBe(r.before + 1);
  });
});
