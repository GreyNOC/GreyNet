"use strict";

/* =========================================================================
   GREYNET — PLANET GEOGRAPHIC METRICS

   Pure geographic math for the Planet (world map) view — no DOM access:
     greatCircleKm(lat1, lng1, lat2, lng2)
       → haversine surface distance in km (R = 6371).
     greatCircleSegments(lat1, lng1, lat2, lng2, n = 64)
       → geodesic sampled into n+1 {lat, lng} points, pre-split at the
         antimeridian so each returned array draws as ONE polyline in
         equirectangular space with no wrap-around artifact.
     subsolarPoint(dateMs)
       → {lat, lng} directly under the sun at that UTC instant.
     terminatorNightPolygon(dateMs, n = 180)
       → { points, poleLat } — closed polygon shading the night hemisphere
         on an equirectangular map.
     siteLinkMetrics(link, state)
       → { distanceKm, routeKm, latencyMs, medium, from, to } for a
         state.siteLinks entry, medium-aware (see LINK_MEDIA).

   Globals: siteLinkMetrics is exported as planetSiteLinkMetrics (the bare
   name is too generic for the shared global scope); everything is also
   grouped under the GreyNetPlanet namespace.
   ========================================================================= */

(function (root) {

  const DEG2RAD  = Math.PI / 180;
  const RAD2DEG  = 180 / Math.PI;
  const EARTH_KM = 6371;

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

  /* ---------------------------------------------------------------------
     Link medium model — one row per SITE_LINK_TYPES key in constants.js
     (wan, vpn, sdwan, mpls, leased at time of writing) plus a `default`.

     speedKmS 200,000 ≈ speed of light in glass (c / ~1.47 group index).
     routeFactor 1.4: real fiber is NOT laid along the geodesic — it follows
     roads, railways, and submarine-cable landing points, so long-haul route
     length runs ~1.4× the great-circle distance (a standard planning rule
     of thumb). All current link kinds ride terrestrial/submarine fiber:
     vpn and sdwan are overlays on the same WAN transport, mpls and leased
     are carrier fiber services. Add a row here (e.g. 'satellite' with a
     different speed/route model) to extend.
     --------------------------------------------------------------------- */
  const LINK_MEDIA = {
    wan:     { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 },
    vpn:     { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 }, // overlay on WAN transport
    sdwan:   { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 }, // overlay on internet/WAN fiber
    mpls:    { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 }, // carrier fiber
    leased:  { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 }, // dedicated carrier fiber
    default: { medium: 'fiber', speedKmS: 200000, routeFactor: 1.4 },
  };

  let _mediaChecked = false;
  function _mediumFor(type) {
    if (!_mediaChecked) {
      _mediaChecked = true;
      // One-time drift check against the live SITE_LINK_TYPES const: a link
      // kind added to constants.js still works (it falls back to `default`
      // below), but flag it so LINK_MEDIA gets a deliberate row.
      const declared = _g('SITE_LINK_TYPES');
      if (declared && typeof console !== 'undefined') {
        for (const k of Object.keys(declared)) {
          if (!LINK_MEDIA[k]) console.warn(`planet-metrics: no LINK_MEDIA row for site link type "${k}" — using fiber default.`);
        }
      }
    }
    return LINK_MEDIA[type] || LINK_MEDIA.default;
  }

  /* --------------------------- vector helpers --------------------------- */

  function _toVec(latDeg, lngDeg) {
    const lat = latDeg * DEG2RAD, lng = lngDeg * DEG2RAD;
    return {
      x: Math.cos(lat) * Math.cos(lng),
      y: Math.cos(lat) * Math.sin(lng),
      z: Math.sin(lat),
    };
  }
  function _toLatLng(v) {
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, v.z))) * RAD2DEG,
      lng: Math.atan2(v.y, v.x) * RAD2DEG,
    };
  }

  /* ------------------------- great-circle math -------------------------- */

  // Haversine surface distance in km (mean Earth radius 6371 km).
  function greatCircleKm(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLng = (lng2 - lng1) * DEG2RAD;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Sample the geodesic between two points into n+1 {lat, lng} points via
  // unit-vector slerp, then split at the antimeridian. Returns an ARRAY OF
  // POINT-ARRAYS: each inner array is one polyline that can be drawn in
  // equirectangular space without a horizontal wrap-around artifact. When a
  // pair of consecutive samples jumps more than 180° in longitude, a crossing
  // point is interpolated at ±180 on BOTH sides so both polylines visually
  // reach the map edge.
  function greatCircleSegments(lat1, lng1, lat2, lng2, n = 64, _depth = 0) {
    const a = _toVec(lat1, lng1);
    const b = _toVec(lat2, lng2);
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const omega = Math.acos(dot);

    // Degenerate / identical endpoints — nothing to sample.
    if (omega < 1e-9) return [[{ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }]];

    // Antipodal endpoints: the geodesic is ill-defined (infinitely many
    // halves, and the slerp denominator vanishes). Nudge the far endpoint's
    // latitude in ONE fixed direction (away from the +90 pole guard) — a
    // sign-dependent nudge oscillates forever when |lat2| is smaller than
    // the nudge and both signs stay inside the antipodal tolerance. The
    // 2e-4° step (≈3.5e-6 rad) always exits the 1e-6 rad tolerance in one
    // hop; the depth guard is a belt-and-braces stop.
    if (Math.PI - omega < 1e-6) {
      if (_depth >= 2) return [[{ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }]];
      const nudged = lat2 + (lat2 > 89.9 ? -2e-4 : 2e-4);
      return greatCircleSegments(lat1, lng1, nudged, lng2, n, _depth + 1);
    }

    const sinOmega = Math.sin(omega);
    const raw = [];
    for (let i = 0; i <= n; i++) {
      const t  = i / n;
      const k1 = Math.sin((1 - t) * omega) / sinOmega;
      const k2 = Math.sin(t * omega) / sinOmega;
      raw.push(_toLatLng({
        x: k1 * a.x + k2 * b.x,
        y: k1 * a.y + k2 * b.y,
        z: k1 * a.z + k2 * b.z,
      }));
    }

    // Split where consecutive longitudes jump by more than 180°.
    const segments = [];
    let current = [raw[0]];
    for (let i = 1; i <= n; i++) {
      const prev = raw[i - 1], pt = raw[i];
      const dLng = pt.lng - prev.lng;
      if (Math.abs(dLng) > 180) {
        // Unwrap pt's longitude so it's continuous with prev, then find the
        // fraction of the step at which the path hits the map edge. Latitude
        // is interpolated linearly — fine at this sample density.
        const unwrapped = pt.lng - Math.sign(dLng) * 360;
        const edge      = dLng < 0 ? 180 : -180; // edge on prev's side
        const f         = (edge - prev.lng) / (unwrapped - prev.lng);
        const crossLat  = prev.lat + f * (pt.lat - prev.lat);
        current.push({ lat: crossLat, lng: edge });
        segments.push(current);
        current = [{ lat: crossLat, lng: -edge }, pt];
      } else {
        current.push(pt);
      }
    }
    segments.push(current);
    return segments;
  }

  /* ---------------------------- sun position ---------------------------- */

  // {lat, lng} of the point directly under the sun at the given UTC time.
  // Declination via the standard day-of-year cosine approximation (±0.5°),
  // longitude from UTC fractional hours corrected by the equation of time
  // (approximate three-term form) — the sun crosses lng 0 at ~12:00 UTC.
  function subsolarPoint(dateMs) {
    const d   = new Date(dateMs);
    const doy = Math.floor((dateMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;

    const declDeg = -23.44 * Math.cos((2 * Math.PI / 365) * (doy + 10));

    // Equation of time, minutes (Whitman/"9.87 sin 2B" approximation).
    const B   = (2 * Math.PI * (doy - 81)) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

    const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 +
                     d.getUTCSeconds() / 3600 + d.getUTCMilliseconds() / 3600000;

    // Sun moves 15°/h westward; normalize into [-180, 180).
    let lng = -15 * (utcHours - 12 + eot / 60);
    lng = ((lng % 360) + 540) % 360 - 180;

    return { lat: declDeg, lng };
  }

  // Closed polygon covering the NIGHT hemisphere in equirectangular space.
  // For each of n+1 longitudes across [-180, 180] the terminator latitude is
  //   atan(-cos(hourAngle) / tan(decl)),  hourAngle relative to subsolar lng.
  // The night hemisphere contains the pole OPPOSITE the sun's declination
  // (sun north of the equator → antarctic night), so the polygon is closed
  // with two corner points along that pole's map edge; filling the result
  // shades the night side. Returns { points, poleLat } — points already
  // include the two closing corners (n+3 points total).
  function terminatorNightPolygon(dateMs, n = 180) {
    const sun     = subsolarPoint(dateMs);
    const declRad = sun.lat * DEG2RAD;

    // Near an equinox tan(decl) → 0 and the terminator degenerates into a
    // meridian pair; clamp to a tiny epsilon (sign-preserving) so we never
    // divide by zero — the curve then hugs ±90 and still shades ~half the map.
    let tanDecl = Math.tan(declRad);
    if (Math.abs(tanDecl) < 1e-9) tanDecl = tanDecl >= 0 ? 1e-9 : -1e-9;

    const points = [];
    for (let i = 0; i <= n; i++) {
      const lng = -180 + (360 * i) / n;
      const h   = (lng - sun.lng) * DEG2RAD; // hour angle from subsolar meridian
      points.push({ lat: Math.atan(-Math.cos(h) / tanDecl) * RAD2DEG, lng });
    }

    const poleLat = tanDecl >= 0 ? -90 : 90; // pole opposite the sun
    points.push({ lat: poleLat, lng: 180 });
    points.push({ lat: poleLat, lng: -180 });

    return { points, poleLat };
  }

  /* --------------------------- site link metrics ------------------------ */

  // Distance + medium-aware one-way latency for a state.siteLinks entry
  // ({ fromSiteId, toSiteId, type }). Sites are resolved from state.sites by
  // id; a dangling endpoint returns null. routeKm applies the medium's
  // route factor (see LINK_MEDIA) before converting to milliseconds.
  function siteLinkMetrics(link, state) {
    if (!link) return null;
    const sites = (state && state.sites) || [];
    const from  = sites.find(s => s.id === link.fromSiteId);
    const to    = sites.find(s => s.id === link.toSiteId);
    if (!from || !to) return null;

    const def        = _mediumFor(link.type);
    const distanceKm = greatCircleKm(from.lat, from.lng, to.lat, to.lng);
    const routeKm    = distanceKm * def.routeFactor;
    const latencyMs  = (routeKm / def.speedKmS) * 1000;

    return {
      distanceKm,
      routeKm,
      latencyMs,
      medium: def.medium,
      from: from.name || from.id,
      to:   to.name   || to.id,
    };
  }

  root.greatCircleKm          = greatCircleKm;
  root.greatCircleSegments    = greatCircleSegments;
  root.subsolarPoint          = subsolarPoint;
  root.terminatorNightPolygon = terminatorNightPolygon;
  // Bare "siteLinkMetrics" is too generic for the shared global scope —
  // exported with a planet- prefix; the namespace keeps the natural name.
  root.planetSiteLinkMetrics  = siteLinkMetrics;

  root.GreyNetPlanet = {
    greatCircleKm,
    greatCircleSegments,
    subsolarPoint,
    terminatorNightPolygon,
    siteLinkMetrics,
  };

})(typeof window !== 'undefined' ? window : globalThis);
