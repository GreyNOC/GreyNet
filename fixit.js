"use strict";

/* =========================================================================
   GREYNET — FIXIT (one-click validator repairs)

   Maps validator finding codes (see validator.js) to deterministic,
   idempotent repairs.

   Public surface:
     fixitFor(code, state) → null | { label, apply(ctx) }

   - `label` is a short imperative ("Add a ground station").
   - `apply(ctx)` mutates ctx.state through plain pushes/edits ONLY and
     returns { ok, note }. ctx = { state, uid, snap }. The CALLER owns
     pushHistory / renderAll / toast — they are never called from here.
   - Every apply validates its prerequisites first ({ ok:false, note }
     when they're absent) and checks for existing equivalents, so
     re-running a fix never duplicates objects.
   - Codes with no deterministic repair return null. fixitFor also
     returns null for link-only fixes (orbit uplink, DS handoff) when
     either endpoint is missing, so the user fixes prerequisites first.
   ========================================================================= */

(function (root) {

  // `const`-declared top-level identifiers in constants.js don't attach to
  // window. See orbit-metrics.js for why we grab them via `new Function`.
  const _cache = {};
  function _g(name) {
    if (_cache[name] !== undefined) return _cache[name];
    // CSP-safe path: constants.js / app.js now attach these tables to window.
    // Fall back to the eval shim only if a name isn't exported (it will just
    // return null under the app's no-'unsafe-eval' CSP — same as before).
    let v = (root && root[name] != null) ? root[name] : null;
    if (v === null) {
      try { /* eslint-disable-next-line no-new-func */
        v = (new Function('try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : null; } catch (_) { return null; }'))();
      } catch (_) { v = null; }
    }
    _cache[name] = v;
    return v;
  }

  // ---- shared tables (must mirror validator.js) ---------------------------

  // Same set _checkCity uses for "city infrastructure endpoint".
  const CITY_INFRA_TYPES = new Set([
    'trafficsignal', 'trafficcam', 'vehiclesensor', 'messagesign',
    'cabinet', 'streetlight', 'fiberjunction',
  ]);
  // Same set _checkLocal uses for "edge/security/core device".
  const EDGE_DEVICE_TYPES = new Set(['firewall', 'router', 'l3switch', 'ids', 'waf', 'vpn']);
  // Same set _checkOrbit uses for ground↔orbit link kinds.
  const UPLINK_KINDS = new Set(['uplink', 'downlink', 'feeder']);

  // ---- small helpers ------------------------------------------------------

  function _activeSite(state) {
    const sites = state.sites || [];
    return (state.activeSiteId && sites.find(s => s.id === state.activeSiteId)) || sites[0] || null;
  }
  function _activeCity(state) {
    const cities = state.cities || [];
    return (state.activeCityId && cities.find(c => c.id === state.activeCityId)) || cities[0] || null;
  }
  function _snapOf(ctx) {
    return typeof ctx.snap === 'function' ? ctx.snap : (v => Math.round(v));
  }
  function _defaultProps(tableName, key) {
    const t = _g(tableName) || {};
    const def = t[key] || {};
    return Object.assign({}, def.defaultProps || {});
  }
  function _typeLabel(tableName, key, fallback) {
    const t = _g(tableName) || {};
    return (t[key] && t[key].label) || fallback || key;
  }
  function _uniqueLabel(base, taken) {
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(base + ' ' + n)) n++;
    return base + ' ' + n;
  }
  function _pairExists(list, aKey, bKey, id1, id2) {
    return (list || []).some(l =>
      (l[aKey] === id1 && l[bKey] === id2) || (l[aKey] === id2 && l[bKey] === id1));
  }
  // Same math as validator.js's _haversineKm.
  function _haversineKm(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
    const toRad = x => x * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function _epDistance(a, b) {
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      return _haversineKm(a, b);
    }
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  // ---- LOCAL --------------------------------------------------------------

  // local.no-site / planet.no-sites — same default the app's
  // ensureDefaultSite() pushes.
  function _applyAddDefaultSite(ctx) {
    const s = ctx.state;
    s.sites = s.sites || [];
    if (s.sites.length > 0) {
      return { ok: true, note: 'A site already exists — nothing to add.' };
    }
    const SITE = _g('SITE_TYPES') || {};
    const id = ctx.uid();
    s.sites.push({
      id, type: 'office', name: 'HQ',
      lat: 40.71, lng: -74.00, address: '', notes: '',
      color: (SITE.office && SITE.office.color) || '#b388eb',
    });
    if (!s.activeSiteId) s.activeSiteId = id;
    return { ok: true, note: 'Added default office site "HQ".' };
  }

  // local.too-few-devices
  function _applyStarterDevices(ctx) {
    const s = ctx.state;
    s.devices = s.devices || [];
    const site = _activeSite(s);
    if (!site) return { ok: false, note: 'No site exists — add a site first.' };
    const inSite = s.devices.filter(d => d.siteId === site.id);
    const need = 3 - inSite.length;
    if (need <= 0) return { ok: true, note: 'Active site already has 3+ devices — nothing to add.' };
    const snap = _snapOf(ctx);
    const have = new Set(inSite.map(d => d.type));
    const order = ['router', 'switch', 'workstation'];
    // Fill missing roles first, then repeat down the list.
    const picks = order.filter(t => !have.has(t)).concat(order.filter(t => have.has(t)));
    const taken = new Set(s.devices.map(d => d.label));
    const added = [];
    for (let i = 0; i < need; i++) {
      const type = picks[i % picks.length];
      const label = _uniqueLabel(_typeLabel('DEVICE_TYPES', type), taken);
      taken.add(label);
      s.devices.push({
        id: ctx.uid(), type,
        x: snap(200 + i * 160), y: snap(200),   // neat row, x 200..600
        label,
        props: _defaultProps('DEVICE_TYPES', type),
        siteId: site.id,
      });
      added.push(label);
    }
    return { ok: true, note: `Added ${added.length} device(s): ${added.join(', ')}.` };
  }

  // local.no-links / local.all-unconnected — chain via nearest neighbor,
  // seeded from the most "core" device (router→switch→others).
  function _applyWireDevices(ctx) {
    const s = ctx.state;
    s.links = s.links || [];
    const site = _activeSite(s);
    if (!site) return { ok: false, note: 'No site exists — add a site first.' };
    const devs = (s.devices || []).filter(d => d.siteId === site.id);
    if (devs.length < 2) {
      return { ok: false, note: 'Need at least 2 devices in the active site — add devices first.' };
    }
    const byId = new Map(devs.map(d => [d.id, d]));
    const linked = new Set();
    for (const l of s.links) {
      if (byId.has(l.fromId) && byId.has(l.toId)) { linked.add(l.fromId); linked.add(l.toId); }
    }
    if (linked.size === 0) {
      const pref = ['router', 'l3switch', 'firewall', 'switch'];
      let seed = null;
      for (const p of pref) { seed = devs.find(d => d.type === p); if (seed) break; }
      linked.add((seed || devs[0]).id);
    }
    let added = 0;
    let unlinked = devs.filter(d => !linked.has(d.id));
    while (unlinked.length > 0) {
      // O(n²) nearest-neighbor: attach the unlinked device closest to any
      // already-linked one.
      let best = null;
      for (const u of unlinked) {
        for (const vId of linked) {
          const v = byId.get(vId);
          const dd = ((u.x || 0) - (v.x || 0)) ** 2 + ((u.y || 0) - (v.y || 0)) ** 2;
          if (!best || dd < best.dd) best = { u, v, dd };
        }
      }
      if (!_pairExists(s.links, 'fromId', 'toId', best.v.id, best.u.id)) {
        s.links.push({ id: ctx.uid(), fromId: best.v.id, toId: best.u.id, type: 'ethernet', label: '' });
        added++;
      }
      linked.add(best.u.id);
      unlinked = unlinked.filter(d => d.id !== best.u.id);
    }
    if (added === 0) return { ok: true, note: 'Devices are already wired — nothing to add.' };
    return { ok: true, note: `Wired ${added} link(s) through the active site.` };
  }

  // local.no-edge-device
  function _applyAddEdgeFirewall(ctx) {
    const s = ctx.state;
    s.devices = s.devices || [];
    const site = _activeSite(s);
    if (!site) return { ok: false, note: 'No site exists — add a site first.' };
    const inSite = s.devices.filter(d => d.siteId === site.id);
    if (inSite.some(d => EDGE_DEVICE_TYPES.has(d.type))) {
      return { ok: true, note: 'Active site already has an edge/security/core device — nothing to add.' };
    }
    const snap = _snapOf(ctx);
    let x = 200, y = 200;
    if (inSite.length) {
      x = inSite.reduce((acc, d) => acc + (d.x || 0), 0) / inSite.length;
      y = Math.min(...inSite.map(d => d.y || 0)) - 100;   // just above the devices
    }
    const taken = new Set(s.devices.map(d => d.label));
    s.devices.push({
      id: ctx.uid(), type: 'firewall',
      x: snap(x), y: snap(y),
      label: _uniqueLabel('Edge FW', taken),
      props: _defaultProps('DEVICE_TYPES', 'firewall'),
      siteId: site.id,
    });
    return { ok: true, note: 'Added "Edge FW" firewall to the active site.' };
  }

  // ---- CITY ---------------------------------------------------------------

  // city.no-city — same shape ensureDefaultCity() pushes in app.js.
  function _applyAddDefaultCity(ctx) {
    const s = ctx.state;
    s.cities = s.cities || [];
    if (s.cities.length > 0) return { ok: true, note: 'A city already exists — nothing to add.' };
    const id = ctx.uid();
    s.cities.push({
      id, name: 'Default City',
      centerLat: 40.71, centerLng: -74.00, mapW: 2000, mapH: 1400,
      mapBackend: 'osm', imageUrl: '', notes: '',
    });
    if (!s.activeCityId) s.activeCityId = id;
    return { ok: true, note: 'Added "Default City".' };
  }

  // city.no-endpoint
  function _applyAddCityCabinet(ctx) {
    const s = ctx.state;
    s.endpoints = s.endpoints || [];
    const city = _activeCity(s);
    if (!city) return { ok: false, note: 'No city exists — create a city first.' };
    // The validator counts infra endpoints across all cities.
    if (s.endpoints.some(ep => CITY_INFRA_TYPES.has(ep.type))) {
      return { ok: true, note: 'A city infrastructure endpoint already exists — nothing to add.' };
    }
    const snap = _snapOf(ctx);
    const taken = new Set(s.endpoints.map(ep => ep.label));
    s.endpoints.push({
      id: ctx.uid(), type: 'cabinet',
      label: _uniqueLabel(_typeLabel('ENDPOINT_TYPES', 'cabinet', 'Roadside Cabinet'), taken),
      x: snap((city.mapW || 2000) / 2), y: snap((city.mapH || 1400) / 2),   // mid-map
      lat: city.centerLat != null ? city.centerLat : null,
      lng: city.centerLng != null ? city.centerLng : null,
      cityId: city.id, siteId: null,
      props: _defaultProps('ENDPOINT_TYPES', 'cabinet'),
    });
    return { ok: true, note: 'Added a roadside cabinet at the city center.' };
  }

  // city.site-not-placed — mirrors createCitySiteEndpoint() in app.js
  // (type "building", label = site name, props.notes back-reference).
  function _applyPlaceSiteOnCity(ctx) {
    const s = ctx.state;
    s.endpoints = s.endpoints || [];
    const site = _activeSite(s);
    if (!site) return { ok: false, note: 'No site exists — add a site first.' };
    const city = _activeCity(s);
    if (!city) return { ok: false, note: 'No city exists — create a city first.' };
    const siteIds = new Set((s.sites || []).map(x => x.id));
    if (s.endpoints.some(ep => ep.siteId && siteIds.has(ep.siteId))) {
      return { ok: true, note: 'A site is already placed on a city map — nothing to add.' };
    }
    const snap = _snapOf(ctx);
    // Offset from the city center so it doesn't sit on top of city infra.
    s.endpoints.push({
      id: ctx.uid(), type: 'building', label: site.name,
      x: snap((city.mapW || 2000) / 2 - 200), y: snap((city.mapH || 1400) / 2 - 120),
      lat: city.centerLat != null ? city.centerLat + 0.004 : null,
      lng: city.centerLng != null ? city.centerLng - 0.004 : null,
      cityId: city.id, siteId: site.id,
      props: { address: site.address || '', ip: '', notes: `Linked local site: ${site.name}` },
    });
    return { ok: true, note: `Placed site "${site.name}" onto the city map.` };
  }

  // city.no-citylink / city.site-unlinked — link the placed site endpoint
  // to the nearest infrastructure endpoint with buried fiber.
  function _applyLinkSiteToInfra(ctx) {
    const s = ctx.state;
    s.cityLinks = s.cityLinks || [];
    const endpoints = s.endpoints || [];
    const siteIds = new Set((s.sites || []).map(x => x.id));
    const placements = endpoints.filter(ep => ep.siteId && siteIds.has(ep.siteId));
    const infra = endpoints.filter(ep => CITY_INFRA_TYPES.has(ep.type));
    if (placements.length === 0) {
      return { ok: false, note: 'No placed site endpoint — place a site on the city map first.' };
    }
    if (infra.length === 0) {
      return { ok: false, note: 'No city infrastructure endpoint — add one first.' };
    }
    // Already connected the way the validator counts?
    const epById = new Map(endpoints.map(ep => [ep.id, ep]));
    const connected = s.cityLinks.some(cl => {
      const a = epById.get(cl.fromEpId), b = epById.get(cl.toEpId);
      if (!a || !b) return false;
      return (!!a.siteId && CITY_INFRA_TYPES.has(b.type)) ||
             (!!b.siteId && CITY_INFRA_TYPES.has(a.type));
    });
    if (connected) return { ok: true, note: 'Site and city infra are already linked — nothing to add.' };
    // Prefer the active city's placement; nearest infra, same city preferred.
    const city = _activeCity(s);
    const sp = (city && placements.find(ep => ep.cityId === city.id)) || placements[0];
    const pool = infra.filter(ep => ep.cityId === sp.cityId);
    const candidates = pool.length ? pool : infra;
    let best = null;
    for (const inf of candidates) {
      const d = _epDistance(sp, inf);
      if (!best || d < best.d) best = { inf, d };
    }
    if (_pairExists(s.cityLinks, 'fromEpId', 'toEpId', sp.id, best.inf.id)) {
      return { ok: true, note: 'A link between the site and that endpoint already exists.' };
    }
    s.cityLinks.push({
      id: ctx.uid(), fromEpId: sp.id, toEpId: best.inf.id,
      type: 'fiber_buried', label: '', length: '',
    });
    return { ok: true, note: `Linked "${sp.label}" to "${best.inf.label}" with buried fiber.` };
  }

  // ---- PLANET -------------------------------------------------------------

  // planet.too-few-nodes — a global_dc infra node is the smallest change
  // that satisfies "≥2 planet nodes" without inventing a second site the
  // user would then have to design.
  function _applyAddGlobalDc(ctx) {
    const s = ctx.state;
    s.planetInfra = s.planetInfra || [];
    const sites = s.sites || [];
    const nodes = sites.length + s.planetInfra.length;
    if (nodes >= 2 || (sites.length >= 1 && s.planetInfra.length >= 1)) {
      return { ok: true, note: 'Planet layer already has enough nodes — nothing to add.' };
    }
    if (sites.length === 0) {
      return { ok: false, note: 'No site exists — add a site first (an infra node alone does not satisfy the planet check).' };
    }
    s.planetInfra.push({
      id: ctx.uid(), type: 'global_dc', label: 'Global DC',
      lat: 50, lng: 10,
      props: _defaultProps('PLANET_INFRA_TYPES', 'global_dc'),
    });
    return { ok: true, note: 'Added "Global DC" global data center (lat 50, lng 10).' };
  }

  // planet.no-links — the validator's canonical "valid link" is
  // siteLinks.length ≥ 1 (site↔site), so we add a WAN site link between
  // the two nearest sites. (Site↔infra only clears via a <500 km
  // proximity heuristic, which is not something a link fix can add.)
  // With a single site there is nothing to link TO — a fix that always
  // fails would strand the user (and starve the fixes queued behind it),
  // so in that case the fix CREATES a DR site and links to it.
  function _applyAddSiteLink(ctx) {
    const s = ctx.state;
    s.siteLinks = s.siteLinks || [];
    if (s.siteLinks.length >= 1) {
      return { ok: true, note: 'A site link already exists — nothing to add.' };
    }
    const sites = s.sites || [];
    if (sites.length === 0) {
      return { ok: false, note: 'No sites exist yet — add a site first.' };
    }
    if (sites.length === 1) {
      const a = sites[0];
      const types = _g('SITE_TYPES') || {};
      const dr = {
        id: ctx.uid(), type: 'datacenter', name: `${a.name || 'HQ'} DR`,
        lat: Math.max(-85, Math.min(85, (a.lat || 0) - 8)),
        lng: (((a.lng || 0) + 15 + 540) % 360) - 180,
        address: '', notes: 'Disaster-recovery site (added by Fix-it)',
        color: types.datacenter ? types.datacenter.color : '#5fb3ff',
      };
      s.sites.push(dr);
      s.siteLinks.push({
        id: ctx.uid(), fromSiteId: a.id, toSiteId: dr.id,
        type: 'wan', bandwidth: '', sla: '', label: '',
      });
      return { ok: true, note: `Added DR site "${dr.name}" and linked it to "${a.name}" over WAN.` };
    }
    let best = null;
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        if (_pairExists(s.siteLinks, 'fromSiteId', 'toSiteId', sites[i].id, sites[j].id)) continue;
        const d = _haversineKm(sites[i], sites[j]);
        if (!best || d < best.d) best = { a: sites[i], b: sites[j], d };
      }
    }
    if (!best) return { ok: true, note: 'All site pairs are already linked.' };
    s.siteLinks.push({
      id: ctx.uid(), fromSiteId: best.a.id, toSiteId: best.b.id,
      type: 'wan', bandwidth: '', sla: '', label: '',
    });
    return { ok: true, note: `Linked "${best.a.name}" and "${best.b.name}" with a WAN site link.` };
  }

  // ---- ORBIT --------------------------------------------------------------

  // orbit.no-ground
  function _applyAddGroundStation(ctx) {
    const s = ctx.state;
    s.spaceAssets = s.spaceAssets || [];
    const hasGround = s.spaceAssets.some(a => a.type === 'ground_station') ||
                      (s.planetInfra || []).some(p => p.type === 'ground_uplink');
    if (hasGround) return { ok: true, note: 'A ground anchor already exists — nothing to add.' };
    const taken = new Set(s.spaceAssets.map(a => a.label));
    s.spaceAssets.push({
      id: ctx.uid(), type: 'ground_station',
      label: _uniqueLabel('GS Main', taken),
      angle: Math.PI / 2, orbit: 'ground', props: {},
    });
    return { ok: true, note: 'Added ground station "GS Main".' };
  }

  // orbit.no-orbiter
  function _applyAddLeoSat(ctx) {
    const s = ctx.state;
    s.spaceAssets = s.spaceAssets || [];
    if (s.spaceAssets.some(a => a.type !== 'ground_station')) {
      return { ok: true, note: 'An orbital asset already exists — nothing to add.' };
    }
    const taken = new Set(s.spaceAssets.map(a => a.label));
    s.spaceAssets.push({
      id: ctx.uid(), type: 'satellite_leo',
      label: _uniqueLabel('LEO-1', taken),
      angle: 0.5, orbit: 'leo', props: {},
    });
    return { ok: true, note: 'Added LEO satellite "LEO-1".' };
  }

  // orbit.no-uplink / orbit.uplink-not-crossing
  function _orbitEnds(state) {
    const assets = state.spaceAssets || [];
    return {
      grounds:  assets.filter(a => a.type === 'ground_station'),
      orbiters: assets.filter(a => a.type !== 'ground_station'),
    };
  }
  function _hasValidUplink(state) {
    const assets = state.spaceAssets || [];
    const byId = new Map(assets.map(a => [a.id, a]));
    return (state.spaceLinks || []).some(l => {
      if (!UPLINK_KINDS.has(l.type)) return false;
      const a = byId.get(l.fromAssetId), b = byId.get(l.toAssetId);
      if (!a || !b) return false;
      return (a.type === 'ground_station') !== (b.type === 'ground_station');
    });
  }
  function _applyAddUplink(ctx) {
    const s = ctx.state;
    s.spaceLinks = s.spaceLinks || [];
    const { grounds, orbiters } = _orbitEnds(s);
    if (grounds.length === 0)  return { ok: false, note: 'No ground station — add one first.' };
    if (orbiters.length === 0) return { ok: false, note: 'No orbital asset — add a satellite first.' };
    if (_hasValidUplink(s)) {
      return { ok: true, note: 'A valid ground↔orbit uplink already exists — nothing to add.' };
    }
    // Nearest pair by angular separation (small altitude tie-break so lower
    // orbits win), skipping pairs that already carry a link of another type.
    const alts = _g('ORBIT_ALTITUDES') || {};
    let best = null;
    for (const g of grounds) {
      for (const o of orbiters) {
        if (_pairExists(s.spaceLinks, 'fromAssetId', 'toAssetId', g.id, o.id)) continue;
        let da = Math.abs((g.angle || 0) - (o.angle || 0)) % (2 * Math.PI);
        if (da > Math.PI) da = 2 * Math.PI - da;
        const altKm = (alts[o.orbit] && alts[o.orbit].km) || 550;
        const score = da + altKm / 1e6;
        if (!best || score < best.score) best = { g, o, score };
      }
    }
    if (!best) {
      return { ok: false, note: 'Every ground↔orbit pair already has a link of another type — retype one of them to Uplink.' };
    }
    s.spaceLinks.push({
      id: ctx.uid(), fromAssetId: best.g.id, toAssetId: best.o.id,
      type: 'uplink', label: '',
    });
    return { ok: true, note: `Linked "${best.g.label}" and "${best.o.label}" with a ground uplink.` };
  }

  // ---- DEEP SPACE ---------------------------------------------------------

  // deepspace.no-unit — ds_relay is the real relay key in
  // DEEP_SPACE_UNIT_TYPES ("Deep-Space Relay").
  function _applyAddDsRelay(ctx) {
    const s = ctx.state;
    s.deepSpaceUnits = s.deepSpaceUnits || [];
    if (s.deepSpaceUnits.length > 0) {
      return { ok: true, note: 'A deep-space unit already exists — nothing to add.' };
    }
    const def = (_g('DEEP_SPACE_UNIT_TYPES') || {}).ds_relay || {};
    const stats = def.stats || {};
    const targets = _g('DS_TARGETS') || {};
    s.deepSpaceUnits.push({
      id: ctx.uid(), type: 'ds_relay', label: 'Relay-1',
      x: 0, y: 0,
      anchor: targets.mars ? 'mars' : null, anchorOffX: 60, anchorOffY: -60,
      props: {   // same props shape app.js builds when placing a DS unit
        range:     stats.range_au ? `${stats.range_au} AU` : '',
        bandwidth: stats.bandwidth || '',
        power:     stats.power_w ? `${stats.power_w} W` : '',
        security:  stats.security || '',
        notes: '',
      },
    });
    return { ok: true, note: 'Added deep-space relay "Relay-1" anchored to Mars.' };
  }

  // deepspace.no-handoff — ds_dsn is the DSN-downlink key in
  // DEEP_SPACE_LINK_TYPES ("DSN Downlink"). Cross-domain: DS unit → orbit
  // ground station, which is exactly what _checkDeepSpace counts.
  function _applyAddHandoff(ctx) {
    const s = ctx.state;
    s.deepSpaceLinks = s.deepSpaceLinks || [];
    const units = s.deepSpaceUnits || [];
    const grounds = (s.spaceAssets || []).filter(a => a.type === 'ground_station');
    if (units.length === 0)   return { ok: false, note: 'No deep-space unit — add one first.' };
    if (grounds.length === 0) return { ok: false, note: 'No orbit ground station — add one first.' };
    // Already handed off the way the validator counts (any DS↔orbit link)?
    const dsIds = new Set(units.map(u => u.id));
    const orbitIds = new Set((s.spaceAssets || []).map(a => a.id));
    const has = s.deepSpaceLinks.some(l =>
      (dsIds.has(l.fromId) && orbitIds.has(l.toId)) ||
      (dsIds.has(l.toId) && orbitIds.has(l.fromId)));
    if (has) return { ok: true, note: 'A DS-to-orbit handoff already exists — nothing to add.' };
    const u = units[0], g = grounds[0];
    if (_pairExists(s.deepSpaceLinks, 'fromId', 'toId', u.id, g.id)) {
      return { ok: true, note: 'That handoff link already exists.' };
    }
    s.deepSpaceLinks.push({ id: ctx.uid(), fromId: u.id, toId: g.id, type: 'ds_dsn', label: '' });
    return { ok: true, note: `Linked "${u.label || 'DS unit'}" to "${g.label || 'ground station'}" with a DSN downlink.` };
  }

  // ---- registry -----------------------------------------------------------

  // Link-only fixes return null from fixitFor when an endpoint is missing,
  // so the UI steers the user to the prerequisite fixes first. apply()
  // still re-validates in case state changed between fixitFor and apply.
  function _uplinkFix(state) {
    const { grounds, orbiters } = _orbitEnds(state);
    if (grounds.length === 0 || orbiters.length === 0) return null;
    return { label: 'Link ground to satellite', apply: _applyAddUplink };
  }
  function _handoffFix(state) {
    const units = state.deepSpaceUnits || [];
    const grounds = (state.spaceAssets || []).filter(a => a.type === 'ground_station');
    if (units.length === 0 || grounds.length === 0) return null;
    return { label: 'Link relay to ground station', apply: _applyAddHandoff };
  }

  // A fix is only OFFERED when its apply can deterministically succeed —
  // a button that predictably fails burns the user's trust (and, before the
  // caller-side guard, an undo step). Prereq-gated factories return null.
  function _wireDevicesFix(state) {
    const s = state || {};
    const devs = (s.devices || []).filter(d => !s.activeSiteId || !d.siteId || d.siteId === s.activeSiteId);
    if (devs.length < 2) return null; // nothing to wire yet — fix devices first
    return { label: 'Wire devices together', apply: _applyWireDevices };
  }
  function _linkSiteToInfraFix(state) {
    const s = state || {};
    const eps = (s.endpoints || []).filter(ep => ep.cityId === s.activeCityId);
    const hasPlacedSite = eps.some(ep => ep.siteId);
    const hasInfra = eps.some(ep => !ep.siteId);
    if (!hasPlacedSite || !hasInfra) return null; // place-site / add-cabinet fixes come first
    return { label: 'Link site to city infra', apply: _applyLinkSiteToInfra };
  }

  const FIXES = {
    'local.no-site':             () => ({ label: 'Add a default site',       apply: _applyAddDefaultSite }),
    'local.too-few-devices':     () => ({ label: 'Add starter devices',      apply: _applyStarterDevices }),
    'local.no-links':            (state) => _wireDevicesFix(state),
    'local.all-unconnected':     (state) => _wireDevicesFix(state),
    'local.no-edge-device':      () => ({ label: 'Add an edge firewall',     apply: _applyAddEdgeFirewall }),
    'city.no-city':              () => ({ label: 'Create a default city',    apply: _applyAddDefaultCity }),
    'city.no-endpoint':          () => ({ label: 'Add a roadside cabinet',   apply: _applyAddCityCabinet }),
    'city.site-not-placed':      () => ({ label: 'Place site on city map',   apply: _applyPlaceSiteOnCity }),
    'city.no-citylink':          (state) => _linkSiteToInfraFix(state),
    'city.site-unlinked':        (state) => _linkSiteToInfraFix(state),
    'planet.no-sites':           () => ({ label: 'Add a default site',       apply: _applyAddDefaultSite }),
    'planet.too-few-nodes':      () => ({ label: 'Add a global data center', apply: _applyAddGlobalDc }),
    'planet.no-links':           (state) => {
      const sites = ((state && state.sites) || []);
      if (sites.length === 0) return null; // add a site first
      return {
        label: sites.length < 2 ? 'Add DR site + WAN link' : 'Link nearest sites (WAN)',
        apply: _applyAddSiteLink,
      };
    },
    'orbit.no-ground':           () => ({ label: 'Add a ground station',     apply: _applyAddGroundStation }),
    'orbit.no-orbiter':          () => ({ label: 'Add a LEO satellite',      apply: _applyAddLeoSat }),
    'orbit.no-uplink':           (state) => _uplinkFix(state),
    'orbit.uplink-not-crossing': (state) => _uplinkFix(state),
    'deepspace.no-unit':         () => ({ label: 'Add a Mars relay',         apply: _applyAddDsRelay }),
    'deepspace.no-handoff':      (state) => _handoffFix(state),
  };

  /**
   * fixitFor(code, state) → null | { label, apply(ctx) }
   *
   * apply(ctx) with ctx = { state, uid, snap } mutates ctx.state and
   * returns { ok, note }. The caller owns pushHistory / renderAll / toast.
   */
  function fixitFor(code, state) {
    const make = FIXES[code];
    if (!make) return null;
    return make(state || {});
  }

  root.fixitFor = fixitFor;
  root.GreyNetFixit = Object.assign(root.GreyNetFixit || {}, { fixitFor });

})(typeof window !== 'undefined' ? window : globalThis);
