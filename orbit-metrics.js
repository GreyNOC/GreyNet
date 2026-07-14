"use strict";

/* =========================================================================
   GREYNET — ORBIT LINK METRICS + VALIDATION

   Wraps the internal spaceLinkMetrics(a,b) into a richer, user-facing
   summary used by the Properties panel and validation:
     orbitLinkSummary(linkId, state)
       → { distanceKm, latencyMs, occluded, linkType, from, to, valid, issues }
     orbitValidate(state)
       → { ok, issues:[{ id, kind, message }] }
     orbitGroundLinkedToPlanet(state)
       → bool — true if at least one ground station's location matches
                a planet site or planet ground_uplink infra (heuristic by
                lat/lng).
   ========================================================================= */

(function (root) {

  const C_KMS = 299792.458;

  // `const`-declared top-level identifiers in constants.js don't attach to
  // window. We can't reference them by bare name from inside this IIFE either
  // (it has its own scope chain), so we grab references via `new Function`
  // which runs in the global scope where the const bindings ARE visible.
  // Cached on first access.
  const _cache = {};
  function _g(name) {
    if (_cache[name] !== undefined) return _cache[name];
    let v = null;
    try { /* eslint-disable-next-line no-new-func */
      v = (new Function('try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : null; } catch (_) { return null; }'))();
    } catch (_) { v = null; }
    _cache[name] = v;
    return v;
  }

  function _asset(id, state) {
    return (state.spaceAssets || []).find(a => a.id === id);
  }
  function _linkDef(type) {
    return (_g('SPACE_LINK_TYPES') || {})[type] || null;
  }
  function _altLabel(asset) {
    if (!asset) return '—';
    if (asset.type === 'ground_station') return 'Ground';
    const alts = _g('ORBIT_ALTITUDES') || {};
    const k = asset.orbit;
    if (alts[k]) return alts[k].label + ` (~${alts[k].km.toLocaleString()} km)`;
    return '—';
  }

  // Fallback-only equatorial embedding. The REAL numbers come from app.js's
  // spaceLinkMetrics (see _linkPhysics) so the validator can never disagree
  // with the canvas labels; this runs only if app.js failed to load.
  function _vectorKm(a) {
    const types = _g('SPACE_ASSET_TYPES');
    const alts  = _g('ORBIT_ALTITUDES');
    if (!types || !alts) return null;
    const def = types[a.type] || types.satellite_leo;
    const orbitKey = a.type === 'ground_station' ? 'ground' : (a.orbit || def.orbit || 'leo');
    // Same frame for ground and satellites (X right, Y up, rim/orbit plane
    // z=0-ish) — mixing frames made uplink occlusion contradict the screen.
    const ang = a.angle || (orbitKey === 'ground' ? Math.atan2(a.y || 0, a.x || 1) : 0);
    const radiusKm = orbitKey === 'ground' ? 6371 : 6371 + (alts[orbitKey] || alts.leo).km;
    return { x: radiusKm * Math.cos(ang), y: -radiusKm * Math.sin(ang), z: 0, orbitKey };
  }

  function _linkPhysics(a, b) {
    // Single source of truth: delegate to app.js's spaceLinkMetrics — the
    // same math that draws the canvas link labels. A reimplementation here
    // (the old code) drifted: it ignored orbital inclination/RAAN and used a
    // different ground-station frame, so the Properties panel could show
    // "LOS: Clear" while this validator said "occulted" for the same link.
    const shared = root.spaceLinkMetrics;
    if (typeof shared === 'function') {
      try {
        const m = shared(a, b);
        return { distanceKm: m.distanceKm, latencyMs: m.latencyMs, occluded: !!m.occulted };
      } catch (_) { /* fall through to local model */ }
    }
    const va = _vectorKm(a), vb = _vectorKm(b);
    if (!va || !vb) return { distanceKm: null, latencyMs: null, occluded: false };
    const dx = vb.x - va.x, dy = vb.y - va.y, dz = vb.z - va.z;
    const distanceKm = Math.hypot(dx, dy, dz);
    const latencyMs  = (distanceKm / C_KMS) * 1000;
    let occluded = false;
    const aGround = a.type === 'ground_station', bGround = b.type === 'ground_station';
    if (aGround !== bGround) {
      const g = aGround ? va : vb;
      const s = aGround ? vb : va;
      occluded = ((s.x - g.x) * g.x + (s.y - g.y) * g.y + (s.z - g.z) * g.z) <= 0;
    } else if (!aGround && !bGround) {
      const seg2 = dx * dx + dy * dy + dz * dz;
      const t = seg2 ? Math.max(0, Math.min(1, -(va.x * dx + va.y * dy + va.z * dz) / seg2)) : 0;
      const cx = va.x + dx * t, cy = va.y + dy * t, cz = va.z + dz * t;
      occluded = t > 0.02 && t < 0.98 && Math.hypot(cx, cy, cz) < 6371;
    }
    return { distanceKm, latencyMs, occluded };
  }

  function orbitLinkSummary(linkId, state) {
    const link = (state.spaceLinks || []).find(l => l.id === linkId);
    if (!link) return null;
    const a = _asset(link.fromAssetId, state);
    const b = _asset(link.toAssetId, state);
    const def = _linkDef(link.type);
    if (!a || !b) {
      return {
        id: link.id, valid: false,
        linkType: link.type, label: def ? def.label : link.type,
        from: a ? (a.label || a.id) : '(missing)',
        to:   b ? (b.label || b.id) : '(missing)',
        issues: ['Endpoint missing — link references a deleted asset.'],
      };
    }
    const phys = _linkPhysics(a, b);
    const issues = [];
    const uplinkKinds = new Set(['uplink','downlink','feeder']);
    if (uplinkKinds.has(link.type)) {
      const aG = a.type === 'ground_station', bG = b.type === 'ground_station';
      if (aG === bG) issues.push(`A ${def?.label || link.type} should connect ground↔orbit.`);
    }
    if (phys.occluded) issues.push('Line of sight blocked by Earth (occulted).');
    if (phys.distanceKm != null && phys.distanceKm < 50 && a.type !== 'ground_station' && b.type !== 'ground_station') {
      issues.push('Two assets are unrealistically close (<50 km).');
    }
    return {
      id: link.id, valid: issues.length === 0,
      linkType: link.type, label: def ? def.label : link.type,
      from: a.label || a.id,
      to:   b.label || b.id,
      fromAltitude: _altLabel(a),
      toAltitude:   _altLabel(b),
      distanceKm: phys.distanceKm,
      latencyMs:  phys.latencyMs,
      occluded:   phys.occluded,
      issues,
    };
  }

  function orbitValidate(state) {
    const issues = [];
    const assets = state.spaceAssets || [];
    const links  = state.spaceLinks  || [];

    // Validate each link
    for (const l of links) {
      const s = orbitLinkSummary(l.id, state);
      if (!s) continue;
      for (const msg of s.issues) {
        issues.push({ id: l.id, kind: 'link', message: msg });
      }
    }

    // Orphaned assets
    const touched = new Set();
    links.forEach(l => { touched.add(l.fromAssetId); touched.add(l.toAssetId); });
    for (const a of assets) {
      if (!touched.has(a.id)) {
        issues.push({ id: a.id, kind: 'asset', message: `Orbital asset "${a.label || a.type}" has no links.` });
      }
    }

    // No ground station at all
    const grounds = assets.filter(a => a.type === 'ground_station');
    if (assets.length > 0 && grounds.length === 0) {
      issues.push({ id: null, kind: 'topology', message: 'No ground station — orbit network has no Earth-side anchor.' });
    }

    return { ok: issues.length === 0, issues };
  }

  function orbitGroundLinkedToPlanet(state) {
    const grounds = (state.spaceAssets || []).filter(a => a.type === 'ground_station');
    if (grounds.length === 0) return false;
    const sites = state.sites || [];
    const uplinks = (state.planetInfra || []).filter(p => p.type === 'ground_uplink');
    // Heuristic match by props.lat/lng on ground station vs site/uplink lat/lng.
    for (const g of grounds) {
      const lat = parseFloat(g.props?.lat), lng = parseFloat(g.props?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const matchSite = sites.find(s =>
        Math.abs(s.lat - lat) < 2 && Math.abs(s.lng - lng) < 2);
      const matchInfra = uplinks.find(u =>
        Math.abs(u.lat - lat) < 2 && Math.abs(u.lng - lng) < 2);
      if (matchSite || matchInfra) return true;
    }
    // Fallback: if there is at least one ground station and at least one uplink
    // infra, treat that as planet-linked (the user explicitly created both).
    return grounds.length >= 1 && uplinks.length >= 1;
  }

  root.orbitLinkSummary           = orbitLinkSummary;
  root.orbitValidate              = orbitValidate;
  root.orbitGroundLinkedToPlanet  = orbitGroundLinkedToPlanet;

})(typeof window !== 'undefined' ? window : globalThis);
